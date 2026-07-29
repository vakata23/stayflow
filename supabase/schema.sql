-- =====================================================================
-- STAYFLOW — PMS система за краткосрочни наеми (MVP)
-- Етап 1: Пълна database schema за Supabase
-- Изпълнете целия файл наведнъж в Supabase SQL Editor.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Разширения
-- btree_gist е нужен за exclusion constraint-а против двойни резервации.
-- ---------------------------------------------------------------------
create extension if not exists btree_gist;

-- ---------------------------------------------------------------------
-- 1. Enum типове
-- ---------------------------------------------------------------------
create type public.booking_source as enum ('manual', 'airbnb', 'booking', 'direct');
create type public.booking_status as enum ('confirmed', 'pending', 'cancelled');
create type public.cleaning_task_status as enum ('pending', 'in_progress', 'done');
create type public.cleaning_issue_type as enum ('damage', 'missing_item', 'other');

-- ---------------------------------------------------------------------
-- 2. Таблици
-- ---------------------------------------------------------------------

-- 2.1 Профили (1:1 с auth.users)
create table public.profiles (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null unique references auth.users (id) on delete cascade,
  full_name    text not null default '',
  company_name text,
  phone        text,
  created_at   timestamptz not null default now()
);

-- 2.2 Имоти
create table public.properties (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.profiles (id) on delete cascade,
  name            text not null,
  address         text not null default '',
  city            text not null default '',
  property_type   text not null default 'apartment',
  max_guests      integer not null default 2 check (max_guests > 0),
  wifi_name       text,
  wifi_password   text,
  access_code     text,
  house_rules     text,
  cover_image_url text,
  created_at      timestamptz not null default now()
);

-- 2.3 Резервации
create table public.bookings (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  guest_name  text not null,
  guest_phone text,
  guest_email text,
  check_in    date not null,
  check_out   date not null,
  num_guests  integer not null default 1 check (num_guests > 0),
  total_price numeric(10, 2) check (total_price is null or total_price >= 0),
  source      public.booking_source not null default 'manual',
  status      public.booking_status not null default 'confirmed',
  notes       text,
  created_at  timestamptz not null default now(),

  constraint bookings_dates_valid check (check_out > check_in),

  -- Защита против двойни резервации на ниво база данни:
  -- два не-отказани записа за един имот не могат да имат припокриващи се
  -- периоди. Диапазонът е [check_in, check_out) — денят на напускане е
  -- свободен за ново настаняване (стандарт в краткосрочните наеми).
  constraint bookings_no_overlap exclude using gist (
    property_id with =,
    daterange(check_in, check_out, '[)') with &&
  ) where (status <> 'cancelled')
);

-- 2.4 Ценови правила
create table public.pricing_rules (
  id              uuid primary key default gen_random_uuid(),
  property_id     uuid not null references public.properties (id) on delete cascade,
  start_date      date not null,
  end_date        date not null,
  price_per_night numeric(10, 2) not null check (price_per_night >= 0),
  min_nights      integer not null default 1 check (min_nights >= 1),
  created_at      timestamptz not null default now(),

  constraint pricing_rules_dates_valid check (end_date >= start_date)
);

-- 2.5 Камериерски задачи
create table public.cleaning_tasks (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  booking_id  uuid references public.bookings (id) on delete set null,
  assigned_to text,
  due_date    date not null,
  status      public.cleaning_task_status not null default 'pending',
  notes       text,
  created_at  timestamptz not null default now()
);

-- 2.6 Забележки от почистване
create table public.cleaning_notes (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  task_id     uuid references public.cleaning_tasks (id) on delete set null,
  note_text   text not null,
  photo_url   text,
  issue_type  public.cleaning_issue_type not null default 'other',
  created_at  timestamptz not null default now()
);

