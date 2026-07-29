-- =====================================================================
-- STAYFLOW — Миграция 003: Публична гост карта
-- Изпълнете в Supabase SQL Editor СЛЕД 002_ical_sync.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Публична функция за гост картата.
--
-- Гостът отваря /guest/<property_id> без login. RLS на properties НЕ
-- позволява анонимен достъп, затова минаваме през security definer
-- функция, която връща САМО безопасните за госта полета — никакви
-- данни за собственика извън избран контакт за спешни случаи, никакви
-- резервации, никакви финансови данни.
--
-- Забележка за поверителност: access_code и wifi_password СЕ връщат —
-- това е целта на картата (гостът се нуждае от тях). Защитата е, че
-- property_id е неотгатваем UUID (2^122 комбинации); линкът е тайната.
-- ---------------------------------------------------------------------
create or replace function public.guest_card(p_property_id uuid)
returns table (
  name            text,
  address         text,
  city            text,
  wifi_name       text,
  wifi_password   text,
  access_code     text,
  house_rules     text,
  cover_image_url text,
  contact_name    text,
  contact_phone   text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.name,
    p.address,
    p.city,
    p.wifi_name,
    p.wifi_password,
    p.access_code,
    p.house_rules,
    p.cover_image_url,
    coalesce(nullif(pr.company_name, ''), nullif(pr.full_name, '')) as contact_name,
    pr.phone as contact_phone
  from public.properties p
  join public.profiles pr on pr.id = p.owner_id
  where p.id = p_property_id;
$$;

revoke all on function public.guest_card(uuid) from public;
grant execute on function public.guest_card(uuid) to anon, authenticated;

-- =====================================================================
-- КРАЙ НА МИГРАЦИЯ 003
-- =====================================================================
