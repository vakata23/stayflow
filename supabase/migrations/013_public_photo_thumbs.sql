-- ============================================================================
-- Миграция 013: миниатюри (768 px) на публичната страница
--
-- public_property() връща и photo_thumbs — масив, паралелен на photos (един и
-- същи ред). Където снимката няма миниатюра (качена преди Етап 7б), на нейно
-- място излиза основната, така че двата масива винаги са с еднаква дължина и
-- photo_thumbs[i] е „малката“ версия на photos[i].
--
-- Защо: на телефон първата снимка е най-тежкият елемент на страницата. Със
-- srcset браузърът взима 768 px миниатюрата (≈ 60–90 KB), а на голям екран —
-- 1600 px файла. Нищо друго не се променя: никакви нови данни за имота, само
-- адреси на публични снимки от същия публичен bucket.
--
-- Подредба: position, после id — иначе при равни позиции двата масива можеха да
-- се подредят различно и миниатюрите да не съвпадат със снимките.
--
-- DROP + CREATE, защото се сменя RETURNS TABLE; правата се връщат изрично.
-- Идемпотентна миграция: безопасно за повторно пускане.
-- ============================================================================

drop function if exists public.public_property(text);

create function public.public_property(p_slug text)
returns table (
  name text, city text, public_description text, public_description_en text,
  cover_image_url text, max_guests int, house_rules text, channels jsonb,
  bedrooms smallint, beds smallint, bathrooms numeric, area_m2 numeric,
  amenities jsonb, checkin_time text, checkout_time text,
  smoking_allowed boolean, parties_allowed boolean, cancellation_policy text,
  photos text[], public_lat numeric, public_lng numeric, base_price numeric,
  accent_color text, photo_thumbs text[]
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
      (select array_agg(ph.photo_url order by ph.position, ph.id)
       from public.property_photos ph
       where ph.property_id = p.id),
      '{}'::text[]
    ) as photos,
    case when p.lat is null or p.lng is null then null
      else p.lat + (hashtext(p.id::text || ':lat') % 1000) / 1000.0 * (300.0 / 111320.0)
    end as public_lat,
    case when p.lat is null or p.lng is null then null
      else p.lng + (hashtext(p.id::text || ':lng') % 1000) / 1000.0 * (300.0 / (111320.0 * cos(radians(p.lat))))
    end as public_lng,
    coalesce(ps.base_price, 0) as base_price,
    p.accent_color,
    coalesce(
      (select array_agg(coalesce(ph.thumb_url, ph.photo_url) order by ph.position, ph.id)
       from public.property_photos ph
       where ph.property_id = p.id),
      '{}'::text[]
    ) as photo_thumbs
  from public.properties p
  left join public.property_settings ps on ps.property_id = p.id
  where p.slug = p_slug and p.is_listed = true;
$$;

revoke execute on function public.public_property(text) from public;
grant execute on function public.public_property(text) to anon, authenticated;

select 'Миграция 013 е пусната успешно' as status;
