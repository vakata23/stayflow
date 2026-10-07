-- ============================================================================
-- Миграция 009: Публичната страница на имота като в Booking/Airbnb (Етап 7)
--
-- Добавя: галерия със снимки (property_photos), удобства/спални/легла/бани/
-- кв.м, час на настаняване/напускане, правила (пушене/партита/анулиране),
-- ПРИБЛИЗИТЕЛНА локация (lat/lng, размазана с ~300м офсет само в
-- public_property() — точните координати никога не излизат навън),
-- отзиви (reviews, въвежда ги собственикът), календар на заети дати
-- (busy_nights() — връща САМО дати, нищо друго).
--
-- Сигурност: properties.id никога не се връща публично (вече установено в
-- 006); wifi_name/wifi_password/access_code никога не влизат в
-- public_property(); снимките се качват в auth.uid() папка, НЕ в папка с
-- property_id (виж src/lib/propertyPhotos.js).
--
-- Идемпотентна: безопасно за повторно пускане.
-- ============================================================================

-- 1. Нови полета по имот ------------------------------------------------------
alter table public.properties add column if not exists bedrooms smallint not null default 1 check (bedrooms >= 0);
alter table public.properties add column if not exists beds smallint not null default 1 check (beds >= 0);
alter table public.properties add column if not exists bathrooms numeric(3, 1) not null default 1 check (bathrooms >= 0);
alter table public.properties add column if not exists area_m2 numeric(6, 1) check (area_m2 is null or area_m2 > 0);
alter table public.properties add column if not exists amenities jsonb not null default '[]'::jsonb check (jsonb_typeof(amenities) = 'array');
alter table public.properties add column if not exists checkin_time text not null default '14:00';
alter table public.properties add column if not exists checkout_time text not null default '11:00';
alter table public.properties add column if not exists smoking_allowed boolean not null default false;
alter table public.properties add column if not exists parties_allowed boolean not null default false;
alter table public.properties add column if not exists cancellation_policy text not null default 'moderate'
  check (cancellation_policy in ('flexible', 'moderate', 'strict'));
-- Точни координати — НИКОГА не се връщат директно, само през public_property()
-- с добавен случаен (но стабилен) офсет до ~300м (виж функцията по-долу).
alter table public.properties add column if not exists lat numeric(9, 6);
alter table public.properties add column if not exists lng numeric(9, 6);
alter table public.properties add column if not exists public_description_en text;

