-- =====================================================================
-- STAYFLOW — Миграция 019: Хотели (стаи към един обект)
-- Изпълнете в Supabase SQL Editor СЛЕД 018_safety_and_channel_prices.sql.
-- Може да се пуска повторно (if not exists / create or replace).
--
-- Идея: стаята е обикновен имот с родител (properties.parent_id = хотелът).
-- Така всяка стая има свой календар, iCal връзка с Booking/Airbnb, цена, почистване
-- и приходи — със същия код като досега. Нови са само: връзката стая → хотел,
-- видът на стаята (напр. „Двойна стая“) и две публични функции за гостите.
-- Колоните са по избор: хотел без стаи и стари имоти работят както преди.
-- =====================================================================

-- 1. Колони -------------------------------------------------------------
alter table public.properties
  add column if not exists parent_id uuid references public.properties (id) on delete cascade;

alter table public.properties
  add column if not exists room_type text
  check (room_type is null or char_length(room_type) between 1 and 60);

create index if not exists idx_properties_parent on public.properties (parent_id) where parent_id is not null;

-- 2. Правило: стаята е на същия собственик, а хотелът не е стая --------------
create or replace function public.properties_check_parent()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  p public.properties;
begin
  if new.parent_id is null then
    return new;
  end if;
  if new.parent_id = new.id then
    raise exception 'Имотът не може да е свой собствен хотел.';
  end if;
  select * into p from public.properties where id = new.parent_id;
  if p.id is null or p.owner_id <> new.owner_id then
    raise exception 'Хотелът трябва да е ваш имот.';
  end if;
  if p.parent_id is not null then
    raise exception 'Стаята не може да е хотел на друга стая.';
  end if;
  if exists (select 1 from public.properties c where c.parent_id = new.id) then
    raise exception 'Имот със стаи не може да стане стая.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_properties_check_parent on public.properties;
create trigger trg_properties_check_parent
  before insert or update of parent_id, owner_id on public.properties
  for each row execute function public.properties_check_parent();

-- 3. Публично: какви стаи има хотелът (без id, без лични данни) -----------------
create or replace function public.public_hotel_types(p_slug text)
returns table (room_type text, rooms_total int, max_guests int, price_from numeric)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(r.room_type, r.name)::text as room_type,
         count(*)::int                       as rooms_total,
         max(r.max_guests)::int              as max_guests,
         min(nullif(s.base_price, 0))        as price_from
    from public.properties h
    join public.properties r on r.parent_id = h.id and r.is_listed = true and r.slug is not null
    left join public.property_settings s on s.property_id = r.id
   where h.slug = p_slug and h.is_listed = true
   group by coalesce(r.room_type, r.name)
   order by min(r.created_at), 1;
$$;

revoke all on function public.public_hotel_types(text) from public;
grant execute on function public.public_hotel_types(text) to anon, authenticated;

-- 4. Публично: свободни стаи по вид за дати + цена (през quote_stay) -------------
-- Връща по един ред на вид стая. room_slug е адресът на първата свободна стая от вида —
-- гостът не го вижда, а заявката отива към нея. Нищо при невалидни дати.
create or replace function public.hotel_availability(
  p_slug text, p_check_in date, p_check_out date, p_guests int
)
returns table (
  room_type           text,
  rooms_total         int,
  rooms_free          int,
  max_guests          int,
  room_slug           text,
  nights              int,
  accommodation_total numeric,
  cleaning_fee        numeric,
  total               numeric,
  deposit             numeric,
  min_nights          int,
  fits_guests         boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_hotel public.properties;
  v_type  record;
  v_room  record;
  q       record;
  v_free  int;
begin
  select * into v_hotel from public.properties where slug = p_slug and is_listed = true;
  if v_hotel.id is null or p_check_out <= p_check_in or p_guests < 1
     or p_check_in < (now() at time zone 'Europe/Sofia')::date then
    return;
  end if;

  for v_type in
    select coalesce(r.room_type, r.name)::text as t, count(*)::int as total, max(r.max_guests)::int as mg,
           min(r.created_at) as first_at
      from public.properties r
     where r.parent_id = v_hotel.id and r.is_listed = true and r.slug is not null
     group by coalesce(r.room_type, r.name)
     order by min(r.created_at), 1
  loop
    room_type := v_type.t;
    rooms_total := v_type.total;
    max_guests := v_type.mg;
    room_slug := null; nights := p_check_out - p_check_in;
    accommodation_total := null; cleaning_fee := null; total := null; deposit := null; min_nights := null;
    fits_guests := p_guests <= v_type.mg;

    select count(*)::int into v_free
      from public.properties r
     where r.parent_id = v_hotel.id and r.is_listed = true and r.slug is not null
       and coalesce(r.room_type, r.name) = v_type.t
       and r.max_guests >= p_guests
       and not exists (
         select 1 from public.bookings b
          where b.property_id = r.id and b.status <> 'cancelled'
            and daterange(b.check_in, b.check_out, '[)') && daterange(p_check_in, p_check_out, '[)'));
    rooms_free := v_free;

    if v_free > 0 then
      select r.slug into v_room
        from public.properties r
       where r.parent_id = v_hotel.id and r.is_listed = true and r.slug is not null
         and coalesce(r.room_type, r.name) = v_type.t
         and r.max_guests >= p_guests
         and not exists (
           select 1 from public.bookings b
            where b.property_id = r.id and b.status <> 'cancelled'
              and daterange(b.check_in, b.check_out, '[)') && daterange(p_check_in, p_check_out, '[)'))
       order by r.created_at, r.name
       limit 1;
      select * into q from public.quote_stay(v_room.slug, p_check_in, p_check_out, p_guests);
      if found then
        room_slug := v_room.slug;
        accommodation_total := q.accommodation_total;
        cleaning_fee := q.cleaning_fee;
        total := q.total;
        deposit := q.deposit;
        min_nights := q.min_nights;
      else
        rooms_free := 0;
      end if;
    end if;
    return next;
  end loop;
end;
$$;

revoke all on function public.hotel_availability(text, date, date, int) from public;
grant execute on function public.hotel_availability(text, date, date, int) to anon, authenticated;

select 'Миграция 019 е пусната успешно' as status;

-- =====================================================================
-- КРАЙ НА МИГРАЦИЯ 019
-- =====================================================================
