-- =====================================================================
-- STAYFLOW — Миграция 005: „Продадено“ (резервации по дата на създаване)
-- Изпълнете в Supabase SQL Editor СЛЕД 004_commission_earnings.sql.
--
-- Разлика с earnings_by_month(): earnings_by_month разпределя ПРИХОДА по
-- нощувки в месеца, в който е самата нощувка (счетоводен/accrual изглед —
-- "кога е бил гостът"). bookings_sold() брои резервациите по датата, на
-- която СА НАПРАВЕНИ (created_at) — "кога е дошла продажбата", независимо
-- дали престоят е бил миналия месец или е чак догодина. Собственикът иска
-- и двата изгледа: "колко изкарах от нощувки този месец" срещу "колко нови
-- резервации влязоха този месец".
--
-- Забележка: created_at е timestamptz, а сесията в Supabase е в UTC.
-- Денят се взима по българско време (Europe/Sofia), иначе резервация,
-- направена в 00:30 на 1-во число, би паднала в предишния месец.
-- =====================================================================

create index if not exists idx_bookings_created_at on public.bookings (created_at);

-- Security invoker — RLS на bookings прилага изолацията (owns_property),
-- точно както earnings_by_month/earnings_by_property. Без параметър за
-- собственик: няма начин да се подаде чужд id по грешка.
create or replace function public.bookings_sold(p_from date, p_to date)
returns table (
  bookings_count int,
  revenue         numeric,
  commission      numeric,
  net             numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    count(*)::int,
    round(coalesce(sum(b.total_price), 0), 2),
    round(coalesce(sum(b.commission), 0), 2),
    round(coalesce(sum(b.total_price), 0) - coalesce(sum(b.commission), 0), 2)
  from public.bookings b
  where b.status <> 'cancelled'
    and (b.created_at at time zone 'Europe/Sofia')::date >= p_from
    and (b.created_at at time zone 'Europe/Sofia')::date <= p_to;
$$;

-- Postgres дава EXECUTE на PUBLIC по подразбиране — отнемаме от PUBLIC,
-- не само от anon (същата предпазна мярка като в 002/003/004).
revoke execute on function public.bookings_sold(date, date) from public, anon;
grant execute on function public.bookings_sold(date, date) to authenticated;

-- =====================================================================
-- КРАЙ НА МИГРАЦИЯ 005
-- =====================================================================
