-- ============================================================================
-- Миграция 012: автоматични разходи и приходи по правила (Етап 8)
--
-- recurring_rules: правила, които собственикът сам е задал (напр. „Почистване
-- 25 € за резервация“, „Интернет 20 € на месец“). Нищо не се измисля — няма
-- правило, няма запис.
-- generate_auto_entries(): превръща правилата в записи в money_entries
-- (008), така че печалбата ги брои без друга промяна. Идемпотентна:
--   • уникални индекси — един запис на правило за месец / за резервация;
--   • „надгробни плочи“ (auto_entry_skips) — ръчно изтрит автоматичен запис
--     НЕ се създава наново; ръчно редактиран запис губи „авто“, но остава
--     и също не се дублира.
-- Отказана/изтрита резервация → автоматичните ѝ (нередактирани) записи се
-- махат.
--
-- Идемпотентна миграция: безопасно за повторно пускане.
-- ============================================================================

-- 1. Правила ------------------------------------------------------------------
create table if not exists public.recurring_rules (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  property_id  uuid references public.properties (id) on delete cascade, -- null = всички имоти
  kind         text not null check (kind in ('expense', 'income')),
  category     text not null,
  label        text not null check (length(btrim(label)) between 1 and 80),
  amount       numeric(10, 2) not null check (amount > 0),
  frequency    text not null check (frequency in ('monthly', 'per_stay', 'per_night')),
  day_of_month smallint,
  starts_on    date not null check (starts_on >= date '2020-01-01'),
  ends_on      date,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on),
  check (
    (frequency = 'monthly' and day_of_month is not null and day_of_month between 1 and 31)
    or (frequency <> 'monthly' and day_of_month is null)
  ),
  check (
    (kind = 'expense' and category in (
      'Почистване', 'Ток', 'Вода', 'Интернет/ТВ', 'Ремонт', 'Консумативи',
      'Данъци и такси', 'Счетоводство', 'Реклама', 'Друго'
    ))
    or
    (kind = 'income' and category in (
      'Допълнителна услуга', 'Наем извън платформа', 'Друго'
    ))
  )
);

create index if not exists recurring_rules_profile_idx on public.recurring_rules (profile_id, active);

alter table public.recurring_rules enable row level security;

drop policy if exists "recurring_rules_select_own" on public.recurring_rules;
create policy "recurring_rules_select_own" on public.recurring_rules
  for select using (profile_id = public.current_profile_id());

drop policy if exists "recurring_rules_insert_own" on public.recurring_rules;
create policy "recurring_rules_insert_own" on public.recurring_rules
  for insert with check (
    profile_id = public.current_profile_id()
    and (property_id is null or public.owns_property(property_id))
  );

drop policy if exists "recurring_rules_update_own" on public.recurring_rules;
create policy "recurring_rules_update_own" on public.recurring_rules
  for update using (profile_id = public.current_profile_id())
  with check (
    profile_id = public.current_profile_id()
    and (property_id is null or public.owns_property(property_id))
  );

drop policy if exists "recurring_rules_delete_own" on public.recurring_rules;
create policy "recurring_rules_delete_own" on public.recurring_rules
  for delete using (profile_id = public.current_profile_id());

-- 2. Връзка запис → правило / резервация --------------------------------------
alter table public.money_entries add column if not exists rule_id uuid references public.recurring_rules (id) on delete set null;
alter table public.money_entries add column if not exists booking_id uuid references public.bookings (id) on delete set null;
alter table public.money_entries add column if not exists is_auto boolean not null default false;
alter table public.money_entries add column if not exists auto_period date; -- 1-во число на месеца (само monthly)

create unique index if not exists money_entries_auto_monthly_uq
  on public.money_entries (rule_id, auto_period)
  where rule_id is not null and auto_period is not null;

create unique index if not exists money_entries_auto_booking_uq
  on public.money_entries (rule_id, booking_id)
  where rule_id is not null and booking_id is not null;

