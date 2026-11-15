-- =====================================================================
-- StayFlow — Миграция 016: платен достъп, който се дава ръчно
--
-- Какво добавя:
--   • app_admins      — кой е администратор на StayFlow (вижда екрана „Клиенти“). Добавя се ръчно (виж края на файла).
--   • access_grants   — достъпът на всеки профил: пакет (start/plus/pro), статус (pending/active/suspended) и „активен до“.
--   • access_requests — заявките „Заяви достъп“ от публичната страница (пише се само през request_access()).
--   • my_access()     — какво е състоянието на достъпа на влезлия потребител (за екрана „Достъпът е на пауза“).
--   • пробен период   — is_trial в access_grants: администраторът дава 7 дни проба (active_until = днес + 7); след срока достъпът минава на пауза.
--   • admin_clients() — списък на всички акаунти с имейл, имоти и достъп (само за администратор).
--
-- Правила:
--   • Нов профил (регистрация) получава достъп със статус pending — „Чака активиране“ до одобрение.
--   • Всички СЪЩЕСТВУВАЩИ профили се записват като active без срок — нищо не се заключва за тях.
--   • Приложението е мек „портал“ на екрана: данните в другите таблици НЕ се заключват от тази миграция.
--     (Заключване на ниво база за всички таблици е отделна, по-рискова промяна — не се прави тук.)
--
-- Безопасна за повторно пускане. Не пипа други таблици, освен че добавя тригер върху profiles.
-- =====================================================================

-- 1. Администратори ----------------------------------------------------
create table if not exists public.app_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
-- Без политики: през API никой не чете и не пише директно. Проверката е само през is_app_admin().

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;
grant execute on function public.is_app_admin() to authenticated;

