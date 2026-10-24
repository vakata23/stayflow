-- =====================================================================
-- StayFlow — Миграция 015: пакети и оферти за престой („6+1“, отстъпка за по-дълъг престой, фиксирана цена,
-- ранно записване, последна минута)
--
-- Собственикът задава за имота пакети; гостът ги вижда на страницата, а цената в quote_stay се смята сама.
-- Пет вида:
--   free_nights  — „6+1“: платете paid_nights, останете paid_nights + free_nights (безплатни са най-евтините нощувки);
--                  repeat_block = важи за всеки пълен блок (при 14 нощувки по 6+1 — две безплатни)
--   percent_off  — отстъпка percent % от min_nights нощувки нагоре (седмица −10%, месец −25%)
--   fixed_price  — точно fixed_nights нощувки за обща цена fixed_total (по избор само при настаняване в checkin_weekday)
--   early_bird   — резервация поне days_before дни преди настаняването: −percent %
--   last_minute  — настаняване до days_before дни от днес: −percent %
-- Пакетът важи, ако настаняването е в [valid_from, valid_to] (празно = винаги) и is_active. При няколко подходящи
-- се прилага ЕДИН — най-изгодният за госта (отстъпките не се събират). Отстъпката е върху нощувките
-- (не върху таксата за почистване и туристическия данък).
--
-- Зависи от миграция 014 (сезоните влизат в цената на нощувките) — пуска се СЛЕД нея. Безопасна за повторно пускане.
-- НЕ пипа public_property (там чака миграция 013).
-- =====================================================================

do $$
begin
  if to_regclass('public.price_seasons') is null then
    raise exception 'Пуснете първо миграция 014 (сезонни цени) — 015 я допълва.';
  end if;
end $$;

-- 1. Таблицата ---------------------------------------------------------
create table if not exists public.stay_packages (
  id              uuid primary key default gen_random_uuid(),
  property_id     uuid not null references public.properties (id) on delete cascade,
  kind            text not null check (kind in ('free_nights', 'percent_off', 'fixed_price', 'early_bird', 'last_minute')),
  name            text check (name is null or char_length(name) <= 60),
  is_active       boolean not null default true,

  paid_nights     integer check (paid_nights is null or paid_nights between 1 and 365),
  free_nights     integer check (free_nights is null or free_nights between 1 and 365),
  repeat_block    boolean not null default false,

  min_nights      integer check (min_nights is null or min_nights between 1 and 365),
  percent         numeric(5, 2) check (percent is null or (percent > 0 and percent <= 90)),

  fixed_nights    integer check (fixed_nights is null or fixed_nights between 1 and 365),
  fixed_total     numeric(10, 2) check (fixed_total is null or fixed_total > 0),
  checkin_weekday smallint check (checkin_weekday is null or checkin_weekday between 1 and 7), -- ISO: 1 = понеделник … 7 = неделя

  days_before     integer check (days_before is null or days_before between 0 and 730),

  valid_from      date,
  valid_to        date,
  created_at      timestamptz not null default now(),

  constraint stay_packages_valid_dates check (valid_from is null or valid_to is null or valid_to >= valid_from),
  constraint stay_packages_params check (
    case kind
      when 'free_nights' then paid_nights is not null and free_nights is not null
      when 'percent_off' then min_nights is not null and percent is not null
      when 'fixed_price' then fixed_nights is not null and fixed_total is not null
      when 'early_bird'  then days_before is not null and days_before >= 1 and percent is not null
      when 'last_minute' then days_before is not null and percent is not null
    end
  )
);

create index if not exists idx_stay_packages_property on public.stay_packages (property_id);

-- 2. RLS — само собственикът на имота (както pricing_rules и price_seasons) ----------
alter table public.stay_packages enable row level security;

drop policy if exists "stay_packages_select_own" on public.stay_packages;
create policy "stay_packages_select_own" on public.stay_packages
  for select using (public.owns_property(property_id));