-- 3. „Надгробни плочи“: ръчно изтрит автоматичен запис не се връща ------------
create table if not exists public.auto_entry_skips (
  id          uuid primary key default gen_random_uuid(),
  rule_id     uuid not null references public.recurring_rules (id) on delete cascade,
  auto_period date,
  booking_id  uuid references public.bookings (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create unique index if not exists auto_entry_skips_monthly_uq
  on public.auto_entry_skips (rule_id, auto_period) where auto_period is not null;
create unique index if not exists auto_entry_skips_booking_uq
  on public.auto_entry_skips (rule_id, booking_id) where booking_id is not null;

-- RLS без политики + без права: достъп само през security-definer функциите.
alter table public.auto_entry_skips enable row level security;
revoke all on table public.auto_entry_skips from anon, authenticated;

-- 4. Тригери ------------------------------------------------------------------
-- Редакция на автоматичен запис → губи „авто“ (остава със същото правило/месец,
-- за да не се дублира).
create or replace function public.money_entries_unauto_on_edit()
returns trigger
language plpgsql
as $$
begin
  if old.is_auto and new.is_auto
     and (new.amount, new.entry_date, new.category, new.property_id, new.note, new.kind)
         is distinct from
         (old.amount, old.entry_date, old.category, old.property_id, old.note, old.kind) then
    new.is_auto := false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_money_entries_unauto on public.money_entries;
create trigger trg_money_entries_unauto
  before update on public.money_entries
  for each row execute function public.money_entries_unauto_on_edit();

-- Изтриване на запис, свързан с правило → плоча (освен ако изтрива системата).
create or replace function public.money_entries_skip_on_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.rule_id is not null
     and (old.auto_period is not null or old.booking_id is not null)
     and coalesce(current_setting('stayflow.system_delete', true), 'off') <> 'on' then
    begin
      insert into public.auto_entry_skips (rule_id, auto_period, booking_id)
      values (old.rule_id, old.auto_period, old.booking_id)
      on conflict do nothing;
    exception when foreign_key_violation then
      null; -- правилото/резервацията се трият едновременно (каскада)
    end;
  end if;
  return old;
end;
$$;

revoke execute on function public.money_entries_skip_on_delete() from public, anon, authenticated;

drop trigger if exists trg_money_entries_skip on public.money_entries;
create trigger trg_money_entries_skip
  before delete on public.money_entries
  for each row execute function public.money_entries_skip_on_delete();

-- Изтриване на резервация → махат се нередактираните ѝ автоматични записи.
create or replace function public.bookings_cleanup_auto_entries()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('stayflow.system_delete', 'on', true);
  delete from public.money_entries where booking_id = old.id and is_auto;
  perform set_config('stayflow.system_delete', 'off', true);
  return old;
end;
$$;

revoke execute on function public.bookings_cleanup_auto_entries() from public, anon, authenticated;

drop trigger if exists trg_bookings_cleanup_auto on public.bookings;
create trigger trg_bookings_cleanup_auto
  before delete on public.bookings
  for each row execute function public.bookings_cleanup_auto_entries();

-- Изтриване на правило → останалите записи стават обикновени (не „авто“).
create or replace function public.recurring_rules_release_entries()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.money_entries set is_auto = false where rule_id = old.id and is_auto;
  return old;
end;
$$;

revoke execute on function public.recurring_rules_release_entries() from public, anon, authenticated;

drop trigger if exists trg_recurring_rules_release on public.recurring_rules;
create trigger trg_recurring_rules_release
  before delete on public.recurring_rules
  for each row execute function public.recurring_rules_release_entries();

-- 5. Генератор ----------------------------------------------------------------
-- p_today: само за тестове/сървъра; по подразбиране — днес по Europe/Sofia.
-- Достъпна САМО за service role (revoke по-долу). Собствениците викат
-- generate_my_auto_entries(), която няма параметри и ползва техния профил.
create or replace function public.generate_auto_entries(p_profile_id uuid, p_today date default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today   date := coalesce(p_today, (now() at time zone 'Europe/Sofia')::date);
  v_created int := 0;
  v_n       int;
begin
  -- Резервации, които вече не са потвърдени (отказани/върнати в запитване):
  -- махаме нередактираните им автоматични записи.
  perform set_config('stayflow.system_delete', 'on', true);
  delete from public.money_entries me
  using public.bookings b
  where me.booking_id = b.id
    and me.profile_id = p_profile_id
    and me.is_auto
    and b.status <> 'confirmed';
  perform set_config('stayflow.system_delete', 'off', true);

  -- На месец: от началото на правилото до днес.
  insert into public.money_entries
    (profile_id, property_id, kind, category, amount, entry_date, note, rule_id, is_auto, auto_period)
  select r.profile_id, r.property_id, r.kind, r.category, r.amount, due.d, r.label, r.id, true, due.m
  from public.recurring_rules r
  cross join lateral generate_series(
    date_trunc('month', r.starts_on::timestamp),
    date_trunc('month', v_today::timestamp),
    interval '1 month'
  ) as gs(m0)
  cross join lateral (
    select gs.m0::date as m,
           gs.m0::date + (least(r.day_of_month,
             extract(day from (gs.m0 + interval '1 month' - interval '1 day'))::int) - 1) as d
  ) as due
  where r.profile_id = p_profile_id
    and r.active
    and r.frequency = 'monthly'
    and due.d >= r.starts_on
    and due.d <= v_today
    and (r.ends_on is null or due.d <= r.ends_on)
    and not exists (
      select 1 from public.auto_entry_skips s where s.rule_id = r.id and s.auto_period = due.m
    )
  on conflict do nothing;
  get diagnostics v_n = row_count;
  v_created := v_created + v_n;

  -- На резервация / на нощувка: при check_out ≤ днес, само потвърдени.
  insert into public.money_entries
    (profile_id, property_id, kind, category, amount, entry_date, note, rule_id, is_auto, booking_id)
  select r.profile_id, b.property_id, r.kind, r.category,
         case r.frequency when 'per_night' then r.amount * (b.check_out - b.check_in) else r.amount end,
         b.check_out, r.label, r.id, true, b.id
  from public.recurring_rules r
  join public.properties p
    on p.owner_id = r.profile_id and (r.property_id is null or r.property_id = p.id)
  join public.bookings b on b.property_id = p.id
  where r.profile_id = p_profile_id
    and r.active
    and r.frequency in ('per_stay', 'per_night')
    and b.status = 'confirmed'
    and b.check_out <= v_today
    and b.check_out >= r.starts_on
    and (r.ends_on is null or b.check_out <= r.ends_on)
    and not exists (
      select 1 from public.auto_entry_skips s where s.rule_id = r.id and s.booking_id = b.id
    )
  on conflict do nothing;
  get diagnostics v_n = row_count;
  v_created := v_created + v_n;

  return v_created;
end;
$$;

revoke execute on function public.generate_auto_entries(uuid, date) from public, anon, authenticated;

-- За собственика: без параметри — само неговите правила, само „днес“.
create or replace function public.generate_my_auto_entries()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid := public.current_profile_id();
begin
  if v_profile is null then
    return 0;
  end if;
  return public.generate_auto_entries(v_profile, null);
end;
$$;

revoke execute on function public.generate_my_auto_entries() from public, anon;
grant execute on function public.generate_my_auto_entries() to authenticated;

-- 6. Изтриване на правило с избор: да махне ли вече създадените записи --------
-- security INVOKER — RLS гарантира, че работи само върху свои правила.
create or replace function public.delete_recurring_rule(p_rule_id uuid, p_remove_entries boolean)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_removed int := 0;
begin
  if not exists (select 1 from public.recurring_rules where id = p_rule_id) then
    raise exception 'Правилото не е намерено.';
  end if;

  if p_remove_entries then
    delete from public.money_entries where rule_id = p_rule_id and is_auto;
    get diagnostics v_removed = row_count;
  end if;

  delete from public.recurring_rules where id = p_rule_id;
  return v_removed;
end;
$$;

revoke execute on function public.delete_recurring_rule(uuid, boolean) from public, anon;
grant execute on function public.delete_recurring_rule(uuid, boolean) to authenticated;

select 'Миграция 012 е пусната успешно' as status;
