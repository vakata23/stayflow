-- ============================================================================
-- Миграция 008: Разходи и допълнителни приходи — печалба (Етап 6)
--
-- money_entries: ръчно въведени разходи/приходи извън самите резервации
-- (почистване, ток, ремонт... / допълнителна услуга, наем извън платформа).
-- property_id = null означава "общо за всички имоти" (напр. счетоводство) —
-- влиза в общата сметка (earnings_by_month), но НЕ се приписва на конкретен
-- имот в earnings_by_property; там вместо това излиза отделен ред
-- "Общи разходи", само ако наистина има такива записи в периода.
--
-- Идемпотентна: безопасно за повторно пускане.
-- ============================================================================

create table if not exists public.money_entries (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  property_id  uuid references public.properties (id) on delete cascade,
  kind         text not null check (kind in ('expense', 'income')),
  category     text not null,
  amount       numeric(10, 2) not null check (amount > 0),
  entry_date   date not null,
  note         text,
  receipt_path text,
  created_at   timestamptz not null default now(),
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

create index if not exists money_entries_profile_date_idx on public.money_entries (profile_id, entry_date);
create index if not exists money_entries_property_date_idx on public.money_entries (property_id, entry_date);

alter table public.money_entries enable row level security;

drop policy if exists "money_entries_select_own" on public.money_entries;
create policy "money_entries_select_own" on public.money_entries
  for select using (profile_id = public.current_profile_id());

drop policy if exists "money_entries_insert_own" on public.money_entries;
create policy "money_entries_insert_own" on public.money_entries
  for insert with check (
    profile_id = public.current_profile_id()
    and (property_id is null or public.owns_property(property_id))
  );

drop policy if exists "money_entries_update_own" on public.money_entries;
create policy "money_entries_update_own" on public.money_entries
  for update using (profile_id = public.current_profile_id())
  with check (
    profile_id = public.current_profile_id()
    and (property_id is null or public.owns_property(property_id))
  );

drop policy if exists "money_entries_delete_own" on public.money_entries;
create policy "money_entries_delete_own" on public.money_entries
  for delete using (profile_id = public.current_profile_id());

-- Частен bucket за снимки на касови бележки — достъп само до собствената
-- папка (auth.uid()), точно като cleaning-photos от Етап 1.
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

drop policy if exists "receipts_owner_read" on storage.objects;
create policy "receipts_owner_read" on storage.objects
  for select using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "receipts_owner_insert" on storage.objects;
create policy "receipts_owner_insert" on storage.objects
  for insert with check (
    bucket_id = 'receipts'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "receipts_owner_delete" on storage.objects;
create policy "receipts_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ----------------------------------------------------------------------------
-- earnings_by_month — разширена с other_income/expenses/profit.
-- Връщаният тип се променя (нови колони), затова DROP преди CREATE —
-- CREATE OR REPLACE не позволява смяна на RETURNS TABLE списъка.
-- ----------------------------------------------------------------------------
drop function if exists public.earnings_by_month(date, date);

create function public.earnings_by_month(p_from date, p_to date)
returns table (
  month date, available_nights int, nights_sold int, occupancy_pct numeric,
  revenue numeric, commission numeric, net numeric, adr numeric, revpar numeric,
  direct_revenue numeric, ota_revenue numeric, direct_share_pct numeric, commission_saved numeric,
  other_income numeric, expenses numeric, profit numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with months as (
    select m::date as month_start,
           greatest(m::date, p_from) as d_from,
           least((m + interval '1 month')::date - 1, p_to) as d_to
    from generate_series(date_trunc('month', p_from::timestamp),
                         date_trunc('month', p_to::timestamp), interval '1 month') as m
  ),
  nights as (
    select
      d::date as night,
      b.source in ('airbnb', 'booking') as is_ota,
      b.total_price / (b.check_out - b.check_in) as rev,
      b.commission / (b.check_out - b.check_in) as comm,
      coalesce(ps.ota_commission_pct, 15.0) as pct
    from public.bookings b
    left join public.property_settings ps on ps.property_id = b.property_id
    cross join lateral generate_series(greatest(b.check_in, p_from)::timestamp,
                                       least(b.check_out - 1, p_to)::timestamp,
                                       interval '1 day') as d
    where b.status = 'confirmed'
      and b.total_price is not null
      and b.check_in <= p_to and b.check_out > p_from
  ),
  property_count as (
    select count(*)::int as n from public.properties
  ),
  money as (
    select
      date_trunc('month', me.entry_date)::date as month_start,
      sum(me.amount) filter (where me.kind = 'income') as income,
      sum(me.amount) filter (where me.kind = 'expense') as expense
    from public.money_entries me
    where me.entry_date between p_from and p_to
    group by 1
  )
  select
    mo.month_start,
    pc.n * (mo.d_to - mo.d_from + 1),
    count(n.night)::int,
    round(100.0 * count(n.night) / nullif(pc.n * (mo.d_to - mo.d_from + 1), 0), 1),
    round(coalesce(sum(n.rev), 0), 2),
    round(coalesce(sum(n.comm), 0), 2),
    round(coalesce(sum(n.rev), 0) - coalesce(sum(n.comm), 0), 2),
    round(sum(n.rev) / nullif(count(n.night), 0), 2),
    round(coalesce(sum(n.rev), 0) / nullif(pc.n * (mo.d_to - mo.d_from + 1), 0), 2),
    round(coalesce(sum(n.rev) filter (where not n.is_ota), 0), 2),
    round(coalesce(sum(n.rev) filter (where n.is_ota), 0), 2),
    round(100.0 * sum(n.rev) filter (where not n.is_ota) / nullif(sum(n.rev), 0), 1),
    round(coalesce(sum(n.rev * n.pct / 100.0) filter (where not n.is_ota), 0), 2),
    round(coalesce(mny.income, 0), 2),
    round(coalesce(mny.expense, 0), 2),
    round(coalesce(sum(n.rev), 0) - coalesce(sum(n.comm), 0) + coalesce(mny.income, 0) - coalesce(mny.expense, 0), 2)
  from months mo
  cross join property_count pc
  left join nights n on n.night between mo.d_from and mo.d_to
  left join money mny on mny.month_start = mo.month_start
  group by mo.month_start, mo.d_from, mo.d_to, pc.n, mny.income, mny.expense
  order by mo.month_start;
$$;

revoke execute on function public.earnings_by_month(date, date) from public, anon;
grant execute on function public.earnings_by_month(date, date) to authenticated;

-- ----------------------------------------------------------------------------
-- earnings_by_property — разширена с other_income/expenses/profit + ред
-- "Общи разходи" за записите без property_id (само ако има такива в периода).
-- ----------------------------------------------------------------------------
drop function if exists public.earnings_by_property(date, date);

create function public.earnings_by_property(p_from date, p_to date)
returns table (
  property_id uuid, property_name text, nights_sold int, occupancy_pct numeric,
  revenue numeric, net numeric, adr numeric, direct_share_pct numeric,
  other_income numeric, expenses numeric, profit numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with nights as (
    select
      b.property_id,
      b.source in ('airbnb', 'booking') as is_ota,
      b.total_price / (b.check_out - b.check_in) as rev,
      b.commission / (b.check_out - b.check_in) as comm
    from public.bookings b
    cross join lateral generate_series(greatest(b.check_in, p_from)::timestamp,
                                       least(b.check_out - 1, p_to)::timestamp,
                                       interval '1 day') as d
    where b.status = 'confirmed'
      and b.total_price is not null
      and b.check_in <= p_to and b.check_out > p_from
  ),
  money_by_property as (
    select
      me.property_id,
      sum(me.amount) filter (where me.kind = 'income') as income,
      sum(me.amount) filter (where me.kind = 'expense') as expense
    from public.money_entries me
    where me.entry_date between p_from and p_to
      and me.property_id is not null
    group by me.property_id
  ),
  general_money as (
    select
      sum(me.amount) filter (where me.kind = 'income') as income,
      sum(me.amount) filter (where me.kind = 'expense') as expense
    from public.money_entries me
    where me.entry_date between p_from and p_to
      and me.property_id is null
  ),
  per_property as (
    select
      p.id as property_id,
      p.name as property_name,
      count(n.rev)::int as nights_sold,
      round(100.0 * count(n.rev) / (p_to - p_from + 1), 1) as occupancy_pct,
      round(coalesce(sum(n.rev), 0), 2) as revenue,
      round(coalesce(sum(n.rev), 0) - coalesce(sum(n.comm), 0), 2) as net,
      round(sum(n.rev) / nullif(count(n.rev), 0), 2) as adr,
      round(100.0 * sum(n.rev) filter (where not n.is_ota) / nullif(sum(n.rev), 0), 1) as direct_share_pct,
      round(coalesce(mp.income, 0), 2) as other_income,
      round(coalesce(mp.expense, 0), 2) as expenses,
      round(coalesce(sum(n.rev), 0) - coalesce(sum(n.comm), 0) + coalesce(mp.income, 0) - coalesce(mp.expense, 0), 2) as profit
    from public.properties p
    left join nights n on n.property_id = p.id
    left join money_by_property mp on mp.property_id = p.id
    group by p.id, p.name, mp.income, mp.expense
  )
  select * from per_property
  union all
  select
    null::uuid, 'Общи разходи'::text, 0, null::numeric, 0::numeric, 0::numeric, null::numeric, null::numeric,
    round(coalesce(gm.income, 0), 2),
    round(coalesce(gm.expense, 0), 2),
    round(coalesce(gm.income, 0) - coalesce(gm.expense, 0), 2)
  from general_money gm
  where coalesce(gm.income, 0) <> 0 or coalesce(gm.expense, 0) <> 0
  order by revenue desc nulls last;
$$;

revoke execute on function public.earnings_by_property(date, date) from public, anon;
grant execute on function public.earnings_by_property(date, date) to authenticated;

select 'Миграция 008 е пусната успешно' as status;
