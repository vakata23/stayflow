-- ============================================================================
-- Миграция 007: Известия към собственика — outbox + Telegram/имейл адаптери
-- (Етап 5 от product-playbook.md: "известия", първо събитие "Нова заявка").
--
-- Канално-агностичен outbox: заявка за резервация → тригър пълни outbox за
-- всеки включен канал на собственика → сървърен процесор (Netlify функция)
-- доставя през адаптер на канала. Добавяне на канал = нов адаптер, не нова
-- схема. 'push' е включен в CHECK-а за бъдеща употреба, но засега само
-- email/telegram имат работещ адаптер — вижте src/lib/notificationAdapters.js.
--
-- Идемпотентна: безопасно за повторно пускане.
-- ============================================================================

-- 1. Къде собственикът иска известия -----------------------------------------
create table if not exists public.notification_targets (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  channel     text not null check (channel in ('email', 'telegram', 'push')),
  address     text not null,
  events      text[] not null default '{new_booking_request}',
  is_enabled  boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (profile_id, channel, address)
);

-- 2. Outbox — приложният код (тригърът) пълни, процесорът доставя -----------
create table if not exists public.outbox (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  target_id   uuid references public.notification_targets (id) on delete set null,
  channel     text not null,
  recipient   text not null,
  event       text not null,
  payload     jsonb not null default '{}'::jsonb,
  status      text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  attempts    smallint not null default 0,
  last_error  text,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);

create index if not exists outbox_status_created_idx on public.outbox (status, created_at);
create index if not exists notification_targets_profile_idx on public.notification_targets (profile_id);

alter table public.notification_targets enable row level security;
alter table public.outbox enable row level security;

drop policy if exists "notification_targets_manage_own" on public.notification_targets;
create policy "notification_targets_manage_own" on public.notification_targets
  for all using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());

-- Само select — записването в outbox е през тригъра (security definer) или
-- service role (процесорът), никога директно от собственика.
drop policy if exists "outbox_select_own" on public.outbox;
create policy "outbox_select_own" on public.outbox
  for select using (profile_id = public.current_profile_id());

-- 3. Тригър: нова заявка за резервация → ред в outbox за всеки включен канал
create or replace function public.enqueue_new_booking_request_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_profile uuid;
  v_property_name text;
  t record;
begin
  select p.owner_id, p.name into v_owner_profile, v_property_name
  from public.properties p
  where p.id = new.property_id;

  if v_owner_profile is null then
    return new;
  end if;

  for t in
    select *
    from public.notification_targets
    where profile_id = v_owner_profile
      and is_enabled
      and 'new_booking_request' = any(events)
  loop
    insert into public.outbox (profile_id, target_id, channel, recipient, event, payload)
    values (
      v_owner_profile,
      t.id,
      t.channel,
      t.address,
      'new_booking_request',
      jsonb_build_object(
        'booking_request_id', new.id,
        'property_name', v_property_name,
        'guest_name', new.guest_name,
        'check_in', new.check_in,
        'check_out', new.check_out,
        'num_guests', new.num_guests,
        'quoted_total', new.quoted_total
      )
    );
  end loop;

  return new;
end;
$$;

revoke execute on function public.enqueue_new_booking_request_notification() from public, anon, authenticated;

drop trigger if exists trg_enqueue_new_booking_request on public.booking_requests;
create trigger trg_enqueue_new_booking_request
  after insert on public.booking_requests
  for each row execute function public.enqueue_new_booking_request_notification();

-- 4. RPC: собственикът праща тестово известие към свой собствен target ------
create or replace function public.send_test_notification(p_target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.notification_targets;
begin
  select * into t from public.notification_targets where id = p_target_id;

  if t.id is null or t.profile_id <> public.current_profile_id() then
    raise exception 'Нямате достъп до този адресат.';
  end if;

  insert into public.outbox (profile_id, target_id, channel, recipient, event, payload)
  values (t.profile_id, t.id, t.channel, t.address, 'test', '{}'::jsonb);
end;
$$;

revoke execute on function public.send_test_notification(uuid) from public, anon;
grant execute on function public.send_test_notification(uuid) to authenticated;

select 'Миграция 007 е пусната успешно' as status;