-- 2. Галерия снимки ------------------------------------------------------------
-- photo_url е пълен публичен URL от същия bucket 'property-images' като
-- cover_image_url (вече публичен от Етап 1) — без нов bucket. Пътят на файла
-- в storage e {auth.uid()}/{random}.ext, НЕ съдържа property_id.
create table if not exists public.property_photos (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  photo_url   text not null,
  position    smallint not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists property_photos_property_idx on public.property_photos (property_id, position);

alter table public.property_photos enable row level security;

drop policy if exists "property_photos_select_own" on public.property_photos;
create policy "property_photos_select_own" on public.property_photos
  for select using (public.owns_property(property_id));

drop policy if exists "property_photos_insert_own" on public.property_photos;
create policy "property_photos_insert_own" on public.property_photos
  for insert with check (public.owns_property(property_id));

drop policy if exists "property_photos_update_own" on public.property_photos;
create policy "property_photos_update_own" on public.property_photos
  for update using (public.owns_property(property_id))
  with check (public.owns_property(property_id));

drop policy if exists "property_photos_delete_own" on public.property_photos;
create policy "property_photos_delete_own" on public.property_photos
  for delete using (public.owns_property(property_id));

-- 3. Отзиви — само реални, въведени от собственика --------------------------
create table if not exists public.reviews (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  guest_name  text not null,
  rating      smallint not null check (rating between 1 and 5),
  comment     text not null,
  stayed_on   date,
  created_at  timestamptz not null default now()
);

create index if not exists reviews_property_idx on public.reviews (property_id, created_at desc);

alter table public.reviews enable row level security;

drop policy if exists "reviews_select_own" on public.reviews;
create policy "reviews_select_own" on public.reviews
  for select using (public.owns_property(property_id));

drop policy if exists "reviews_insert_own" on public.reviews;
create policy "reviews_insert_own" on public.reviews
  for insert with check (public.owns_property(property_id));

drop policy if exists "reviews_update_own" on public.reviews;
create policy "reviews_update_own" on public.reviews
  for update using (public.owns_property(property_id))
  with check (public.owns_property(property_id));

drop policy if exists "reviews_delete_own" on public.reviews;
create policy "reviews_delete_own" on public.reviews
  for delete using (public.owns_property(property_id));

-- 4. public_property() — разширена. Връщаният тип се променя, затова DROP
--    преди CREATE (CREATE OR REPLACE не позволява смяна на RETURNS TABLE).
-- ----------------------------------------------------------------------------
drop function if exists public.public_property(text);

create function public.public_property(p_slug text)
returns table (
  name text, city text, public_description text, public_description_en text,
  cover_image_url text, max_guests int, house_rules text, channels jsonb,
  bedrooms smallint, beds smallint, bathrooms numeric, area_m2 numeric,
  amenities jsonb, checkin_time text, checkout_time text,
  smoking_allowed boolean, parties_allowed boolean, cancellation_policy text,
  photos text[], public_lat numeric, public_lng numeric, base_price numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.name, p.city, p.public_description, p.public_description_en,
    p.cover_image_url, p.max_guests, p.house_rules, p.channels,
    p.bedrooms, p.beds, p.bathrooms, p.area_m2,
    p.amenities, p.checkin_time, p.checkout_time,
    p.smoking_allowed, p.parties_allowed, p.cancellation_policy,
    coalesce(
      (select array_agg(ph.photo_url order by ph.position)
       from public.property_photos ph
       where ph.property_id = p.id),
      '{}'::text[]
    ) as photos,
    -- Размазана локация: детерминиран офсет до ~300м, изведен от property.id
    -- (което никога не излиза навън) — стабилен между заявки, но не разкрива
    -- истинската точка. 111320 м ≈ 1° ширина; дължината се коригира с cos(lat).
    case when p.lat is null or p.lng is null then null
      else p.lat + (hashtext(p.id::text || ':lat') % 1000) / 1000.0 * (300.0 / 111320.0)
    end as public_lat,
    case when p.lat is null or p.lng is null then null
      else p.lng + (hashtext(p.id::text || ':lng') % 1000) / 1000.0 * (300.0 / (111320.0 * cos(radians(p.lat))))
    end as public_lng,
    coalesce(ps.base_price, 0) as base_price
  from public.properties p
  left join public.property_settings ps on ps.property_id = p.id
  where p.slug = p_slug and p.is_listed = true;
$$;

revoke execute on function public.public_property(text) from public;
grant execute on function public.public_property(text) to anon, authenticated;

-- 5. busy_nights() — само дати, нищо друго (нито guest_name, нито booking id)
-- ----------------------------------------------------------------------------
create or replace function public.busy_nights(p_slug text, p_from date, p_to date)
returns table (night date)
language sql
stable
security definer
set search_path = public
as $$
  select d::date as night
  from public.properties p
  join public.bookings b on b.property_id = p.id
  cross join lateral generate_series(
    greatest(b.check_in, p_from)::timestamp,
    least(b.check_out - 1, p_to)::timestamp,
    interval '1 day'
  ) as d
  where p.slug = p_slug and p.is_listed = true
    and b.status <> 'cancelled'
    and b.check_in <= p_to and b.check_out > p_from
  order by d;
$$;

revoke execute on function public.busy_nights(text, date, date) from public;
grant execute on function public.busy_nights(text, date, date) to anon, authenticated;

-- 6. public_reviews() — само реални отзиви на публикуван имот ----------------
create or replace function public.public_reviews(p_slug text)
returns table (id uuid, guest_name text, rating smallint, comment text, stayed_on date, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.guest_name, r.rating, r.comment, r.stayed_on, r.created_at
  from public.reviews r
  join public.properties p on p.id = r.property_id
  where p.slug = p_slug and p.is_listed = true
  order by r.created_at desc;
$$;

revoke execute on function public.public_reviews(text) from public;
grant execute on function public.public_reviews(text) to anon, authenticated;

select 'Миграция 009 е пусната успешно' as status;
