-- ============================================================================
-- Миграция 010: „Качи снимки → страницата се прави сама“ (Етап 7б)
--
-- ai_runs: всяка автоматична обработка на снимки (Claude vision) е ред тук.
-- Собственикът я стартира през start_ai_run() — лимитът от 3 на имот на ден
-- (по българско време) се проверява ТУК, преди да е похарчен и цент.
-- Резултатът (подредба, предложени удобства, чернова на описание) остава в
-- ai_runs.result — нищо не се пише в имота, докато собственикът не го приеме.
--
-- properties.accent_color: цвят на публичната страница, изведен от корицата
-- в браузъра (без AI), вече проверен за контраст с бял текст.
--
-- Идемпотентна: безопасно за повторно пускане.
-- ============================================================================

alter table public.properties add column if not exists accent_color text
  check (accent_color is null or accent_color ~ '^#[0-9a-f]{6}$');

create table if not exists public.ai_runs (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid not null references public.properties (id) on delete cascade,
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  status        text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  photo_count   smallint not null default 0,
  result        jsonb,
  error         text,
  model         text,
  input_tokens  integer,
  output_tokens integer,
  cost_usd      numeric(8, 4),
  created_at    timestamptz not null default now(),
  finished_at   timestamptz
);

create index if not exists ai_runs_property_created_idx on public.ai_runs (property_id, created_at desc);

alter table public.ai_runs enable row level security;

-- Само четене за собственика. Създаване — през start_ai_run(); обновяване —
-- само сървърът (service role) от Netlify функцията.
drop policy if exists "ai_runs_select_own" on public.ai_runs;
create policy "ai_runs_select_own" on public.ai_runs
  for select using (public.owns_property(property_id));

create or replace function public.start_ai_run(p_property_id uuid, p_photo_count int)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid := public.current_profile_id();
  v_today   date := (now() at time zone 'Europe/Sofia')::date;
  v_used    int;
  v_id      uuid;
begin
  if v_profile is null or not public.owns_property(p_property_id) then
    raise exception 'Нямате достъп до този имот.';
  end if;
  if p_photo_count < 1 or p_photo_count > 30 then
    raise exception 'Автоматичната обработка приема между 1 и 30 снимки.';
  end if;

  -- Сериализира едновременни заявки за един имот, за да не се надхвърли лимитът.
  perform pg_advisory_xact_lock(hashtext(p_property_id::text));

  select count(*) into v_used
  from public.ai_runs
  where property_id = p_property_id
    and (created_at at time zone 'Europe/Sofia')::date = v_today;

  if v_used >= 3 then
    raise exception 'Достигнат е дневният лимит от 3 автоматични обработки за този имот. Опитайте утре.';
  end if;

  insert into public.ai_runs (property_id, profile_id, photo_count)
  values (p_property_id, v_profile, p_photo_count)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.start_ai_run(uuid, int) from public, anon;
grant execute on function public.start_ai_run(uuid, int) to authenticated;

-- public_property() връща и accent_color (DROP+CREATE — RETURNS TABLE се сменя).
drop function if exists public.public_property(text);

create function public.public_property(p_slug text)
returns table (
  name text, city text, public_description text, public_description_en text,
  cover_image_url text, max_guests int, house_rules text, channels jsonb,
  bedrooms smallint, beds smallint, bathrooms numeric, area_m2 numeric,
  amenities jsonb, checkin_time text, checkout_time text,
  smoking_allowed boolean, parties_allowed boolean, cancellation_policy text,
  photos text[], public_lat numeric, public_lng numeric, base_price numeric,
  accent_color text
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
    case when p.lat is null or p.lng is null then null
      else p.lat + (hashtext(p.id::text || ':lat') % 1000) / 1000.0 * (300.0 / 111320.0)
    end as public_lat,
    case when p.lat is null or p.lng is null then null
      else p.lng + (hashtext(p.id::text || ':lng') % 1000) / 1000.0 * (300.0 / (111320.0 * cos(radians(p.lat))))
    end as public_lng,
    coalesce(ps.base_price, 0) as base_price,
    p.accent_color
  from public.properties p
  left join public.property_settings ps on ps.property_id = p.id
  where p.slug = p_slug and p.is_listed = true;
$$;

revoke execute on function public.public_property(text) from public;
grant execute on function public.public_property(text) to anon, authenticated;

select 'Миграция 010 е пусната успешно' as status;