drop policy if exists "stay_packages_insert_own" on public.stay_packages;
create policy "stay_packages_insert_own" on public.stay_packages
  for insert with check (public.owns_property(property_id));

drop policy if exists "stay_packages_update_own" on public.stay_packages;
create policy "stay_packages_update_own" on public.stay_packages
  for update using (public.owns_property(property_id))
  with check (public.owns_property(property_id));

drop policy if exists "stay_packages_delete_own" on public.stay_packages;
create policy "stay_packages_delete_own" on public.stay_packages
  for delete using (public.owns_property(property_id));

-- 3. quote_stay с отстъпка от пакет ----------------------------------------------
-- Две нови колони накрая (discount, package_id) — затова функцията се създава наново (при смяна на колоните
-- create or replace не стига). Старите колони и правата са същите; accommodation_total остава СУМАТА ПРЕДИ отстъпката,
-- total = accommodation_total − discount + cleaning_fee.
drop function if exists public.quote_stay(text, date, date, int);

create function public.quote_stay(
  p_slug text, p_check_in date, p_check_out date, p_guests int
)
returns table (
  nights               int,
  accommodation_total  numeric,
  cleaning_fee         numeric,
  tourist_tax          numeric,
  total                numeric,
  deposit              numeric,
  min_nights           int,
  fits_guests          boolean,
  is_available         boolean,
  discount             numeric,
  package_id           uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  prop    public.properties;
  s       public.property_settings;
  pk      public.stay_packages;
  v_night date;
  v_price numeric;
  v_min   int;
  v_today date;
  v_nightly numeric;
  v_prices  numeric[] := '{}';
  v_saving  numeric;
  v_best    numeric := 0;
  v_best_id uuid;
  v_free    int;
  v_ahead   int;
begin
  v_today := (now() at time zone 'Europe/Sofia')::date;

  select * into prop from public.properties where slug = p_slug and is_listed = true;
  if prop.id is null or p_check_out <= p_check_in or p_guests < 1 or p_check_in < v_today then
    return;
  end if;

  select * into s from public.property_settings where property_id = prop.id;

  nights := p_check_out - p_check_in;
  accommodation_total := 0;
  min_nights := 1;
  v_night := p_check_in;
  while v_night < p_check_out loop
    v_price := null;
    v_min := null;
    -- 1) правило за конкретни дати
    select r.price_per_night, r.min_nights into v_price, v_min
      from public.pricing_rules r
     where r.property_id = prop.id
       and v_night >= r.start_date and v_night <= r.end_date
     order by r.created_at desc
     limit 1;
    -- 2) сезон, който се повтаря всяка година
    if v_price is null then
      select sn.price_per_night, sn.min_nights into v_price, v_min
        from public.price_seasons sn
       where sn.property_id = prop.id
         and public.season_covers(sn.start_month, sn.start_day, sn.end_month, sn.end_day, v_night)
       order by sn.created_at desc
       limit 1;
    end if;
    -- 3) основна цена
    v_nightly := coalesce(v_price, s.base_price, 0);
    v_prices := array_append(v_prices, v_nightly);
    accommodation_total := accommodation_total + v_nightly;
    if v_night = p_check_in then
      min_nights := coalesce(v_min, 1);
    end if;
    v_night := v_night + 1;
  end loop;
  accommodation_total := round(accommodation_total, 2);

  -- Пакети: от всички подходящи се взема най-голямата отстъпка (при равенство — по-рано създаденият)
  v_ahead := p_check_in - v_today;
  for pk in
    select * from public.stay_packages
     where property_id = prop.id
       and is_active
       and (valid_from is null or p_check_in >= valid_from)
       and (valid_to is null or p_check_in <= valid_to)
     order by created_at, id
  loop
    v_saving := 0;
    if pk.kind = 'free_nights' then
      if nights >= pk.paid_nights + pk.free_nights then
        v_free := least(
          case when pk.repeat_block then (nights / (pk.paid_nights + pk.free_nights)) * pk.free_nights else pk.free_nights end,
          nights
        );
        -- безплатни са най-евтините нощувки
        select coalesce(sum(x), 0) into v_saving
          from (select x from unnest(v_prices) as x order by x asc limit v_free) cheapest;
      end if;
    elsif pk.kind = 'percent_off' then
      if nights >= pk.min_nights then
        v_saving := accommodation_total * pk.percent / 100.0;
      end if;
    elsif pk.kind = 'fixed_price' then
      if nights = pk.fixed_nights
         and (pk.checkin_weekday is null or extract(isodow from p_check_in)::int = pk.checkin_weekday)
         and pk.fixed_total < accommodation_total then
        v_saving := accommodation_total - pk.fixed_total;
      end if;
    elsif pk.kind = 'early_bird' then
      if v_ahead >= pk.days_before then
        v_saving := accommodation_total * pk.percent / 100.0;
      end if;
    elsif pk.kind = 'last_minute' then
      if v_ahead <= pk.days_before then
        v_saving := accommodation_total * pk.percent / 100.0;
      end if;
    end if;
    v_saving := round(least(v_saving, accommodation_total), 2);
    if v_saving > v_best then
      v_best := v_saving;
      v_best_id := pk.id;
    end if;
  end loop;
  discount := v_best;
  package_id := v_best_id;

  cleaning_fee := coalesce(s.cleaning_fee, 0);
  -- Турист таксата е отделна от total (виж 006/004).
  tourist_tax  := round(coalesce(s.tourist_tax, 0) * p_guests * nights, 2);
  total        := round(accommodation_total - discount + cleaning_fee, 2);
  deposit      := round(total * coalesce(s.deposit_pct, 30) / 100.0, 2);
  fits_guests  := p_guests <= prop.max_guests;
  -- Само bookings блокира дати (confirmed/pending) — booking_requests не участва нарочно.
  is_available := not exists (
    select 1 from public.bookings b
    where b.property_id = prop.id
      and b.status <> 'cancelled'
      and daterange(b.check_in, b.check_out, '[)') && daterange(p_check_in, p_check_out, '[)')
  );
  return next;