-- 2.7 Фактури
-- on delete restrict: резервация с издадена фактура не може да бъде
-- изтрита, преди фактурата да бъде премахната (счетоводна защита).
create table public.invoices (
  id             uuid primary key default gen_random_uuid(),
  booking_id     uuid not null references public.bookings (id) on delete restrict,
  invoice_number text not null,
  guest_details  jsonb not null default '{}'::jsonb,
  amount         numeric(10, 2) not null check (amount >= 0),
  issue_date     date not null default current_date,
  pdf_url        text,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. Индекси
-- (exclusion constraint-ът вече създава GiST индекс върху
--  bookings(property_id, daterange) — той обслужва и overlap проверките)
-- ---------------------------------------------------------------------
create index idx_profiles_user_id        on public.profiles (user_id);
create index idx_properties_owner_id     on public.properties (owner_id);
create index idx_bookings_property_ci    on public.bookings (property_id, check_in);
create index idx_bookings_property_co    on public.bookings (property_id, check_out);
create index idx_bookings_status         on public.bookings (property_id, status);
create index idx_pricing_rules_property  on public.pricing_rules (property_id, start_date);
create index idx_cleaning_tasks_property on public.cleaning_tasks (property_id, due_date);
create index idx_cleaning_tasks_booking  on public.cleaning_tasks (booking_id);
create index idx_cleaning_notes_property on public.cleaning_notes (property_id, created_at desc);
create index idx_cleaning_notes_task     on public.cleaning_notes (task_id);
create index idx_invoices_booking        on public.invoices (booking_id);
create index idx_invoices_number         on public.invoices (invoice_number);

-- ---------------------------------------------------------------------
-- 4. Помощни функции за RLS
-- security definer, за да не се задейства рекурсивно RLS при проверките.
-- Функциите сами гарантират, че връщат данни само за текущия потребител.
-- ---------------------------------------------------------------------

-- Profile id на текущо логнатия потребител
create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.profiles where user_id = auth.uid();
$$;

-- Дали текущият потребител притежава дадения имот
create or replace function public.owns_property(p_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.properties p
    join public.profiles pr on pr.id = p.owner_id
    where p.id = p_property_id
      and pr.user_id = auth.uid()
  );
$$;

-- Дали текущият потребител притежава имота на дадената резервация
create or replace function public.owns_booking(p_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.bookings b
    join public.properties p on p.id = b.property_id
    join public.profiles pr on pr.id = p.owner_id
    where b.id = p_booking_id
      and pr.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------
-- 5. Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.properties     enable row level security;
alter table public.bookings       enable row level security;
alter table public.pricing_rules  enable row level security;
alter table public.cleaning_tasks enable row level security;
alter table public.cleaning_notes enable row level security;
alter table public.invoices       enable row level security;

-- 5.1 profiles — потребителят вижда/редактира само собствения си профил
create policy "profiles_select_own" on public.profiles
  for select using (user_id = (select auth.uid()));

create policy "profiles_insert_own" on public.profiles
  for insert with check (user_id = (select auth.uid()));

create policy "profiles_update_own" on public.profiles
  for update using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- (без delete policy — профилът се трие каскадно при изтриване на акаунта)

-- 5.2 properties — само собственикът
create policy "properties_select_own" on public.properties
  for select using (owner_id = public.current_profile_id());

create policy "properties_insert_own" on public.properties
  for insert with check (owner_id = public.current_profile_id());

create policy "properties_update_own" on public.properties
  for update using (owner_id = public.current_profile_id())
  with check (owner_id = public.current_profile_id());

create policy "properties_delete_own" on public.properties
  for delete using (owner_id = public.current_profile_id());

-- 5.3 bookings — през собствеността на имота
create policy "bookings_select_own" on public.bookings
  for select using (public.owns_property(property_id));

create policy "bookings_insert_own" on public.bookings
  for insert with check (public.owns_property(property_id));

create policy "bookings_update_own" on public.bookings
  for update using (public.owns_property(property_id))
  with check (public.owns_property(property_id));

create policy "bookings_delete_own" on public.bookings
  for delete using (public.owns_property(property_id));

-- 5.4 pricing_rules
create policy "pricing_rules_select_own" on public.pricing_rules
  for select using (public.owns_property(property_id));

create policy "pricing_rules_insert_own" on public.pricing_rules
  for insert with check (public.owns_property(property_id));

create policy "pricing_rules_update_own" on public.pricing_rules
  for update using (public.owns_property(property_id))
  with check (public.owns_property(property_id));

create policy "pricing_rules_delete_own" on public.pricing_rules
  for delete using (public.owns_property(property_id));

-- 5.5 cleaning_tasks
create policy "cleaning_tasks_select_own" on public.cleaning_tasks
  for select using (public.owns_property(property_id));

create policy "cleaning_tasks_insert_own" on public.cleaning_tasks
  for insert with check (public.owns_property(property_id));

create policy "cleaning_tasks_update_own" on public.cleaning_tasks
  for update using (public.owns_property(property_id))
  with check (public.owns_property(property_id));

create policy "cleaning_tasks_delete_own" on public.cleaning_tasks
  for delete using (public.owns_property(property_id));

-- 5.6 cleaning_notes
create policy "cleaning_notes_select_own" on public.cleaning_notes
  for select using (public.owns_property(property_id));

create policy "cleaning_notes_insert_own" on public.cleaning_notes
  for insert with check (public.owns_property(property_id));

create policy "cleaning_notes_update_own" on public.cleaning_notes
  for update using (public.owns_property(property_id))
  with check (public.owns_property(property_id));

create policy "cleaning_notes_delete_own" on public.cleaning_notes
  for delete using (public.owns_property(property_id));

-- 5.7 invoices — през резервация → имот → собственик
create policy "invoices_select_own" on public.invoices
  for select using (public.owns_booking(booking_id));

create policy "invoices_insert_own" on public.invoices
  for insert with check (public.owns_booking(booking_id));

create policy "invoices_update_own" on public.invoices
  for update using (public.owns_booking(booking_id))
  with check (public.owns_booking(booking_id));

create policy "invoices_delete_own" on public.invoices
  for delete using (public.owns_booking(booking_id));

-- ---------------------------------------------------------------------
-- 6. Автоматично създаване на профил при регистрация
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 7. Storage buckets + policies
-- property-images: публичен (cover снимките се показват и на гост
--   страницата без login); upload само от логнати потребители в
--   собствена папка (първата папка в пътя = auth.uid()).
-- cleaning-photos: частен; достъп само до собствената папка.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('property-images', 'property-images', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('cleaning-photos', 'cleaning-photos', false)
on conflict (id) do nothing;

create policy "property_images_public_read" on storage.objects
  for select using (bucket_id = 'property-images');

create policy "property_images_owner_insert" on storage.objects
  for insert with check (
    bucket_id = 'property-images'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "property_images_owner_update" on storage.objects
  for update using (
    bucket_id = 'property-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "property_images_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'property-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "cleaning_photos_owner_read" on storage.objects
  for select using (
    bucket_id = 'cleaning-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "cleaning_photos_owner_insert" on storage.objects
  for insert with check (
    bucket_id = 'cleaning-photos'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "cleaning_photos_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'cleaning-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- =====================================================================
-- КРАЙ НА SCHEMA — Етап 1
-- =====================================================================
