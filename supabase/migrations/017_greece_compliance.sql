-- =====================================================================
-- StayFlow — Миграция 017: Гърция — номер на имота (AMA/ΕΣΛ/ΜΑΓ) и данни за декларацията за всеки престой
--
-- Какво изисква Гърция от собственик на краткосрочен наем (до 59 нощи):
--   1) Всеки имот е записан в регистъра на данъчната служба AADE и има номер (AMA; лицензираните обекти —
--      ΕΣΛ или ΜΑΓ). Номерът трябва да се вижда във всяка обява и на собствения сайт.
--   2) За всеки престой се подава декларация до 20-о число на месеца след напускането: дати, сума, начин
--      на плащане, платформа и ΑΦΜ (гръцки гост) или име и номер на паспорт (чужденец).
-- StayFlow НЕ подава декларации вместо собственика — пази данните, следи срока и дава експорт.
--
-- Две нови таблици (чувствителните данни са отделно от резервацията, виждат се само от собственика):
--   property_registry — по един ред на имот: държава, вид номер, номер, ATAK.
--   stay_declarations — по един ред на резервация: гражданство, ΑΦΜ/паспорт, начин на плащане, подадена ли е.
-- Публично се показва САМО видът и номерът на публикуван имот в Гърция (RPC public_registration).
-- Не пипа public_property, quote_stay и другите функции. Безопасна за повторно пускане.
-- =====================================================================

-- 1. Номер на имота -----------------------------------------------------
create table if not exists public.property_registry (
  property_id uuid primary key references public.properties (id) on delete cascade,
  country     text not null default 'BG' check (country in ('BG', 'GR')),
  kind        text not null default 'ama' check (kind in ('ama', 'esl', 'mag')),
  number      text check (number is null or (char_length(number) between 3 and 40)),
  atak        text check (atak is null or (char_length(atak) between 3 and 40)),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.property_registry enable row level security;

drop policy if exists "property_registry_select_own" on public.property_registry;
create policy "property_registry_select_own" on public.property_registry
  for select using (public.owns_property(property_id));

drop policy if exists "property_registry_insert_own" on public.property_registry;
create policy "property_registry_insert_own" on public.property_registry
  for insert with check (public.owns_property(property_id));

drop policy if exists "property_registry_update_own" on public.property_registry;
create policy "property_registry_update_own" on public.property_registry
  for update using (public.owns_property(property_id))
  with check (public.owns_property(property_id));

drop policy if exists "property_registry_delete_own" on public.property_registry;
create policy "property_registry_delete_own" on public.property_registry
  for delete using (public.owns_property(property_id));

-- 2. Данни за декларацията на престоя ------------------------------------
create table if not exists public.stay_declarations (
  booking_id    uuid primary key references public.bookings (id) on delete cascade,
  guest_country text check (guest_country is null or guest_country ~ '^[A-Z]{2}$'),
  guest_tax_id  text check (guest_tax_id is null or char_length(guest_tax_id) between 5 and 20),
  guest_passport text check (guest_passport is null or char_length(guest_passport) between 4 and 30),
  guest_doc_name text check (guest_doc_name is null or char_length(guest_doc_name) between 2 and 120),
  pay_method    text check (pay_method is null or pay_method in ('platform', 'bank', 'card', 'cash', 'other')),
  status        text not null default 'pending' check (status in ('pending', 'submitted')),
  submitted_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- „подадена“ винаги има дата на подаване, „чакаща“ — никога
  constraint stay_declarations_submitted_consistent check ((status = 'submitted') = (submitted_at is not null))
);

alter table public.stay_declarations enable row level security;

drop policy if exists "stay_declarations_select_own" on public.stay_declarations;
create policy "stay_declarations_select_own" on public.stay_declarations
  for select using (public.owns_booking(booking_id));

drop policy if exists "stay_declarations_insert_own" on public.stay_declarations;
create policy "stay_declarations_insert_own" on public.stay_declarations
  for insert with check (public.owns_booking(booking_id));

drop policy if exists "stay_declarations_update_own" on public.stay_declarations;
create policy "stay_declarations_update_own" on public.stay_declarations
  for update using (public.owns_booking(booking_id))
  with check (public.owns_booking(booking_id));

drop policy if exists "stay_declarations_delete_own" on public.stay_declarations;
create policy "stay_declarations_delete_own" on public.stay_declarations
  for delete using (public.owns_booking(booking_id));

-- 3. Публично: само видът и номерът на публикуван имот в Гърция ----------------
create or replace function public.public_registration(p_slug text)
returns table (kind text, number text)
language sql
stable
security definer
set search_path = public
as $$
  select r.kind, r.number
  from public.property_registry r
  join public.properties p on p.id = r.property_id
  where p.slug = p_slug and p.is_listed = true and r.country = 'GR' and r.number is not null;
$$;

revoke execute on function public.public_registration(text) from public;
grant execute on function public.public_registration(text) to anon, authenticated;

select 'Миграция 017 е пусната успешно' as status;