end;
$$;

revoke all on function public.quote_stay(text, date, date, int) from public;
grant execute on function public.quote_stay(text, date, date, int) to anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.quote_stay(text, date, date, int) to service_role; -- Netlify функцията за заявки
  end if;
end $$;

-- 4. public_packages(slug): активните пакети на публикуван имот за страницата на госта --------
-- Само параметрите на пакета (без собственик, без id на имота); изтеклите (valid_to < днес) не се връщат.
drop function if exists public.public_packages(text);

create function public.public_packages(p_slug text)
returns table (
  id              uuid,
  kind            text,
  name            text,
  paid_nights     int,
  free_nights     int,
  repeat_block    boolean,
  min_nights      int,
  percent         numeric,
  fixed_nights    int,
  fixed_total     numeric,
  checkin_weekday int,
  days_before     int,
  valid_from      date,
  valid_to        date
)
language sql
stable
security definer
set search_path = public
as $$
  select k.id, k.kind, k.name, k.paid_nights, k.free_nights, k.repeat_block, k.min_nights, k.percent,
         k.fixed_nights, k.fixed_total, k.checkin_weekday::int, k.days_before, k.valid_from, k.valid_to
  from public.stay_packages k
  join public.properties p on p.id = k.property_id
  where p.slug = p_slug and p.is_listed = true
    and k.is_active
    and (k.valid_to is null or k.valid_to >= (now() at time zone 'Europe/Sofia')::date)
  order by k.created_at, k.id;
$$;

revoke execute on function public.public_packages(text) from public;
grant execute on function public.public_packages(text) to anon, authenticated;

select 'Миграция 015 е пусната успешно' as status;
