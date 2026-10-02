-- =====================================================================
-- STAYFLOW — Миграция 006: Публичен сайт за резервации (заявки, без плащане)
-- Изпълнете в Supabase SQL Editor СЛЕД 005_bookings_sold.sql.
--
-- Написана да може да се пусне ПОВТОРНО без грешка (if not exists /
-- create or replace / drop policy if exists навсякъде).
--
-- Архитектура:
--   /stay/<slug>  → public_property(slug)  → маркетингови данни, БЕЗ id
--                 → quote_stay(slug,...)   → цена/наличност, БЕЗ id
--   Гост изпраща заявка → ОТДЕЛНА таблица booking_requests (НЕ bookings!),
--     защото bookings_no_overlap би заключил датите от спам заявки.
--   Собственик приема → създава се ред в bookings (source='direct').
--   Записът на заявката става само през Netlify функция със service role
--     ключ (Етап 4б) — затова тук НЯМА insert policy за anon/authenticated
--     върху booking_requests; RLS разрешава само select/update/delete на
--     собственика. Service role винаги заобикаля RLS.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Нови колони на properties — маркетингова витрина
-- ---------------------------------------------------------------------
alter table public.properties
  add column if not exists slug text unique
  check (slug is null or slug ~ '^[a-z0-9-]{2,40}$');

alter table public.properties
  add column if not exists is_listed boolean not null default false;

alter table public.properties
  add column if not exists public_description text;

-- Базова цена на нощувка, когато нито едно pricing_rules правило не
-- покрива деня — живее в property_settings при другите парични настройки
-- (комисиона/турист такса/почистване/капаро), не на properties.
alter table public.property_settings
  add column if not exists base_price numeric(10, 2) not null default 0;

-- ---------------------------------------------------------------------
-- 2. public_property(slug) — само маркетингови полета, НИКОГА id,
-- wifi_name/password, access_code или данни за собственика. Нищо, ако
-- имотът не е публикуван (is_listed = false) или slug-ът не съществува.
-- ---------------------------------------------------------------------
create or replace function public.public_property(p_slug text)
returns table (
  name              text,
  city              text,
  public_description text,
  cover_image_url   text,
  max_guests        int,
  house_rules       text,
  channels          jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select p.name, p.city, p.public_description, p.cover_image_url, p.max_guests,
         p.house_rules, p.channels
  from public.properties p
  where p.slug = p_slug and p.is_listed = true;
$$;

revoke all on function public.public_property(text) from public;
grant execute on function public.public_property(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. quote_stay(slug, check_in, check_out, guests) — цена по pricing_rules
-- (иначе base_price), почистване, турист такса, капаро, мин. нощувки,
-- свободно ли е. Нищо, ако имотът не е публикуван, датите са невалидни,
-- или check_in е в миналото (по българско време).
-- ---------------------------------------------------------------------
create or replace function public.quote_stay(
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
  is_available         boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  prop   public.properties;
  s      public.property_settings;
  v_night date;
  v_price numeric;
  v_min   int;
  v_today date;
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
    select r.price_per_night, r.min_nights into v_price, v_min
      from public.pricing_rules r
     where r.property_id = prop.id
       and v_night >= r.start_date and v_night <= r.end_date
     order by r.created_at desc
     limit 1;
    accommodation_total := accommodation_total + coalesce(v_price, s.base_price, 0);
    if v_night = p_check_in then
      min_nights := coalesce(v_min, 1);
    end if;
    v_night := v_night + 1;
  end loop;
  accommodation_total := round(accommodation_total, 2);

  cleaning_fee := coalesce(s.cleaning_fee, 0);
  -- Турист таксата е отделна от total — както bookings.tourist_tax е
  -- отделна от bookings.total_price (миграция 004): собственикът я отчита
  -- към общината, не е част от приходa на имота.
  tourist_tax  := round(coalesce(s.tourist_tax, 0) * p_guests * nights, 2);
  total        := round(accommodation_total + cleaning_fee, 2);
  deposit      := round(total * coalesce(s.deposit_pct, 30) / 100.0, 2);
  fits_guests  := p_guests <= prop.max_guests;
  -- Само bookings блокира дати (confirmed/pending) — booking_requests
  -- НЕ участва тук нарочно: спам заявка не бива да заключва календара.
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

-- ---------------------------------------------------------------------
-- 4. booking_requests — заявки от гости, отделно от bookings
-- ---------------------------------------------------------------------
create table if not exists public.booking_requests (
  id             uuid primary key default gen_random_uuid(),
  property_id    uuid not null references public.properties (id) on delete cascade,
  check_in       date not null,
  check_out      date not null check (check_out > check_in),
  num_guests     integer not null default 1 check (num_guests > 0),
  guest_name     text not null,
  guest_phone    text,
  guest_email    text,
  message        text,
  quoted_total   numeric(10, 2),
  quoted_deposit numeric(10, 2),
  status         text not null default 'pending'
                 check (status in ('pending', 'accepted', 'declined', 'expired')),
  decided_at     timestamptz,
  -- За бъдещ rate-limit в Netlify функцията (Етап 4б) — не се ползва още.
  ip_address     text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_booking_requests_property
  on public.booking_requests (property_id, created_at desc);
create index if not exists idx_booking_requests_pending
  on public.booking_requests (status, created_at)
  where status = 'pending';

alter table public.booking_requests enable row level security;

-- Нарочно БЕЗ insert policy — единственият път за запис е service role
-- ключът в Netlify функцията (Етап 4б), който винаги заобикаля RLS.
-- Нито anon, нито authenticated могат да пишат директно.
drop policy if exists "booking_requests_select_own" on public.booking_requests;
create policy "booking_requests_select_own" on public.booking_requests
  for select using (public.owns_property(property_id));

drop policy if exists "booking_requests_update_own" on public.booking_requests;
create policy "booking_requests_update_own" on public.booking_requests
  for update using (public.owns_property(property_id))
  with check (public.owns_property(property_id));

drop policy if exists "booking_requests_delete_own" on public.booking_requests;
create policy "booking_requests_delete_own" on public.booking_requests
  for delete using (public.owns_property(property_id));

-- ---------------------------------------------------------------------
-- 5. Изтичане на стари чакащи заявки (3 дни)
-- Чисто интервално сравнение (now() - interval), не календарна дата —
-- затова не е нужна часова зона тук (за разлика от bookings_sold/
-- quote_stay, които сравняват календарни дни). Викайте периодично от
-- scheduled функция (Etap 4б/5), аналогично на release_expired_holds()
-- в референтния playbook.
-- ---------------------------------------------------------------------
create or replace function public.expire_old_booking_requests()
returns int
language sql
security definer
set search_path = public
as $$
  with expired as (
    update public.booking_requests
    set status = 'expired'
    where status = 'pending' and created_at < now() - interval '3 days'
    returning 1
  )
  select count(*)::int from expired;
$$;

revoke execute on function public.expire_old_booking_requests() from public, anon, authenticated;

select 'Миграция 006 е пусната успешно' as status;

-- =====================================================================
-- КРАЙ НА МИГРАЦИЯ 006
-- =====================================================================
