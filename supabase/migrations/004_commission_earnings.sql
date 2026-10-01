-- =====================================================================
-- STAYFLOW — Миграция 004: Комисиони, плащания и приходи на собственика
-- Изпълнете в Supabase SQL Editor СЛЕД 003_guest_card.sql.
--
-- Адаптирано от local-business-playbook (assets/supabase/02-bookings.sql
-- и 04-earnings.sql) към таблиците на StayFlow. Разлики от оригинала,
-- защото StayFlow няма ниво "businesses" (собствеността е директно през
-- properties.owner_id):
--   - lodging_settings → property_settings, PER ИМОТ (не per-бизнес) —
--     различни имоти може да имат различна комисия/такса/депозит.
--   - units/rates отпадат — properties вече Е единицата, pricing_rules
--     вече играе ролята на rates.
--   - earnings_by_month/earnings_by_unit → earnings_by_month/
--     earnings_by_property, БЕЗ параметър за бизнес/собственик — разчитат
--     изцяло на RLS (security invoker + owns_property/current_profile_id),
--     което е по-просто и изключва грешка при подаден чужд id.
--   - „Спестена комисиона" се смята per-нощувка със собствената ставка на
--     имота на тази нощувка (по-точно от оригинала при собственик с
--     няколко имота на различни комисионни).
--   - Без суфикс _eur/_bgn по колоните — както съществуващите total_price/
--     price_per_night/amount в StayFlow, валутата не е закодирана в името.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Настройки по имот
-- ---------------------------------------------------------------------
create table public.property_settings (
  property_id        uuid primary key references public.properties (id) on delete cascade,
  ota_commission_pct numeric(4, 1) not null default 15.0 check (ota_commission_pct between 0 and 50),
  tourist_tax        numeric(6, 2) not null default 0,   -- на гост на нощувка
  cleaning_fee       numeric(8, 2) not null default 0,   -- за целия престой
  deposit_pct        smallint not null default 30 check (deposit_pct between 0 and 100),
  created_at         timestamptz not null default now()
);

alter table public.property_settings enable row level security;

create policy "property_settings_select_own" on public.property_settings
  for select using (public.owns_property(property_id));

create policy "property_settings_insert_own" on public.property_settings
  for insert with check (public.owns_property(property_id));

create policy "property_settings_update_own" on public.property_settings
  for update using (public.owns_property(property_id))
  with check (public.owns_property(property_id));

create policy "property_settings_delete_own" on public.property_settings
  for delete using (public.owns_property(property_id));

-- ---------------------------------------------------------------------
-- 2. Канали за връзка с госта (не само Viber)
-- Формат: [{"type":"whatsapp","value":"+359888123456"},{"type":"viber","value":"+359888000000"}]
-- Позволени типове (проверени от приложението, не от базата, за гъвкавост):
-- phone, sms, viber, whatsapp, telegram, messenger, instagram, email
-- ---------------------------------------------------------------------
alter table public.properties
  add column if not exists channels jsonb not null default '[]'::jsonb
  check (jsonb_typeof(channels) = 'array');

-- ---------------------------------------------------------------------
-- 3. Комисиона и туристически данък към резервацията
--
-- Дефиниции (показвайте ги в интерфейса — собствениците вярват само на
-- числа, които могат да проверят):
--   total_price  цена на престоя (вкл. такса почистване, без туристически
--                данък), разпределена по нощувки в месеца на всяка нощувка.
--   commission   каквото Booking/Airbnb задържат — платформена комисиона
--                при source in ('airbnb','booking'); 0 при директна
--                резервация (manual/direct).
--   net          total_price − commission.
-- ---------------------------------------------------------------------
alter table public.bookings
  add column if not exists commission numeric(10, 2) not null default 0 check (commission >= 0);

alter table public.bookings
  add column if not exists tourist_tax numeric(8, 2) not null default 0;

-- ---------------------------------------------------------------------
-- 4. Плащания и остатъци
-- ---------------------------------------------------------------------
create table public.payments (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references public.bookings (id) on delete cascade,
  kind         text not null check (kind in ('deposit', 'balance', 'refund')),
  amount       numeric(10, 2) not null check (amount > 0),
  method       text not null check (method in ('bank', 'card', 'cash', 'revolut', 'stripe', 'other')),
  paid_at      timestamptz not null default now(),
  external_ref text,                                    -- Stripe payment intent, банкова референция
  note         text
);

create index idx_payments_booking on public.payments (booking_id);

alter table public.payments enable row level security;

create policy "payments_select_own" on public.payments
  for select using (public.owns_booking(booking_id));

create policy "payments_insert_own" on public.payments
  for insert with check (public.owns_booking(booking_id));

create policy "payments_update_own" on public.payments
  for update using (public.owns_booking(booking_id))
  with check (public.owns_booking(booking_id));

create policy "payments_delete_own" on public.payments
  for delete using (public.owns_booking(booking_id));

-- Сума, която собственикът трябва да получи за резервацията: престой +
-- туристически данък − платформена комисиона (директен гост плаща
-- всичко; Booking/Airbnb изплащат престоя минус тяхната комисиона).
create view public.booking_balances with (security_invoker = true) as
select
  b.id as booking_id,
  b.property_id,
  b.guest_name,
  b.check_in,
  b.check_out,
  b.status,
  b.source,
  coalesce(b.total_price, 0) + b.tourist_tax - b.commission as due,
  coalesce(sum(case when p.kind = 'refund' then -p.amount else p.amount end), 0) as paid,
  coalesce(b.total_price, 0) + b.tourist_tax - b.commission
    - coalesce(sum(case when p.kind = 'refund' then -p.amount else p.amount end), 0) as outstanding
from public.bookings b
left join public.payments p on p.booking_id = b.id
group by b.id;

