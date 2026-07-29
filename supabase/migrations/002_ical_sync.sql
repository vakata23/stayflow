-- =====================================================================
-- STAYFLOW — Миграция 002: iCal синхронизация
-- Изпълнете в Supabase SQL Editor СЛЕД основния schema.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Нови колони
-- ---------------------------------------------------------------------

-- Таен токен за публичния iCal експорт линк на всеки имот.
-- Токенът е отделен от id-то на имота, за да може да бъде подменен
-- (rotate), ако линкът изтече, без да се пипа самият имот.
alter table public.properties
  add column if not exists ical_token uuid not null default gen_random_uuid();

create unique index if not exists idx_properties_ical_token
  on public.properties (ical_token);

-- Външен iCal адрес (от Airbnb/Booking), от който дърпаме резервации.
alter table public.properties
  add column if not exists ical_url text;

-- UID на събитието във външния календар — пази ни от дублиране
-- при повторна синхронизация.
alter table public.bookings
  add column if not exists external_uid text;

create unique index if not exists idx_bookings_external_uid
  on public.bookings (property_id, external_uid)
  where external_uid is not null;

-- ---------------------------------------------------------------------
-- 2. Публична функция за iCal експорт
--
-- ВАЖНО за поверителността: функцията НЕ връща име, телефон или имейл
-- на госта. Публичният линк съдържа само заетите периоди — точно
-- това, от което Airbnb/Booking имат нужда, за да блокират датите.
-- ---------------------------------------------------------------------
create or replace function public.bookings_for_ical(p_token uuid)
returns table (
  booking_id    uuid,
  property_name text,
  check_in      date,
  check_out     date
)
language sql
stable
security definer
set search_path = public
as $$
  select b.id, p.name, b.check_in, b.check_out
  from public.properties p
  join public.bookings b on b.property_id = p.id
  where p.ical_token = p_token
    and b.status <> 'cancelled'
  order by b.check_in;
$$;

revoke all on function public.bookings_for_ical(uuid) from public;
grant execute on function public.bookings_for_ical(uuid) to anon, authenticated;

-- =====================================================================
-- КРАЙ НА МИГРАЦИЯ 002
-- =====================================================================
