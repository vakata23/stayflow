-- =====================================================================
-- StayFlow — Миграция 018: документи за безопасност (Гърция, закон 5170/2025) и надбавки по канал
--
-- 1) property_safety_items — по един ред на документ/изискване за имот: има ли го, до кога важи, бележка/номер.
--    Ключовете са: insurance (застраховка гражданска отговорност), electrician (удостоверение от електротехник),
--    fire (пожарогасител — проверка), pest (сертификат за дератизация), first_aid (аптечка), emergency (телефони за спешни случаи).
--    Само собственикът на имота (както property_registry). Нищо не се показва публично.
-- 2) property_settings.airbnb_markup_pct / booking_markup_pct — с колко % по-висока е цената в Airbnb и Booking спрямо
--    директната (за да покрие комисионата). Само справка за собственика: с iCal цените не се пращат към платформите.
-- Не пипа quote_stay, public_property и другите функции. Безопасна за повторно пускане.
-- =====================================================================

-- 1. Документи за безопасност ----------------------------------------------
create table if not exists public.property_safety_items (
  property_id uuid not null references public.properties (id) on delete cascade,
  item_key    text not null check (item_key in ('insurance', 'electrician', 'fire', 'pest', 'first_aid', 'emergency')),
  done        boolean not null default false,
  expires_on  date,
  note        text check (note is null or char_length(note) <= 200),
  updated_at  timestamptz not null default now(),
  primary key (property_id, item_key)
);

alter table public.property_safety_items enable row level security;

drop policy if exists "property_safety_items_select_own" on public.property_safety_items;
create policy "property_safety_items_select_own" on public.property_safety_items
  for select using (public.owns_property(property_id));

drop policy if exists "property_safety_items_insert_own" on public.property_safety_items;
create policy "property_safety_items_insert_own" on public.property_safety_items
  for insert with check (public.owns_property(property_id));

drop policy if exists "property_safety_items_update_own" on public.property_safety_items;
create policy "property_safety_items_update_own" on public.property_safety_items
  for update using (public.owns_property(property_id))
  with check (public.owns_property(property_id));

drop policy if exists "property_safety_items_delete_own" on public.property_safety_items;
create policy "property_safety_items_delete_own" on public.property_safety_items
  for delete using (public.owns_property(property_id));

-- 2. Надбавки по канал ---------------------------------------------------------
alter table public.property_settings
  add column if not exists airbnb_markup_pct numeric(5, 2) not null default 0
    check (airbnb_markup_pct between 0 and 100);

alter table public.property_settings
  add column if not exists booking_markup_pct numeric(5, 2) not null default 0
    check (booking_markup_pct between 0 and 100);

select 'Миграция 018 е пусната успешно' as status;
