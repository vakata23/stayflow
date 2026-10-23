-- =====================================================================
-- StayFlow — Миграция 014: сезонни цени (цена по период, който се повтаря всяка година)
--
-- Досега цената беше една (property_settings.base_price) плюс правила за КОНКРЕТНИ дати
-- (pricing_rules — „1–5 юли 2027“). Собственикът иска сезони: „ноември–март една цена, юни–септември
-- друга“ — задава се веднъж и важи всяка година.
--
-- Редът за всяка нощувка (quote_stay): 1) правило за конкретни дати (pricing_rules) — то „замазва“,
-- напр. Нова година; 2) сезон (price_seasons), последно създаденият печели при застъпване;
-- 3) основната цена base_price. Минималният престой се взима от същото правило/сезон за нощта на настаняване.
--
-- Сезонът е „от ден/месец до ден/месец“ и може да минава през Нова година (1 ноември → 31 март).
-- Безопасна за повторно пускане. НЕ пипа public_property (там чака миграция 013).
-- =====================================================================

-- 1. Таблицата ---------------------------------------------------------
create table if not exists public.price_seasons (
  id              uuid primary key default gen_random_uuid(),
  property_id     uuid not null references public.properties (id) on delete cascade,
  name            text check (name is null or char_length(name) <= 60),
  start_month     smallint not null check (start_month between 1 and 12),
  start_day       smallint not null check (start_day between 1 and 31),
  end_month       smallint not null check (end_month between 1 and 12),
  end_day         smallint not null check (end_day between 1 and 31),
  price_per_night numeric(10, 2) not null check (price_per_night >= 0),
  min_nights      integer not null default 1 check (min_nights >= 1),
  created_at      timestamptz not null default now(),

  -- денят трябва да съществува в месеца (29 февруари е позволен — има го във високосна година)
  constraint price_seasons_start_valid
    check (start_day <= (array[31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31])[start_month]),
  constraint price_seasons_end_valid
    check (end_day <= (array[31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31])[end_month])
);

create index if not exists idx_price_seasons_property on public.price_seasons (property_id);

-- 2. RLS — само собственикът на имота (както pricing_rules) ------------------
alter table public.price_seasons enable row level security;

drop policy if exists "price_seasons_select_own" on public.price_seasons;
create policy "price_seasons_select_own" on public.price_seasons
  for select using (public.owns_property(property_id));

drop policy if exists "price_seasons_insert_own" on public.price_seasons;
create policy "price_seasons_insert_own" on public.price_seasons
  for insert with check (public.owns_property(property_id));

drop policy if exists "price_seasons_update_own" on public.price_seasons;
create policy "price_seasons_update_own" on public.price_seasons
  for update using (public.owns_property(property_id))
  with check (public.owns_property(property_id));

drop policy if exists "price_seasons_delete_own" on public.price_seasons;
create policy "price_seasons_delete_own" on public.price_seasons
  for delete using (public.owns_property(property_id));

-- 3. Покрива ли сезонът дадена дата (само ден и месец, годината не се взима предвид) ----------
-- Ако началото е след края (ноември → март), сезонът минава през Нова година.
create or replace function public.season_covers(sm int, sd int, em int, ed int, d date)
returns boolean
language sql
immutable
as $$
  select case
    when sm * 100 + sd <= em * 100 + ed
      then (extract(month from d)::int * 100 + extract(day from d)::int) between sm * 100 + sd and em * 100 + ed
    else (extract(month from d)::int * 100 + extract(day from d)::int) >= sm * 100 + sd
      or (extract(month from d)::int * 100 + extract(day from d)::int) <= em * 100 + ed
  end;
$$;

-- 4. quote_stay: правило за дати → сезон → основна цена ---------------------------------
-- Същият подпис и права като в 006; единствената разлика е блокът „сезон“ в цикъла.
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
    accommodation_total := accommodation_total + coalesce(v_price, s.base_price, 0);
    if v_night = p_check_in then
      min_nights := coalesce(v_min, 1);
    end if;
    v_night := v_night + 1;
  end loop;
  accommodation_total := round(accommodation_total, 2);

  cleaning_fee := coalesce(s.cleaning_fee, 0);
  -- Турист таксата е отделна от total (виж 006/004).
  tourist_tax  := round(coalesce(s.tourist_tax, 0) * p_guests * nights, 2);
  total        := round(accommodation_total + cleaning_fee, 2);
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

-- 5. public_seasons(slug): сезоните на публикуван имот за страницата на госта --------------
-- Само периоди и цени — нищо друго. Нищо, ако имотът не е публикуван.
create or replace function public.public_seasons(p_slug text)
returns table (
  name            text,
  start_month     int,
  start_day       int,
  end_month       int,
  end_day         int,
  price_per_night numeric,
  min_nights      int
)
language sql
stable
security definer
set search_path = public
as $$
  select sn.name, sn.start_month::int, sn.start_day::int, sn.end_month::int, sn.end_day::int,
         sn.price_per_night, sn.min_nights
  from public.price_seasons sn
  join public.properties p on p.id = sn.property_id
  where p.slug = p_slug and p.is_listed = true
  order by sn.start_month, sn.start_day, sn.created_at;
$$;

revoke execute on function public.public_seasons(text) from public;
grant execute on function public.public_seasons(text) to anon, authenticated;

select 'Миграция 014 е пусната успешно' as status;