-- 2. Достъп по профил --------------------------------------------------
create table if not exists public.access_grants (
  profile_id   uuid primary key references public.profiles (id) on delete cascade,
  plan         text not null default 'start' check (plan in ('start', 'plus', 'pro')),
  status       text not null default 'pending' check (status in ('pending', 'active', 'suspended')),
  active_until date,                                    -- празно = без срок
  is_trial     boolean not null default false,          -- пробен период (показва се лента „остават N дни“)
  note         text check (note is null or char_length(note) <= 500),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.access_grants enable row level security;

drop policy if exists "access_grants_select_own" on public.access_grants;
create policy "access_grants_select_own" on public.access_grants
  for select to authenticated
  using (profile_id in (select id from public.profiles where user_id = auth.uid()));

drop policy if exists "access_grants_admin_all" on public.access_grants;
create policy "access_grants_admin_all" on public.access_grants
  for all to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

create or replace function public.access_grants_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists access_grants_touch on public.access_grants;
create trigger access_grants_touch before update on public.access_grants
  for each row execute function public.access_grants_touch();

-- Нов профил → достъп „чака активиране“
create or replace function public.access_grant_for_new_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.access_grants (profile_id, status) values (new.id, 'pending')
  on conflict (profile_id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_profile_created_access on public.profiles;
create trigger on_profile_created_access after insert on public.profiles
  for each row execute function public.access_grant_for_new_profile();

-- Съществуващите профили остават с пълен достъп (active, без срок)
insert into public.access_grants (profile_id, status, plan, note)
select p.id, 'active', 'plus', 'Съществуващ акаунт преди миграция 016'
from public.profiles p
where not exists (select 1 from public.access_grants g where g.profile_id = p.id);

-- 3. Състоянието на достъпа за влезлия потребител --------------------
drop function if exists public.my_access();
create or replace function public.my_access()
returns table (status text, plan text, active_until date, is_admin boolean, is_trial boolean)
language sql
stable
security definer
set search_path = public
as $$
  select g.status, g.plan, g.active_until, public.is_app_admin(), coalesce(g.is_trial, false)
  from public.profiles p
  left join public.access_grants g on g.profile_id = p.id
  where p.user_id = auth.uid()
  limit 1;
$$;
grant execute on function public.my_access() to authenticated;

-- 4. Заявки „Заяви достъп“ ---------------------------------------------
create table if not exists public.access_requests (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  name          text not null check (char_length(name) between 2 and 80),
  phone         text check (phone is null or char_length(phone) <= 40),
  email         text check (email is null or char_length(email) <= 120),
  property_band text check (property_band in ('1-3', '4-10', '11-30', '31+')),
  plan_interest text check (plan_interest is null or plan_interest in ('start', 'plus', 'pro')),
  note          text check (note is null or char_length(note) <= 500),
  consent_at    timestamptz not null,
  wants_trial   boolean not null default false,       -- натиснал „Опитай 7 дни безплатно“
  status        text not null default 'new' check (status in ('new', 'contacted', 'approved', 'rejected')),
  admin_note    text check (admin_note is null or char_length(admin_note) <= 500)
);
create index if not exists idx_access_requests_created on public.access_requests (created_at desc);
alter table public.access_requests enable row level security;

drop policy if exists "access_requests_admin_all" on public.access_requests;
create policy "access_requests_admin_all" on public.access_requests
  for all to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());
-- Без политика за anon: заявка се подава САМО през request_access() по-долу.

drop function if exists public.request_access(text, text, text, text, text, text, boolean, text);
create or replace function public.request_access(
  p_name text,
  p_phone text,
  p_email text,
  p_band text,
  p_plan text,
  p_note text,
  p_consent boolean,
  p_hp text default null,
  p_trial boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name  text := btrim(coalesce(p_name, ''));
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_digits text;
begin
  -- капан за ботове: скритото поле трябва да е празно; иначе „успех“ без запис
  if coalesce(btrim(p_hp), '') <> '' then
    return;
  end if;
  if not coalesce(p_consent, false) then
    raise exception 'consent_required';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'name_invalid';
  end if;
  if v_phone is null and v_email is null then
    raise exception 'contact_required';
  end if;
  if v_phone is not null then
    v_digits := regexp_replace(v_phone, '\D', '', 'g');
    if v_phone !~ '^[0-9+ ().-]+$' or char_length(v_digits) < 6 or char_length(v_digits) > 15 then
      raise exception 'phone_invalid';
    end if;
  end if;
  if v_email is not null and (char_length(v_email) > 120 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$') then
    raise exception 'email_invalid';
  end if;
  if p_band is not null and p_band not in ('1-3', '4-10', '11-30', '31+') then
    raise exception 'band_invalid';
  end if;
  if p_plan is not null and p_plan not in ('start', 'plus', 'pro') then
    raise exception 'plan_invalid';
  end if;
  -- ограничение: не повече от 3 заявки на ден от един и същ телефон/имейл и 200 общо на ден
  if (select count(*) from public.access_requests
        where created_at > now() - interval '1 day'
          and ((v_phone is not null and phone = v_phone) or (v_email is not null and email = v_email))) >= 3
     or (select count(*) from public.access_requests where created_at > now() - interval '1 day') >= 200 then
    raise exception 'too_many';
  end if;

  insert into public.access_requests (name, phone, email, property_band, plan_interest, note, consent_at, wants_trial)
  values (v_name, v_phone, v_email, p_band, p_plan, nullif(left(btrim(coalesce(p_note, '')), 500), ''), now(), coalesce(p_trial, false));
end;
$$;
grant execute on function public.request_access(text, text, text, text, text, text, boolean, text, boolean) to anon, authenticated;

-- 5. Списък „Клиенти“ (само за администратор) ----------------------------
drop function if exists public.admin_clients();
create or replace function public.admin_clients()
returns table (
  profile_id uuid,
  full_name text,
  company_name text,
  phone text,
  email text,
  created_at timestamptz,
  property_count bigint,
  plan text,
  status text,
  active_until date,
  is_trial boolean,
  note text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_app_admin() then
    raise exception 'forbidden';
  end if;
  return query
    select p.id, p.full_name, p.company_name, p.phone, u.email::text, p.created_at,
           (select count(*) from public.properties pr where pr.owner_id = p.id),
           g.plan, g.status, g.active_until, coalesce(g.is_trial, false), g.note
    from public.profiles p
    join auth.users u on u.id = p.user_id
    left join public.access_grants g on g.profile_id = p.id
    order by p.created_at desc;
end;
$$;
grant execute on function public.admin_clients() to authenticated;

-- =====================================================================
-- СЛЕД ПУСКАНЕ (ръчно, веднъж): направете себе си администратор. Заменете имейла с този, с който влизате в StayFlow:
--
--   insert into public.app_admins (user_id)
--   select id from auth.users where email = 'ВАШИЯТ-ИМЕЙЛ'
--   on conflict do nothing;
-- =====================================================================