revoke select on public.booking_balances from anon;

-- ---------------------------------------------------------------------
-- 5. Приходи по месеци
--
-- Всички функции са SECURITY INVOKER — изпълняват се с правата на
-- викащия, затова RLS на properties/bookings прилага изолацията:
-- собственик, викащ ги за чужди имоти, вижда нули, никога чужди данни.
-- Без параметър за собственик/бизнес — няма начин да се подаде грешен id.
--
-- occupancy    продадени нощувки / (брой имоти × дни в периода)
-- ADR          приход / продадени нощувки.   RevPAR   приход / налични нощувки.
-- спестена комисиона  пряк приход × комисионната ставка на ИМОТА на всяка
--                      нощувка (property_settings.ota_commission_pct,
--                      15% по подразбиране) — колко би коствало на платформа.
-- Бъдещи дати дават "на книга" приход за предстоящите месеци.
-- ---------------------------------------------------------------------
create or replace function public.earnings_by_month(p_from date, p_to date)
returns table (
  month date, available_nights int, nights_sold int, occupancy_pct numeric,
  revenue numeric, commission numeric, net numeric, adr numeric, revpar numeric,
  direct_revenue numeric, ota_revenue numeric, direct_share_pct numeric, commission_saved numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with months as (
    select m::date as month_start,
           greatest(m::date, p_from) as d_from,
           least((m + interval '1 month')::date - 1, p_to) as d_to
    from generate_series(date_trunc('month', p_from::timestamp),
                         date_trunc('month', p_to::timestamp), interval '1 month') as m
  ),
  nights as (
    select
      d::date as night,
      b.source in ('airbnb', 'booking') as is_ota,
      b.total_price / (b.check_out - b.check_in) as rev,
      b.commission / (b.check_out - b.check_in) as comm,
      coalesce(ps.ota_commission_pct, 15.0) as pct
    from public.bookings b
    left join public.property_settings ps on ps.property_id = b.property_id
    cross join lateral generate_series(greatest(b.check_in, p_from)::timestamp,
                                       least(b.check_out - 1, p_to)::timestamp,
                                       interval '1 day') as d
    where b.status = 'confirmed'
      and b.total_price is not null
      and b.check_in <= p_to and b.check_out > p_from
  ),
  property_count as (
    select count(*)::int as n from public.properties
  )
  select
    mo.month_start,
    pc.n * (mo.d_to - mo.d_from + 1),
    count(n.night)::int,
    round(100.0 * count(n.night) / nullif(pc.n * (mo.d_to - mo.d_from + 1), 0), 1),
    round(coalesce(sum(n.rev), 0), 2),
    round(coalesce(sum(n.comm), 0), 2),
    round(coalesce(sum(n.rev), 0) - coalesce(sum(n.comm), 0), 2),
    round(sum(n.rev) / nullif(count(n.night), 0), 2),
    round(coalesce(sum(n.rev), 0) / nullif(pc.n * (mo.d_to - mo.d_from + 1), 0), 2),
    round(coalesce(sum(n.rev) filter (where not n.is_ota), 0), 2),
    round(coalesce(sum(n.rev) filter (where n.is_ota), 0), 2),
    round(100.0 * sum(n.rev) filter (where not n.is_ota) / nullif(sum(n.rev), 0), 1),
    round(coalesce(sum(n.rev * n.pct / 100.0) filter (where not n.is_ota), 0), 2)
  from months mo
  cross join property_count pc
  left join nights n on n.night between mo.d_from and mo.d_to
  group by mo.month_start, mo.d_from, mo.d_to, pc.n
  order by mo.month_start;
$$;

-- ---------------------------------------------------------------------
-- 6. Приходи по имот
-- ---------------------------------------------------------------------
create or replace function public.earnings_by_property(p_from date, p_to date)
returns table (
  property_id uuid, property_name text, nights_sold int, occupancy_pct numeric,
  revenue numeric, net numeric, adr numeric, direct_share_pct numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with nights as (
    select
      b.property_id,
      b.source in ('airbnb', 'booking') as is_ota,
      b.total_price / (b.check_out - b.check_in) as rev,
      b.commission / (b.check_out - b.check_in) as comm
    from public.bookings b
    cross join lateral generate_series(greatest(b.check_in, p_from)::timestamp,
                                       least(b.check_out - 1, p_to)::timestamp,
                                       interval '1 day') as d
    where b.status = 'confirmed'
      and b.total_price is not null
      and b.check_in <= p_to and b.check_out > p_from
  )
  select
    p.id,
    p.name,
    count(n.rev)::int,
    round(100.0 * count(n.rev) / (p_to - p_from + 1), 1),
    round(coalesce(sum(n.rev), 0), 2),
    round(coalesce(sum(n.rev), 0) - coalesce(sum(n.comm), 0), 2),
    round(sum(n.rev) / nullif(count(n.rev), 0), 2),
    round(100.0 * sum(n.rev) filter (where not n.is_ota) / nullif(sum(n.rev), 0), 1)
  from public.properties p
  left join nights n on n.property_id = p.id
  group by p.id, p.name
  order by coalesce(sum(n.rev), 0) desc;
$$;

-- Postgres дава EXECUTE на PUBLIC по подразбиране — отнемаме от PUBLIC,
-- не само от anon (същата предпазна мярка като в 002/003).
revoke execute on function public.earnings_by_month(date, date) from public, anon;
revoke execute on function public.earnings_by_property(date, date) from public, anon;
grant execute on function public.earnings_by_month(date, date) to authenticated;
grant execute on function public.earnings_by_property(date, date) to authenticated;

-- =====================================================================
-- КРАЙ НА МИГРАЦИЯ 004
-- =====================================================================
