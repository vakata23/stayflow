-- =====================================================================
-- StayFlow — проверка на миграции 014 + 015 върху ЖИВАТА схема.
-- Пуска се СЛЕД (или заедно с) 014 и 015. ВСЕКИ път завършва с raise exception, така че цялата заявка се
-- връща назад: нищо не остава в базата (проверено с пробна схема). „DRYRUN OK: N проверки“ = всичко мина,
-- „FAIL: …“ = коя проверка е паднала. Тестовите данни са само върху двата имота (vk и aegean-…) и в нови таблици.
-- baseline = md5 на 3132 котировки на живите имоти, снето ПРЕДИ миграциите (същият ден, часова зона София).
-- =====================================================================

create function pg_temp.chk(label text, ok boolean) returns void language plpgsql as $f$
begin
  if ok is distinct from true then
    raise exception 'FAIL: %', label;
  end if;
  perform set_config('zz.n', (coalesce(nullif(current_setting('zz.n', true), ''), '0')::int + 1)::text, true);
end
$f$;

create function pg_temp.q(p_slug text, p_ci date, p_nts int, p_guests int default 2) returns jsonb
language sql as $f$
  select to_jsonb(r) from public.quote_stay(p_slug, p_ci, p_ci + p_nts, p_guests) r
$f$;

create function pg_temp.n(j jsonb, k text) returns numeric language sql immutable as $f$
  select (j ->> k)::numeric
$f$;

create function pg_temp.raises(stmt text, code text) returns boolean language plpgsql as $f$
begin
  execute stmt;
  return false;
exception when others then
  return sqlstate = code;
end
$f$;

create function pg_temp.bad_season(p uuid, sm int, sd int, em int, ed int, price numeric, minn int, nm text) returns boolean
language sql as $f$
  select pg_temp.raises(format(
    'insert into public.price_seasons (property_id, start_month, start_day, end_month, end_day, price_per_night, min_nights, name) values (%L, %s, %s, %s, %s, %s, %s, %L)',
    p, sm, sd, em, ed, price, minn, nm), '23514')
$f$;

create function pg_temp.bad_pkg(p uuid, cols text, vals text, code text default '23514') returns boolean
language sql as $f$
  select pg_temp.raises(format('insert into public.stay_packages (property_id, %s) values (%L, %s)', cols, p, vals), code)
$f$;

do $t$
#variable_conflict use_column
declare
  c_baseline constant text := 'e1041e68c4047ab2e1b86bf860dd5219';
  c_ae       constant text := 'aegean-breeze-sea-apartment-nea-kalikrat';
  v_vk uuid; v_ae uuid; v_uid uuid; v_stranger uuid := gen_random_uuid();
  v_today date := (now() at time zone 'Europe/Sofia')::date;
  v_y int := extract(year from (now() at time zone 'Europe/Sofia'))::int + 1;
  v_leap int; v_d5 date; v_isod int;
  v_j jsonb; v_cnt int; v_cnt2 int; v_cnt3 int; v_md5 text; v_t0 timestamptz;
  v_p0 uuid; v_p1 uuid; v_p2 uuid; v_p3 uuid; v_p4 uuid; v_p5 uuid; v_p6 uuid; v_p7 uuid; v_p8 uuid; v_p9 uuid;
  v_p10 uuid; v_p11 uuid; v_p12 uuid; v_pid uuid;
  v_ok boolean; v_ok2 boolean; v_upd int; v_del int; v_bi date; v_bo date;
begin
  select id into v_vk from public.properties where slug = 'vk';
  select id into v_ae from public.properties where slug = c_ae;
  perform pg_temp.chk('имотите vk и aegean съществуват', v_vk is not null and v_ae is not null);
  v_d5 := make_date(v_y, 5, 4);
  v_isod := extract(isodow from v_d5)::int;
  v_leap := v_y;
  while not ((v_leap % 4 = 0 and v_leap % 100 <> 0) or v_leap % 400 = 0) loop
    v_leap := v_leap + 1;
  end loop;

  -- 1. Структура, RLS, права ------------------------------------------------------------
  perform pg_temp.chk('price_seasons е с RLS', (select relrowsecurity from pg_class where oid = 'public.price_seasons'::regclass));
  perform pg_temp.chk('stay_packages е с RLS', (select relrowsecurity from pg_class where oid = 'public.stay_packages'::regclass));
  perform pg_temp.chk('4 политики на price_seasons', (select count(*) from pg_policies where schemaname = 'public' and tablename = 'price_seasons') = 4);
  perform pg_temp.chk('4 политики на stay_packages', (select count(*) from pg_policies where schemaname = 'public' and tablename = 'stay_packages') = 4);
  perform pg_temp.chk('price_seasons: каскадно изтриване с имота', exists (select 1 from pg_constraint where conrelid = 'public.price_seasons'::regclass and contype = 'f' and confdeltype = 'c'));
  perform pg_temp.chk('stay_packages: каскадно изтриване с имота', exists (select 1 from pg_constraint where conrelid = 'public.stay_packages'::regclass and contype = 'f' and confdeltype = 'c'));
  perform pg_temp.chk('quote_stay: anon, authenticated, service_role',
    has_function_privilege('anon', 'public.quote_stay(text,date,date,integer)', 'execute')
    and has_function_privilege('authenticated', 'public.quote_stay(text,date,date,integer)', 'execute')
    and has_function_privilege('service_role', 'public.quote_stay(text,date,date,integer)', 'execute'));
  perform pg_temp.chk('public_packages и public_seasons: anon и authenticated',
    has_function_privilege('anon', 'public.public_packages(text)', 'execute')
    and has_function_privilege('authenticated', 'public.public_packages(text)', 'execute')
    and has_function_privilege('anon', 'public.public_seasons(text)', 'execute')
    and has_function_privilege('authenticated', 'public.public_seasons(text)', 'execute'));
  perform pg_temp.chk('само една quote_stay (без остарял препокриващ се вариант)', (select count(*) from pg_proc where proname = 'quote_stay' and pronamespace = 'public'::regnamespace) = 1);

  -- 2. Регресия: цените на живите имоти са НЕПРОМЕНЕНИ при празни таблици ------------------------
  select t.m, t.quoted, t.discounted into v_md5, v_cnt, v_cnt2 from (
    with grid as (
      select s.slug, o as off, n as nts, g as guests
      from (values ('vk'), (c_ae), ('nope')) s(slug),
           generate_series(0, 400, 7) o, (values (1), (2), (6), (7), (14), (31)) t(n), (values (1), (4), (9)) u(g)
    ), q as (
      select grid.slug, grid.off, grid.nts, grid.guests, r.*
      from grid
      left join lateral public.quote_stay(grid.slug, ((now() at time zone 'Europe/Sofia')::date + grid.off), ((now() at time zone 'Europe/Sofia')::date + grid.off + grid.nts), grid.guests) r on true
    )
    select md5(string_agg(concat_ws('|', slug, off, nts, guests, nights, accommodation_total, cleaning_fee, tourist_tax, total, deposit, min_nights, fits_guests, is_available), ';' order by slug, off, nts, guests)) as m,
           count(nights)::int as quoted,
           count(*) filter (where discount <> 0 or package_id is not null)::int as discounted
    from q
  ) t;
  perform pg_temp.chk('регресия: 2088 котировки', v_cnt = 2088);
  perform pg_temp.chk('регресия: md5 на всички цени/капаро/наличност е същият', v_md5 = c_baseline);
  perform pg_temp.chk('регресия: без отстъпка при празни таблици', v_cnt2 = 0);

  -- 3. Крайни случаи на quote_stay -----------------------------------------------------------
  perform pg_temp.chk('вчерашна дата → няма котировка', pg_temp.q('vk', v_today - 1, 2) is null);
  perform pg_temp.chk('нощувки 0 → няма котировка', pg_temp.q('vk', v_today + 5, 0) is null);
  perform pg_temp.chk('0 гости → няма котировка', pg_temp.q('vk', v_today + 5, 2, 0) is null);
  perform pg_temp.chk('непознат адрес → няма котировка', pg_temp.q('nope', v_today + 5, 2) is null);
  v_j := pg_temp.q('vk', v_today, 1);
  perform pg_temp.chk('днешна дата е позволена, 60 €', pg_temp.n(v_j, 'total') = 60 and pg_temp.n(v_j, 'discount') = 0 and (v_j ->> 'package_id') is null);
  perform pg_temp.chk('отговорът има discount и package_id', v_j ? 'discount' and v_j ? 'package_id' and v_j ? 'is_available');
  select check_in, check_out into v_bi, v_bo from public.bookings where property_id = v_vk and status <> 'cancelled' and check_in >= v_today order by check_in limit 1;
  if v_bi is not null then
    perform pg_temp.chk('наличност: пресичане с резервация → заето', (pg_temp.q('vk', v_bi, 1) ->> 'is_available') = 'false');
    perform pg_temp.chk('наличност: започва в деня на напускане → свободно', (pg_temp.q('vk', v_bo, 1) ->> 'is_available') = 'true');
    perform pg_temp.chk('наличност: свършва в деня на настаняване → свободно', (pg_temp.q('vk', v_bi - 2, 2) ->> 'is_available') = 'true');
  end if;

  -- 4. Ограничения -------------------------------------------------------------------------------
  delete from public.stay_packages where property_id in (v_vk, v_ae);
  delete from public.price_seasons where property_id in (v_vk, v_ae);
  perform pg_temp.chk('сезон: месец 13', pg_temp.bad_season(v_vk, 13, 1, 3, 1, 10, 1, null));
  perform pg_temp.chk('сезон: 30 февруари', pg_temp.bad_season(v_vk, 2, 30, 3, 1, 10, 1, null));
  perform pg_temp.chk('сезон: 31 април (начало)', pg_temp.bad_season(v_vk, 4, 31, 5, 1, 10, 1, null));
  perform pg_temp.chk('сезон: 31 април (край)', pg_temp.bad_season(v_vk, 1, 1, 4, 31, 10, 1, null));
  perform pg_temp.chk('сезон: отрицателна цена', pg_temp.bad_season(v_vk, 1, 1, 2, 1, -1, 1, null));
  perform pg_temp.chk('сезон: минимум 0 нощувки', pg_temp.bad_season(v_vk, 1, 1, 2, 1, 10, 0, null));
  perform pg_temp.chk('сезон: име над 60 знака', pg_temp.bad_season(v_vk, 1, 1, 2, 1, 10, 1, repeat('x', 61)));
  insert into public.price_seasons (property_id, start_month, start_day, end_month, end_day, price_per_night) values (v_vk, 2, 29, 2, 29, 10);
  delete from public.price_seasons where property_id = v_vk;
  perform pg_temp.chk('пакет: непознат вид', pg_temp.bad_pkg(v_vk, 'kind, percent', '''bogus'', 10'));
  perform pg_temp.chk('пакет free_nights без безплатни нощувки', pg_temp.bad_pkg(v_vk, 'kind, paid_nights', '''free_nights'', 6'));
  perform pg_temp.chk('пакет free_nights с 0 платени', pg_temp.bad_pkg(v_vk, 'kind, paid_nights, free_nights', '''free_nights'', 0, 1'));
  perform pg_temp.chk('пакет percent_off с 0%', pg_temp.bad_pkg(v_vk, 'kind, min_nights, percent', '''percent_off'', 7, 0'));
  perform pg_temp.chk('пакет percent_off с 91%', pg_temp.bad_pkg(v_vk, 'kind, min_nights, percent', '''percent_off'', 7, 91'));
  perform pg_temp.chk('пакет percent_off без процент', pg_temp.bad_pkg(v_vk, 'kind, min_nights', '''percent_off'', 7'));
  perform pg_temp.chk('пакет fixed_price с обща цена 0', pg_temp.bad_pkg(v_vk, 'kind, fixed_nights, fixed_total', '''fixed_price'', 3, 0'));
  perform pg_temp.chk('пакет fixed_price с ден 8', pg_temp.bad_pkg(v_vk, 'kind, fixed_nights, fixed_total, checkin_weekday', '''fixed_price'', 3, 100, 8'));
  perform pg_temp.chk('пакет early_bird с 0 дни', pg_temp.bad_pkg(v_vk, 'kind, days_before, percent', '''early_bird'', 0, 10'));
  perform pg_temp.chk('пакет last_minute без дни', pg_temp.bad_pkg(v_vk, 'kind, percent', '''last_minute'', 10'));
  perform pg_temp.chk('пакет: краят преди началото', pg_temp.bad_pkg(v_vk, 'kind, min_nights, percent, valid_from, valid_to', '''percent_off'', 1, 10, date ''2027-06-10'', date ''2027-06-01'''));
  perform pg_temp.chk('пакет: име над 60 знака', pg_temp.bad_pkg(v_vk, 'kind, min_nights, percent, name', format('''percent_off'', 1, 10, %L', repeat('x', 61))));
  perform pg_temp.chk('пакет: без имот', pg_temp.raises('insert into public.stay_packages (kind, min_nights, percent) values (''percent_off'', 1, 10)', '23502'));
  perform pg_temp.chk('пакет: несъществуващ имот', pg_temp.raises(format('insert into public.stay_packages (property_id, kind, min_nights, percent) values (%L, ''percent_off'', 1, 10)', gen_random_uuid()), '23503'));
  insert into public.stay_packages (property_id, kind, days_before, percent) values (v_vk, 'last_minute', 0, 10);
  delete from public.stay_packages where property_id = v_vk;

  -- 5. Сезони върху vk (основна цена 60) -----------------------------------------------------------
  insert into public.price_seasons (property_id, name, start_month, start_day, end_month, end_day, price_per_night, min_nights, created_at) values
    (v_vk, 'Зима', 11, 1, 3, 31, 40, 2, now() - interval '3 minutes'),
    (v_vk, 'Лято', 6, 1, 9, 15, 100, 3, now() - interval '2 minutes');
  v_j := pg_temp.q('vk', make_date(v_y, 12, 10), 3);
  perform pg_temp.chk('зима: 3×40, минимум 2', pg_temp.n(v_j, 'accommodation_total') = 120 and pg_temp.n(v_j, 'total') = 120 and pg_temp.n(v_j, 'min_nights') = 2 and pg_temp.n(v_j, 'discount') = 0);
  v_j := pg_temp.q('vk', make_date(v_y, 7, 10), 3);
  perform pg_temp.chk('лято: 3×100, минимум 3', pg_temp.n(v_j, 'accommodation_total') = 300 and pg_temp.n(v_j, 'min_nights') = 3);
  v_j := pg_temp.q('vk', make_date(v_y, 4, 10), 3);
  perform pg_temp.chk('извън сезон: основна цена 3×60, минимум 1', pg_temp.n(v_j, 'accommodation_total') = 180 and pg_temp.n(v_j, 'min_nights') = 1);
  perform pg_temp.chk('през Нова година: 4 нощувки в зимния сезон', pg_temp.n(pg_temp.q('vk', make_date(v_y, 12, 30), 4), 'accommodation_total') = 160);
  v_j := pg_temp.q('vk', make_date(v_y, 3, 30), 3);
  perform pg_temp.chk('край на зимата: 40+40+60, минимум от нощта на настаняване', pg_temp.n(v_j, 'accommodation_total') = 140 and pg_temp.n(v_j, 'min_nights') = 2);
  perform pg_temp.chk('край на лятото: 100+100+60', pg_temp.n(pg_temp.q('vk', make_date(v_y, 9, 14), 3), 'accommodation_total') = 260);
  insert into public.price_seasons (property_id, name, start_month, start_day, end_month, end_day, price_per_night, min_nights, created_at)
    values (v_vk, 'Пик', 7, 1, 7, 31, 150, 4, now());
  v_j := pg_temp.q('vk', make_date(v_y, 7, 10), 3);
  perform pg_temp.chk('застъпване: печели последно създаденият (450, минимум 4)', pg_temp.n(v_j, 'accommodation_total') = 450 and pg_temp.n(v_j, 'min_nights') = 4);
  perform pg_temp.chk('августовските нощувки остават по лятото', pg_temp.n(pg_temp.q('vk', make_date(v_y, 8, 5), 3), 'accommodation_total') = 300);
  v_j := pg_temp.q('vk', make_date(v_y, 6, 30), 3);
  perform pg_temp.chk('престой през границата на сезоните: 100+150+150', pg_temp.n(v_j, 'accommodation_total') = 400 and pg_temp.n(v_j, 'min_nights') = 3);
  insert into public.pricing_rules (property_id, start_date, end_date, price_per_night, min_nights, created_at) values
    (v_vk, make_date(v_y, 7, 12), make_date(v_y, 7, 12), 500, 1, now()),
    (v_vk, make_date(v_y, 8, 10), make_date(v_y, 8, 10), 90, 5, now());
  v_j := pg_temp.q('vk', make_date(v_y, 7, 11), 3);
  perform pg_temp.chk('правило за дата замазва сезона: 150+500+150', pg_temp.n(v_j, 'accommodation_total') = 800 and pg_temp.n(v_j, 'min_nights') = 4);
  v_j := pg_temp.q('vk', make_date(v_y, 8, 10), 1);
  perform pg_temp.chk('правило за дата: 90 €, минимум от правилото 5', pg_temp.n(v_j, 'accommodation_total') = 90 and pg_temp.n(v_j, 'min_nights') = 5);
  insert into public.price_seasons (property_id, name, start_month, start_day, end_month, end_day, price_per_night, created_at)
    values (v_vk, 'Февруари', 2, 28, 3, 1, 70, now());
  perform pg_temp.chk('сезон до 1 март: 28 февруари + 1 март', pg_temp.n(pg_temp.q('vk', make_date(v_y, 2, 28), 2), 'accommodation_total') = 140);
  perform pg_temp.chk('високосна година: 28.02 + 29.02 + 01.03', pg_temp.n(pg_temp.q('vk', make_date(v_leap, 2, 28), 3), 'accommodation_total') = 210);
  select count(*) into v_cnt from public.public_seasons('vk');
  select to_jsonb(s) into v_j from public.public_seasons('vk') s limit 1;
  perform pg_temp.chk('public_seasons: 4 реда, подредени по месец', v_cnt = 4
    and (select start_month from public.public_seasons('vk') limit 1) = 2
    and (select max(start_month) from public.public_seasons('vk')) = 11);
  perform pg_temp.chk('public_seasons: само периоди и цени (без id и имот)', not (v_j ? 'id') and not (v_j ? 'property_id') and v_j ? 'price_per_night' and v_j ? 'min_nights');
  perform pg_temp.chk('public_seasons: непознат адрес → 0 реда', (select count(*) from public.public_seasons('nope')) = 0);
  perform pg_temp.chk('имот без сезони: public_seasons празен', (select count(*) from public.public_seasons(c_ae)) = 0);
  delete from public.price_seasons where property_id = v_vk;
  delete from public.pricing_rules where property_id = v_vk;
  perform pg_temp.chk('след изтриване на сезоните vk се връща на 60 €', pg_temp.n(pg_temp.q('vk', make_date(v_y, 12, 10), 3), 'accommodation_total') = 180);

  -- 6. Пакети върху aegean (основна 80, почистване 20, такса 1.5, капаро 25%) ----------------------
  insert into public.stay_packages (property_id, kind, name, min_nights, percent) values (v_ae, 'percent_off', 'нула', 1, 50) returning id into v_p0;
  v_j := pg_temp.q(c_ae, v_d5, 3);
  perform pg_temp.chk('имот без настройки: цена 0, оферта без ефект', pg_temp.n(v_j, 'total') = 0 and pg_temp.n(v_j, 'discount') = 0 and (v_j ->> 'package_id') is null);
  delete from public.stay_packages where id = v_p0;
  insert into public.property_settings (property_id, base_price, cleaning_fee, tourist_tax, deposit_pct) values (v_ae, 80, 20, 1.5, 25);
  v_j := pg_temp.q(c_ae, v_d5, 7);
  perform pg_temp.chk('без оферти: 7 нощувки = 560 + 20, такса 21, капаро 145',
    pg_temp.n(v_j, 'accommodation_total') = 560 and pg_temp.n(v_j, 'cleaning_fee') = 20 and pg_temp.n(v_j, 'tourist_tax') = 21
    and pg_temp.n(v_j, 'total') = 580 and pg_temp.n(v_j, 'deposit') = 145 and pg_temp.n(v_j, 'discount') = 0
    and (v_j ->> 'package_id') is null and (v_j ->> 'fits_guests') = 'true');
  perform pg_temp.chk('5 гости не се събират (макс. 4)', (pg_temp.q(c_ae, v_d5, 7, 5) ->> 'fits_guests') = 'false');

  -- 6+1
  insert into public.stay_packages (property_id, kind, name, paid_nights, free_nights, repeat_block, created_at)
    values (v_ae, 'free_nights', '6+1', 6, 1, false, now() - interval '10 minutes') returning id into v_p1;
  v_j := pg_temp.q(c_ae, v_d5, 6);
  perform pg_temp.chk('6+1: при 6 нощувки няма отстъпка', pg_temp.n(v_j, 'discount') = 0 and pg_temp.n(v_j, 'total') = 500);
  v_j := pg_temp.q(c_ae, v_d5, 7);
  perform pg_temp.chk('6+1: при 7 нощувки една е безплатна (80)',
    pg_temp.n(v_j, 'discount') = 80 and pg_temp.n(v_j, 'accommodation_total') = 560 and pg_temp.n(v_j, 'total') = 500
    and pg_temp.n(v_j, 'deposit') = 125 and (v_j ->> 'package_id')::uuid = v_p1);
  v_j := pg_temp.q(c_ae, v_d5, 14);
  perform pg_temp.chk('6+1 без повторение: при 14 нощувки пак една безплатна', pg_temp.n(v_j, 'discount') = 80 and pg_temp.n(v_j, 'total') = 1060);
  update public.stay_packages set repeat_block = true where id = v_p1;
  perform pg_temp.chk('6+1 за всеки блок: 14 → 2 безплатни', pg_temp.n(pg_temp.q(c_ae, v_d5, 14), 'discount') = 160 and pg_temp.n(pg_temp.q(c_ae, v_d5, 14), 'total') = 980);
  perform pg_temp.chk('6+1 за всеки блок: 15 и 20 → 2 безплатни', pg_temp.n(pg_temp.q(c_ae, v_d5, 15), 'discount') = 160 and pg_temp.n(pg_temp.q(c_ae, v_d5, 20), 'discount') = 160);
  v_j := pg_temp.q(c_ae, v_d5, 21);
  perform pg_temp.chk('6+1 за всеки блок: 21 → 3 безплатни', pg_temp.n(v_j, 'discount') = 240 and pg_temp.n(v_j, 'total') = 1460);
  update public.stay_packages set repeat_block = false where id = v_p1;

  -- най-изгодната от няколко
  insert into public.stay_packages (property_id, kind, name, min_nights, percent, created_at)
    values (v_ae, 'percent_off', 'Седмица', 7, 10, now() - interval '9 minutes') returning id into v_p2;
  v_j := pg_temp.q(c_ae, v_d5, 7);
  perform pg_temp.chk('най-изгодната: 6+1 (80) бие −10% (56)', pg_temp.n(v_j, 'discount') = 80 and (v_j ->> 'package_id')::uuid = v_p1);
  v_j := pg_temp.q(c_ae, v_d5, 14);
  perform pg_temp.chk('най-изгодната: −10% (112) бие 6+1 без повторение (80)', pg_temp.n(v_j, 'discount') = 112 and pg_temp.n(v_j, 'total') = 1028 and (v_j ->> 'package_id')::uuid = v_p2);
  perform pg_temp.chk('под минимума на оферти няма отстъпка (5 нощувки)', pg_temp.n(pg_temp.q(c_ae, v_d5, 5), 'discount') = 0);
  update public.stay_packages set is_active = false where id = v_p1;
  v_j := pg_temp.q(c_ae, v_d5, 7);
  perform pg_temp.chk('изключена оферта не се прилага', pg_temp.n(v_j, 'discount') = 56 and pg_temp.n(v_j, 'total') = 524 and (v_j ->> 'package_id')::uuid = v_p2);
  update public.stay_packages set is_active = true where id = v_p1;

  -- фиксирана цена
  insert into public.stay_packages (property_id, kind, name, fixed_nights, fixed_total, created_at)
    values (v_ae, 'fixed_price', 'Уикенд', 3, 150, now() - interval '8 minutes') returning id into v_p3;
  v_j := pg_temp.q(c_ae, v_d5, 3);
  perform pg_temp.chk('фиксирана цена: 3 нощувки за 150 вместо 240', pg_temp.n(v_j, 'accommodation_total') = 240 and pg_temp.n(v_j, 'discount') = 90 and pg_temp.n(v_j, 'total') = 170 and pg_temp.n(v_j, 'deposit') = 42.5 and (v_j ->> 'package_id')::uuid = v_p3);
  perform pg_temp.chk('фиксирана цена важи само за точния брой нощувки', pg_temp.n(pg_temp.q(c_ae, v_d5, 4), 'discount') = 0);
  update public.stay_packages set checkin_weekday = (v_isod % 7) + 1 where id = v_p3;
  perform pg_temp.chk('фиксирана цена: друг ден от седмицата → няма', pg_temp.n(pg_temp.q(c_ae, v_d5, 3), 'discount') = 0);
  update public.stay_packages set checkin_weekday = v_isod where id = v_p3;
  perform pg_temp.chk('фиксирана цена: същият ден от седмицата → важи', pg_temp.n(pg_temp.q(c_ae, v_d5, 3), 'discount') = 90);
  update public.stay_packages set fixed_total = 300 where id = v_p3;
  perform pg_temp.chk('фиксирана цена над обичайната не вдига цената', pg_temp.n(pg_temp.q(c_ae, v_d5, 3), 'discount') = 0);
  update public.stay_packages set fixed_nights = 1, fixed_total = 1, checkin_weekday = null where id = v_p3;
  v_j := pg_temp.q(c_ae, v_d5, 1);
  perform pg_temp.chk('отстъпката не е по-голяма от нощувките (1 € вместо 80)', pg_temp.n(v_j, 'discount') = 79 and pg_temp.n(v_j, 'total') = 21);
  delete from public.stay_packages where property_id = v_ae;

  -- ранно записване и последна минута
  insert into public.stay_packages (property_id, kind, name, days_before, percent, created_at)
    values (v_ae, 'early_bird', 'Рано', 30, 15, now() - interval '7 minutes') returning id into v_p4;
  v_j := pg_temp.q(c_ae, v_today + 30, 2);
  perform pg_temp.chk('ранно записване: точно 30 дни напред → −15% (24)', pg_temp.n(v_j, 'accommodation_total') = 160 and pg_temp.n(v_j, 'discount') = 24 and (v_j ->> 'package_id')::uuid = v_p4);
  perform pg_temp.chk('ранно записване: 29 дни → няма', pg_temp.n(pg_temp.q(c_ae, v_today + 29, 2), 'discount') = 0);
  perform pg_temp.chk('ранно записване: 200 дни → важи', pg_temp.n(pg_temp.q(c_ae, v_today + 200, 2), 'discount') = 24);
  insert into public.stay_packages (property_id, kind, name, days_before, percent, created_at)
    values (v_ae, 'last_minute', 'Последна минута', 3, 20, now() - interval '6 minutes') returning id into v_p5;
  v_j := pg_temp.q(c_ae, v_today, 2);
  perform pg_temp.chk('последна минута: днес → −20% (32)', pg_temp.n(v_j, 'discount') = 32 and (v_j ->> 'package_id')::uuid = v_p5);
  perform pg_temp.chk('последна минута: точно след 3 дни → важи', pg_temp.n(pg_temp.q(c_ae, v_today + 3, 2), 'discount') = 32);
  perform pg_temp.chk('последна минута: след 4 дни → няма', pg_temp.n(pg_temp.q(c_ae, v_today + 4, 2), 'discount') = 0);
  update public.stay_packages set days_before = 0 where id = v_p5;
  perform pg_temp.chk('последна минута „само днес“', pg_temp.n(pg_temp.q(c_ae, v_today, 2), 'discount') = 32 and pg_temp.n(pg_temp.q(c_ae, v_today + 1, 2), 'discount') = 0);
  delete from public.stay_packages where property_id = v_ae;

  -- период на важене
  insert into public.stay_packages (property_id, kind, name, min_nights, percent, valid_from, valid_to, created_at)
    values (v_ae, 'percent_off', 'Период', 1, 5, v_d5 + 10, v_d5 + 20, now() - interval '5 minutes') returning id into v_p6;
  perform pg_temp.chk('период: денят преди началото → няма', pg_temp.n(pg_temp.q(c_ae, v_d5 + 9, 2), 'discount') = 0);
  v_j := pg_temp.q(c_ae, v_d5 + 10, 2);
  perform pg_temp.chk('период: първият ден → важи (8)', pg_temp.n(v_j, 'discount') = 8 and (v_j ->> 'package_id')::uuid = v_p6);
  perform pg_temp.chk('период: последният ден → важи', pg_temp.n(pg_temp.q(c_ae, v_d5 + 20, 2), 'discount') = 8);
  perform pg_temp.chk('период: денят след края → няма', pg_temp.n(pg_temp.q(c_ae, v_d5 + 21, 2), 'discount') = 0);
  update public.stay_packages set valid_to = null where id = v_p6;
  perform pg_temp.chk('период само с начало', pg_temp.n(pg_temp.q(c_ae, v_d5 + 100, 2), 'discount') = 8 and pg_temp.n(pg_temp.q(c_ae, v_d5 + 9, 2), 'discount') = 0);
  update public.stay_packages set valid_from = null, valid_to = v_d5 + 20 where id = v_p6;
  perform pg_temp.chk('период само с край', pg_temp.n(pg_temp.q(c_ae, v_d5 + 9, 2), 'discount') = 8 and pg_temp.n(pg_temp.q(c_ae, v_d5 + 21, 2), 'discount') = 0);
  delete from public.stay_packages where property_id = v_ae;

  -- равенство: по-рано създаденият печели
  insert into public.stay_packages (property_id, kind, name, min_nights, percent, created_at)
    values (v_ae, 'percent_off', 'А', 1, 5, now() - interval '1 day') returning id into v_p7;
  insert into public.stay_packages (property_id, kind, name, min_nights, percent, created_at)
    values (v_ae, 'percent_off', 'Б', 1, 5, now()) returning id into v_p8;
  perform pg_temp.chk('равна отстъпка: печели по-рано създаденият', (pg_temp.q(c_ae, v_d5 + 40, 2) ->> 'package_id')::uuid = v_p7);
  update public.stay_packages set created_at = now() + interval '1 day' where id = v_p7;
  perform pg_temp.chk('равна отстъпка: след смяна на реда печели другият', (pg_temp.q(c_ae, v_d5 + 40, 2) ->> 'package_id')::uuid = v_p8);
  delete from public.stay_packages where property_id = v_ae;

  -- проценти и закръгляване
  insert into public.stay_packages (property_id, kind, name, min_nights, percent) values (v_ae, 'percent_off', 'Дробна', 1, 12.5) returning id into v_p9;
  v_j := pg_temp.q(c_ae, v_d5, 7);
  perform pg_temp.chk('12,5% от 560 = 70, общо 510', pg_temp.n(v_j, 'discount') = 70 and pg_temp.n(v_j, 'total') = 510);
  update public.stay_packages set percent = 90 where id = v_p9;
  v_j := pg_temp.q(c_ae, v_d5, 1);
  perform pg_temp.chk('90% (най-много): 72 от 80, общо 28', pg_temp.n(v_j, 'discount') = 72 and pg_temp.n(v_j, 'total') = 28);
  delete from public.stay_packages where property_id = v_ae;

  -- безплатни са най-евтините нощувки (сезон със по-ниска цена)
  insert into public.price_seasons (property_id, name, start_month, start_day, end_month, end_day, price_per_night, created_at)
    values (v_ae, 'Евтини дни', 6, 3, 6, 5, 50, now());
  insert into public.stay_packages (property_id, kind, name, paid_nights, free_nights, created_at)
    values (v_ae, 'free_nights', '2+1', 2, 1, now() - interval '2 minutes');
  v_j := pg_temp.q(c_ae, make_date(v_y, 6, 2), 3);
  perform pg_temp.chk('2+1: безплатна е най-евтината нощувка (50), общо 150', pg_temp.n(v_j, 'accommodation_total') = 180 and pg_temp.n(v_j, 'discount') = 50 and pg_temp.n(v_j, 'total') = 150);
  insert into public.stay_packages (property_id, kind, name, paid_nights, free_nights, created_at)
    values (v_ae, 'free_nights', '1+2', 1, 2, now() - interval '1 minute');
  v_j := pg_temp.q(c_ae, make_date(v_y, 6, 2), 3);
  perform pg_temp.chk('1+2: безплатни са двете най-евтини (100), общо 100', pg_temp.n(v_j, 'discount') = 100 and pg_temp.n(v_j, 'total') = 100);
  delete from public.stay_packages where property_id = v_ae;
  delete from public.price_seasons where property_id = v_ae;
  insert into public.price_seasons (property_id, name, start_month, start_day, end_month, end_day, price_per_night, created_at)
    values (v_ae, 'Особена цена', 7, 1, 7, 31, 33.33, now());
  insert into public.stay_packages (property_id, kind, name, min_nights, percent) values (v_ae, 'percent_off', 'Закръгляване', 1, 7.5);
  v_j := pg_temp.q(c_ae, make_date(v_y, 7, 5), 3, 4);
  perform pg_temp.chk('закръгляване: 99,99 − 7,50 + 20 = 112,49; такса 18; 4 гости се събират',
    pg_temp.n(v_j, 'accommodation_total') = 99.99 and pg_temp.n(v_j, 'discount') = 7.5 and pg_temp.n(v_j, 'total') = 112.49
    and pg_temp.n(v_j, 'tourist_tax') = 18 and (v_j ->> 'fits_guests') = 'true');
  delete from public.stay_packages where property_id = v_ae;
  delete from public.price_seasons where property_id = v_ae;

  -- бързодействие: 365 нощувки с много оферти
  insert into public.stay_packages (property_id, kind, name, paid_nights, free_nights, repeat_block) values (v_ae, 'free_nights', '6+1', 6, 1, true);
  insert into public.stay_packages (property_id, kind, name, min_nights, percent) select v_ae, 'percent_off', 'p' || g, g, 5 from generate_series(1, 20) g;
  v_t0 := clock_timestamp();
  v_j := pg_temp.q(c_ae, v_today + 10, 365);
  perform pg_temp.chk('365 нощувки с 21 оферти: под 2 секунди', clock_timestamp() - v_t0 < interval '2 seconds' and pg_temp.n(v_j, 'nights') = 365 and pg_temp.n(v_j, 'discount') > 0);
  delete from public.stay_packages where property_id = v_ae;

  -- 7. Какво вижда гостът и кой има достъп до таблиците ---------------------------------------------
  insert into public.price_seasons (property_id, name, start_month, start_day, end_month, end_day, price_per_night, created_at) values
    (v_ae, 'Евтини дни', 6, 3, 6, 5, 50, now()), (v_ae, 'Особена цена', 7, 1, 7, 31, 33.33, now());
  insert into public.stay_packages (property_id, kind, name, min_nights, percent, created_at) values (v_ae, 'percent_off', 'Видима', 1, 10, now() - interval '3 minutes') returning id into v_p10;
  insert into public.stay_packages (property_id, kind, name, min_nights, percent, valid_to, created_at) values (v_ae, 'percent_off', 'Изтекла', 1, 30, v_today - 1, now() - interval '2 minutes') returning id into v_p11;
  insert into public.stay_packages (property_id, kind, name, min_nights, percent, is_active, created_at) values (v_ae, 'percent_off', 'Изключена', 1, 40, false, now() - interval '1 minute') returning id into v_p12;

  set local role anon;
  select count(*) into v_cnt from public.public_packages(c_ae);
  select to_jsonb(p) into v_j from public.public_packages(c_ae) p limit 1;
  select count(*) into v_cnt2 from public.public_packages('nope');
  select count(*) into v_cnt3 from public.public_seasons(c_ae);
  begin
    select count(*) into v_upd from public.stay_packages;
  exception when insufficient_privilege then
    v_upd := 0;
  end;
  begin
    select count(*) into v_del from public.price_seasons;
  exception when insufficient_privilege then
    v_del := 0;
  end;
  begin
    insert into public.stay_packages (property_id, kind, min_nights, percent) values (v_ae, 'percent_off', 1, 10);
    v_ok := false;
  exception when others then
    v_ok := true;
  end;
  begin
    insert into public.price_seasons (property_id, start_month, start_day, end_month, end_day, price_per_night) values (v_ae, 1, 1, 2, 1, 10);
    v_ok2 := false;
  exception when others then
    v_ok2 := true;
  end;
  reset role;
  perform pg_temp.chk('гостът (anon) вижда само включените и неизтекли оферти: 1', v_cnt = 1);
  perform pg_temp.chk('public_packages: параметри, без id на имота', v_j ? 'kind' and v_j ? 'percent' and v_j ? 'valid_to' and not (v_j ? 'property_id'));
  perform pg_temp.chk('public_packages: непознат адрес → 0', v_cnt2 = 0);
  perform pg_temp.chk('public_seasons: 2 сезона за гостите', v_cnt3 = 2);
  perform pg_temp.chk('anon не чете stay_packages и price_seasons', v_upd = 0 and v_del = 0);
  perform pg_temp.chk('anon не може да пише в stay_packages и price_seasons', v_ok and v_ok2);
  v_j := null;
  set local role anon;
  select to_jsonb(r) into v_j from public.quote_stay(c_ae, v_d5, v_d5 + 7, 2) r;
  reset role;
  perform pg_temp.chk('anon котировка: само „Видима“ −10% = 56 (изтекла и изключена не важат)', pg_temp.n(v_j, 'discount') = 56 and (v_j ->> 'package_id')::uuid = v_p10);

  select user_id into v_uid from public.profiles where id = (select owner_id from public.properties where id = v_ae);
  perform pg_temp.chk('собственикът има user_id', v_uid is not null);
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_uid::text, true);
  set local role authenticated;
  select count(*) into v_cnt from public.stay_packages where property_id = v_ae;
  select count(*) into v_cnt2 from public.price_seasons where property_id = v_ae;
  insert into public.stay_packages (property_id, kind, name, min_nights, percent) values (v_ae, 'percent_off', 'от собственика', 1, 10) returning id into v_pid;
  update public.stay_packages set percent = 11 where id = v_pid;
  get diagnostics v_upd = row_count;
  delete from public.stay_packages where id = v_pid;
  get diagnostics v_del = row_count;
  reset role;
  perform pg_temp.chk('собственикът вижда своите 3 оферти и 2 сезона', v_cnt = 3 and v_cnt2 = 2);
  perform pg_temp.chk('собственикът добавя, променя и трие', v_upd = 1 and v_del = 1);

  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_stranger::text, true);
  set local role authenticated;
  select count(*) into v_cnt from public.stay_packages;
  select count(*) into v_cnt2 from public.price_seasons;
  begin
    insert into public.stay_packages (property_id, kind, min_nights, percent) values (v_ae, 'percent_off', 1, 10);
    v_ok := false;
  exception when others then
    v_ok := (sqlstate = '42501');
  end;
  begin
    insert into public.price_seasons (property_id, start_month, start_day, end_month, end_day, price_per_night) values (v_ae, 1, 1, 2, 1, 10);
    v_ok2 := false;
  exception when others then
    v_ok2 := (sqlstate = '42501');
  end;
  update public.stay_packages set percent = 99 where id = v_p10;
  get diagnostics v_upd = row_count;
  delete from public.stay_packages where id = v_p10;
  get diagnostics v_del = row_count;
  reset role;
  perform pg_temp.chk('чужд потребител не вижда нищо', v_cnt = 0 and v_cnt2 = 0);
  perform pg_temp.chk('чужд потребител не може да добавя (RLS)', v_ok and v_ok2);
  perform pg_temp.chk('чужд потребител не променя и не трие чужди оферти', v_upd = 0 and v_del = 0);
  perform pg_temp.chk('офертата на собственика е непокътната', (select percent from public.stay_packages where id = v_p10) = 10);

  raise exception 'DRYRUN OK: % проверки', current_setting('zz.n');
end
$t$;
