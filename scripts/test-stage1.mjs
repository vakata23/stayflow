// Тества StayFlow schema.sql + миграции 002/003/004/005 в памет (PGlite), със
// заместители за Supabase auth схемата, auth.uid(), ролите anon/authenticated
// и подразбиращите се права на достъп на Supabase. Проверява: комисиона,
// плащания/остатъци, настройки по имот (и RLS изолацията им), канали,
// числата на earnings_by_month/earnings_by_property — вкл. „спестена
// комисиона" с РАЗЛИЧНА ставка на два имота на един собственик — и
// bookings_sold() (резервации по дата на създаване, не по нощувка).
//
// Еднократно, в произволна scratch папка:  npm i @electric-sql/pglite
// Пускане от там:                           node <path>/test-stage1.mjs [path/to/stayflow]
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const req = createRequire(pathToFileURL(join(process.cwd(), 'noop.js')).href);
const load = async (spec) => {
  const m = await import(pathToFileURL(req.resolve(spec)).href);
  return { ...m.default, ...m };
};
const { PGlite } = await load('@electric-sql/pglite');
const { btree_gist } = await load('@electric-sql/pglite/contrib/btree_gist');

// Проектната папка на StayFlow (supabase/schema.sql + supabase/migrations/*)
const projectDir = process.argv[2] ?? 'C:/Users/user/vala/stayflow';
const sqlFiles = [
  join(projectDir, 'supabase/schema.sql'),
  join(projectDir, 'supabase/migrations/002_ical_sync.sql'),
  join(projectDir, 'supabase/migrations/003_guest_card.sql'),
  join(projectDir, 'supabase/migrations/004_commission_earnings.sql'),
  join(projectDir, 'supabase/migrations/005_bookings_sold.sql'),
  join(projectDir, 'supabase/migrations/006_public_booking_site.sql'),
  join(projectDir, 'supabase/migrations/007_notifications.sql'),
  join(projectDir, 'supabase/migrations/008_money_entries.sql'),
  join(projectDir, 'supabase/migrations/009_listing_page.sql'),
  join(projectDir, 'supabase/migrations/010_ai_listing_setup.sql'),
  join(projectDir, 'supabase/migrations/011_photo_rooms.sql'),
  join(projectDir, 'supabase/migrations/012_recurring_rules.sql'),
  join(projectDir, 'supabase/migrations/013_public_photo_thumbs.sql'),
  join(projectDir, 'supabase/migrations/014_price_seasons.sql'),
  join(projectDir, 'supabase/migrations/015_stay_packages.sql'),
];

const db = new PGlite({ extensions: { btree_gist } });

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
};
const expectError = async (name, sql, re) => {
  try { await db.exec(sql); ok(name, false, 'no error raised'); }
  catch (e) { ok(name, re.test(e.message), e.message.split('\n')[0]); }
};
const as = async (role, uid, sql) => {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false);`);
  try { return (await db.query(sql)).rows; }
  finally { await db.exec(`reset role;`); }
};
const asErr = async (name, role, uid, sql, re) => {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false);`);
  try { await db.query(sql); ok(name, false, 'no error raised'); }
  catch (e) { ok(name, re.test(e.message), e.message.split('\n')[0]); }
  finally { await db.exec(`reset role;`); }
};
const num = (v) => (v === null ? null : Number(v));
// Supabase/pg връща date колони като JS Date обекти — .toString() им дава
// локализиран формат ("Mon Dec 01 2026…"), не ISO, затова сравняваме explicit.
const monthKey = (m) => (m instanceof Date ? m.toISOString() : String(m)).slice(0, 7);
const same = (actual, expected) =>
  Object.entries(expected).every(([k, v]) => (typeof v === 'number' ? num(actual[k]) === v : actual[k] === v));
const show = (row, keys) => keys.map((k) => `${k}=${row[k]}`).join(' ');

// --- Supabase заместители: auth/storage схема, auth.uid(), роли, подразбиращи се права
await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key, raw_user_meta_data jsonb not null default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.role() returns text language sql stable as
    $$ select case when auth.uid() is null then 'anon' else 'authenticated' end $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  create function storage.foldername(name text) returns text[] language sql immutable as
    $$ select string_to_array(name, '/') $$;
  create role anon; create role authenticated;
  grant usage on schema auth to anon, authenticated;
  grant usage on schema storage to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant execute on function auth.role() to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;
  alter default privileges in schema public grant execute on functions to anon, authenticated;
  grant select, insert, update, delete on storage.objects to anon, authenticated;
`);

for (const f of sqlFiles) {
  try { await db.exec(readFileSync(f, 'utf8')); ok(`load ${f.split(/[\\/]/).pop()}`, true); }
  catch (e) { ok(`load ${f.split(/[\\/]/).pop()}`, false, e.message); console.log(e); process.exit(1); }
}

const A = '11111111-1111-1111-1111-111111111111'; // собственик на Студио 1 + Апартамент 2
const B = '22222222-2222-2222-2222-222222222222'; // друг собственик (изолация)

await db.exec(`insert into auth.users values ('${A}'), ('${B}');`);

// handle_new_user() трябва да е създал профил автоматично при insert в auth.users.
const profA = (await db.query(`select id::text as id from profiles where user_id = '${A}'`)).rows[0]?.id;
const profB = (await db.query(`select id::text as id from profiles where user_id = '${B}'`)).rows[0]?.id;
ok('handle_new_user() създаде профил за A и B автоматично', !!profA && !!profB, `profA=${profA} profB=${profB}`);

const U1 = 'c1c1c1c1-0000-0000-0000-000000000000'; // Студио 1 (A), 15% OTA комисиона
const U2 = 'c2c2c2c2-0000-0000-0000-000000000000'; // Апартамент 2 (A), 20% OTA комисиона — нарочно различна
const UB = 'c3c3c3c3-0000-0000-0000-000000000000'; // имот на B, за изолация

await db.exec(`
  -- U1 е публикуван (is_listed=true) с публично описание — за /stay теста.
  -- U2 ИМА slug, но не е публикуван — доказва, че is_listed гейтва, не
  -- само наличието на slug.
  insert into properties (id, owner_id, name, max_guests, channels, slug, is_listed, public_description) values
    ('${U1}', '${profA}', 'Студио 1', 2, '[{"type":"viber","value":"+359888000001"}]', 'studio-1', true, 'Уютно студио до плажа.'),
    ('${U2}', '${profA}', 'Апартамент 2', 4, '[]', 'apartment-2', false, null),
    ('${UB}', '${profB}', 'Имотът на Б', 3, '[]', null, false, null);

  insert into property_settings (property_id, ota_commission_pct, tourist_tax, cleaning_fee, deposit_pct, base_price) values
    ('${U1}', 15.0, 1.00, 20, 30, 70),
    ('${U2}', 20.0, 1.00, 20, 30, 0);

  -- Ценово правило за юли 2027 (part от бъдещия quote_stay тест) — покрива
  -- само част от заявения престой, за да докаже превключването към
  -- base_price за нощувките извън правилото.
  insert into pricing_rules (property_id, start_date, end_date, price_per_night, min_nights, created_at) values
    ('${U1}', '2027-07-01', '2027-07-05', 100, 2, '2026-01-01');

  -- created_at е фиксиран изрично навсякъде по-долу (2026-06-01) — не на
  -- default now(). Иначе тестът става недетерминиран: bookings_sold()
  -- групира по created_at, а "сега" се мести всеки ден и рано или късно
  -- ще влезе в месеца, който тестваме за bookings_sold по-долу.

  -- Гост 1: директна резервация, U1, без комисиона (3 нощувки х 100)
  insert into bookings (id, property_id, status, source, check_in, check_out, guest_name, total_price, commission, created_at) values
    ('b1000000-0000-0000-0000-000000000000','${U1}','confirmed','direct','2026-12-20','2026-12-23','Гост 1',300,0,'2026-06-01');
  -- Гост 2: през Booking, U1, с комисиона 36 (15% от 240; 2 нощувки х 120)
  insert into bookings (id, property_id, status, source, check_in, check_out, guest_name, total_price, commission, created_at) values
    ('b2000000-0000-0000-0000-000000000000','${U1}','confirmed','booking','2026-12-23','2026-12-25','Гост 2',240,36,'2026-06-01');
  -- Гост 3: ръчно въведена (телефон), U2, престой през Нова година (3 нощувки х 90)
  insert into bookings (id, property_id, status, source, check_in, check_out, guest_name, total_price, commission, created_at) values
    ('b3000000-0000-0000-0000-000000000000','${U2}','confirmed','manual','2026-12-30','2027-01-02','Гост 3',270,0,'2026-06-01');
  -- Запитване (pending) — не бива да се брои в приходите; друг период, без застъпване
  insert into bookings (id, property_id, status, source, check_in, check_out, guest_name, total_price, created_at) values
    ('b4000000-0000-0000-0000-000000000000','${U1}','pending','manual','2026-11-01','2026-11-03','Запитване',null,'2026-06-01');
  -- Отказана резервация — не бива да се брои, и не блокира датите
  insert into bookings (id, property_id, status, source, check_in, check_out, guest_name, total_price, created_at) values
    ('b5000000-0000-0000-0000-000000000000','${U2}','cancelled','direct','2026-12-10','2026-12-12','Анулирал',200,'2026-06-01');
  -- Отделна резервация само за проверка на tourist_tax в booking_balances
  insert into bookings (id, property_id, status, source, check_in, check_out, guest_name, total_price, tourist_tax, commission, created_at) values
    ('b6000000-0000-0000-0000-000000000000','${U1}','confirmed','direct','2026-11-10','2026-11-12','Гост с такса',150,4.00,0,'2026-06-01');

  insert into payments (booking_id, kind, amount, method) values
    ('b1000000-0000-0000-0000-000000000000','deposit', 90,'bank'),
    ('b3000000-0000-0000-0000-000000000000','deposit', 81,'card'),
    ('b3000000-0000-0000-0000-000000000000','balance',189,'cash');

  -- За bookings_sold(): резервации направени (created_at) през септември
  -- 2026, за престои чак през март 2027 — доказва, че функцията групира по
  -- ДАТА НА РЕЗЕРВАЦИЯТА, не по дата на нощувката (за разлика от
  -- earnings_by_month). Датите на престоя са далеч в бъдещето, за да не се
  -- застъпват с нищо съществуващо на U1.
  insert into bookings (id, property_id, status, source, check_in, check_out, guest_name, total_price, commission, created_at) values
    ('b7000000-0000-0000-0000-000000000000','${U1}','confirmed','booking','2027-03-01','2027-03-03','Продаден 1',200,20,'2026-09-15 10:00:00'),
    ('b8000000-0000-0000-0000-000000000000','${U1}','confirmed','direct','2027-03-05','2027-03-07','Продаден 2',150,0,'2026-09-20 10:00:00'),
    ('b9000000-0000-0000-0000-000000000000','${U1}','cancelled','direct','2027-03-01','2027-03-03','Отказан през септември',999,0,'2026-09-25 10:00:00'),
    ('ba000000-0000-0000-0000-000000000000','${U1}','confirmed','direct','2027-03-10','2027-03-12','Извън периода',500,0,'2026-10-01 10:00:00');

  -- Границата на Europe/Sofia поправката: 21:30 UTC на 30 септември е still
  -- 30-ти по UTC+2 (сесийната TZ по подразбиране в Postgres/pglite), НО вече
  -- е 00:30 на 1 октомври по българско време (UTC+3, лятно часово). Ако
  -- bookings_sold() използваше голата ::date (сесийна TZ), тази резервация
  -- щеше погрешно да падне в септември. С "at time zone 'Europe/Sofia'" пада
  -- коректно в октомври.
  insert into bookings (id, property_id, status, source, check_in, check_out, guest_name, total_price, commission, created_at) values
    ('bb000000-0000-0000-0000-000000000000','${U1}','confirmed','direct','2027-03-15','2027-03-17','Граница на часова зона',77,0,'2026-09-30 21:30:00+00');
`);

// ---------------------------------------------------------------- не чупим съществуващото
await expectError('bookings_no_overlap все още работи (защита от двойна резервация)',
  `insert into bookings (property_id, status, source, check_in, check_out, guest_name, total_price) values
   ('${U1}','confirmed','direct','2026-12-21','2026-12-24','Двоен',100)`, /bookings_no_overlap/);
await expectError('bookings_dates_valid все още работи',
  `insert into bookings (property_id, status, source, check_in, check_out, guest_name) values
   ('${U1}','confirmed','direct','2026-12-24','2026-12-24','Невалиден')`, /bookings_dates_valid/);

// ---------------------------------------------------------------- нови constraint-и
await expectError('channels трябва да е JSON масив',
  `insert into properties (owner_id, name, channels) values ('${profA}','x','{"viber":"1"}')`, /check constraint/);
await expectError('commission >= 0',
  `insert into bookings (property_id, status, source, check_in, check_out, guest_name, commission) values
   ('${U1}','confirmed','direct','2027-05-01','2027-05-02','x',-5)`, /check constraint/);
await expectError('ota_commission_pct в [0,50]',
  `insert into property_settings (property_id, ota_commission_pct) values ('${UB}', 60)`, /check constraint/);
await expectError('payments.amount > 0',
  `insert into payments (booking_id, kind, amount, method) values
   ('b1000000-0000-0000-0000-000000000000','deposit',0,'bank')`, /check constraint/);
await expectError('payments.kind е ограничено до deposit/balance/refund',
  `insert into payments (booking_id, kind, amount, method) values
   ('b1000000-0000-0000-0000-000000000000','tip',10,'cash')`, /check constraint/);

// ---------------------------------------------------------------- property_settings RLS
let r = await as('authenticated', A, `select count(*)::int n from property_settings`);
ok('собственик A вижда настройките на своите 2 имота', r[0].n === 2, `видя ${r[0].n}`);
r = await as('authenticated', B, `select count(*)::int n from property_settings where property_id = '${U1}'`);
ok('собственик B НЕ вижда настройките на имот на A', r[0].n === 0);
await asErr('собственик B не може да пише настройки за имот на A', 'authenticated', B,
  `insert into property_settings (property_id, ota_commission_pct) values ('${U1}', 25)`,
  /row-level security/);
r = await as('anon', null, `select count(*)::int n from property_settings`);
ok('анонимен не вижда никакви настройки', r[0].n === 0);

// ---------------------------------------------------------------- payments RLS
await asErr('собственик B не може да добави плащане към резервация на A', 'authenticated', B,
  `insert into payments (booking_id, kind, amount, method) values
   ('b2000000-0000-0000-0000-000000000000','deposit',50,'bank')`,
  /row-level security/);
r = await as('authenticated', B, `select count(*)::int n from payments`);
ok('собственик B не вижда плащания на A', r[0].n === 0);
r = await as('authenticated', A, `select count(*)::int n from payments`);
ok('собственик A вижда своите 3 плащания', r[0].n === 3, `видя ${r[0].n}`);

// ---------------------------------------------------------------- booking_balances
r = await as('authenticated', A,
  `select guest_name, due, paid, outstanding from booking_balances
   where guest_name in ('Гост 1','Гост 2','Гост 3','Гост с такса') order by guest_name`);
const byName = Object.fromEntries(r.map((x) => [x.guest_name, x]));
ok('Гост 1: директно платено капаро, остатък 210',
  same(byName['Гост 1'], { due: 300, paid: 90, outstanding: 210 }), show(byName['Гост 1'], ['due','paid','outstanding']));
ok('Гост 2: платформа с комисиона 36, нищо платено, остатък 204',
  same(byName['Гост 2'], { due: 204, paid: 0, outstanding: 204 }), show(byName['Гост 2'], ['due','paid','outstanding']));
ok('Гост 3: напълно платен (капаро + остатък), 0 дължимо',
  same(byName['Гост 3'], { due: 270, paid: 270, outstanding: 0 }), show(byName['Гост 3'], ['due','paid','outstanding']));
ok('Гост с такса: due включва tourist_tax (150+4), нищо платено',
  same(byName['Гост с такса'], { due: 154, paid: 0, outstanding: 154 }), show(byName['Гост с такса'], ['due','paid','outstanding']));
await asErr('анонимен не чете booking_balances', 'anon', null, `select * from booking_balances`, /permission denied/);
r = await as('authenticated', B, `select count(*)::int n from booking_balances`);
ok('собственик B не вижда остатъците на A', r[0].n === 0);

// ---------------------------------------------------------------- money_entries (008)
await asErr('анонимен не може да пише в money_entries', 'anon', null,
  `insert into money_entries (profile_id, kind, category, amount, entry_date) values
   ('${profA}','expense','Друго',10,'2026-12-01')`, /row-level security/);
await asErr('собственик не може да добави запис за чужд profile_id', 'authenticated', A,
  `insert into money_entries (profile_id, kind, category, amount, entry_date) values
   ('${profB}','expense','Друго',10,'2026-12-01')`, /row-level security/);
await expectError('невалидна категория за kind=income се отхвърля (CHECK — "Ток" е само за expense)',
  `insert into money_entries (profile_id, kind, category, amount, entry_date) values
   ('${profA}','income','Ток',10,'2026-12-01')`, /violates check constraint/);
await asErr('собственик не може да закачи запис към чужд имот', 'authenticated', A,
  `insert into money_entries (profile_id, property_id, kind, category, amount, entry_date) values
   ('${profA}','${UB}','expense','Друго',10,'2026-12-01')`, /row-level security/);

// Фиксура за примера на потребителя: декември нетно 684 + приход 50 − разходи 120 = печалба 614.
// Приходът е закачен за U1 (доп. услуга); разходът е ОБЩ (property_id null, реклама за всички имоти).
await as('authenticated', A, `insert into money_entries (id, profile_id, property_id, kind, category, amount, entry_date) values
  ('d1000000-0000-0000-0000-000000000000','${profA}','${U1}','income','Допълнителна услуга',50,'2026-12-15')`);
await as('authenticated', A, `insert into money_entries (id, profile_id, property_id, kind, category, amount, entry_date) values
  ('d2000000-0000-0000-0000-000000000000','${profA}',null,'expense','Реклама',120,'2026-12-20')`);

r = await as('authenticated', B, `select count(*)::int n from money_entries`);
ok('собственик B не вижда записите на A', r[0].n === 0);

await as('authenticated', A, `insert into money_entries (id, profile_id, kind, category, amount, entry_date) values
  ('d3000000-0000-0000-0000-000000000000','${profA}','expense','Друго',5,'2026-12-01')`);
await as('authenticated', A, `update money_entries set amount = 7 where id = 'd3000000-0000-0000-0000-000000000000'`);
r = await as('authenticated', A, `select amount from money_entries where id = 'd3000000-0000-0000-0000-000000000000'`);
ok('собственик A може да редактира свой запис', num(r[0].amount) === 7);
await as('authenticated', A, `delete from money_entries where id = 'd3000000-0000-0000-0000-000000000000'`);
r = await as('authenticated', A, `select count(*)::int n from money_entries where id = 'd3000000-0000-0000-0000-000000000000'`);
ok('собственик A може да изтрие свой запис', r[0].n === 0);

// ---------------------------------------------------------------- earnings_by_month
await asErr('анонимен не може да вика earnings_by_month', 'anon', null,
  `select * from earnings_by_month('2026-12-01','2027-01-31')`, /permission denied/);

r = await as('authenticated', A, `select * from earnings_by_month('2026-12-01','2027-01-31')`);
const dec = r.find((x) => monthKey(x.month) === '2026-12');
const jan = r.find((x) => monthKey(x.month) === '2027-01');
ok('декември: нощувки, заетост, приход, комисиона, нето',
  same(dec, { available_nights: 62, nights_sold: 7, occupancy_pct: 11.3, revenue: 720, commission: 36, net: 684 }),
  show(dec, ['available_nights','nights_sold','occupancy_pct','revenue','commission','net']));
ok('декември: ADR, RevPAR, директно vs платформа',
  same(dec, { adr: 102.86, revpar: 11.61, direct_revenue: 480, ota_revenue: 240, direct_share_pct: 66.7 }),
  show(dec, ['adr','revpar','direct_revenue','ota_revenue','direct_share_pct']));
ok('декември: спестена комисиона смята СЪС СОБСТВЕНАТА ставка на всеки имот (U1=15%, U2=20%) → 45+36=81',
  num(dec.commission_saved) === 81, `commission_saved=${dec.commission_saved}`);
ok('януари: престоят през Нова година се разделя по нощувка (U2, 20% ставка)',
  same(jan, { nights_sold: 1, revenue: 90, adr: 90, revpar: 1.45, direct_share_pct: 100, commission_saved: 18 }),
  show(jan, ['nights_sold','revenue','revpar','commission_saved']));
ok('декември: доп. приход/разходи/печалба (684 нето + 50 приход − 120 разход = 614)',
  same(dec, { other_income: 50, expenses: 120, profit: 614 }),
  show(dec, ['other_income','expenses','profit']));
ok('януари: без доп. движения — печалба = нето', num(jan.other_income) === 0 && num(jan.expenses) === 0);

r = await as('authenticated', B, `select * from earnings_by_month('2026-12-01','2027-01-31')`);
const decB = r.find((x) => monthKey(x.month) === '2026-12');
ok('собственик B вижда само своите (нулеви) числа за същия период — без параметър, само RLS',
  num(decB.revenue) === 0 && num(decB.available_nights) === 31,
  show(decB, ['available_nights','nights_sold','revenue']));

// ---------------------------------------------------------------- earnings_by_property
r = await as('authenticated', A, `select * from earnings_by_property('2026-12-01','2026-12-31')`);
const p1 = r.find((x) => x.property_id === U1);
const p2 = r.find((x) => x.property_id === U2);
ok('по имот: Студио 1 (U1)',
  same(p1, { nights_sold: 5, occupancy_pct: 16.1, revenue: 540, net: 504, adr: 108, direct_share_pct: 55.6 }),
  show(p1, ['nights_sold','occupancy_pct','revenue','net','adr','direct_share_pct']));
ok('по имот: Апартамент 2 (U2) — само декемврийските 2 нощувки от прехода',
  same(p2, { nights_sold: 2, revenue: 180, adr: 90, direct_share_pct: 100 }),
  show(p2, ['nights_sold','revenue','adr','direct_share_pct']));
ok('по имот: Студио 1 (U1) — 50 доп. приход закачен за този имот → печалба 504+50=554',
  same(p1, { other_income: 50, expenses: 0, profit: 554 }), show(p1, ['other_income','expenses','profit']));
ok('по имот: Апартамент 2 (U2) — без доп. движения, печалба = нето (180)',
  same(p2, { other_income: 0, expenses: 0, profit: 180 }), show(p2, ['other_income','expenses','profit']));
const general = r.find((x) => x.property_name === 'Общи разходи');
ok('"Общи разходи" ред се появява заради ОБЩИЯ разход (без приход, 120 разход → печалба -120), не се лепи към нито един имот',
  !!general && general.property_id === null && same(general, { other_income: 0, expenses: 120, profit: -120 }),
  general ? show(general, ['property_id','other_income','expenses','profit']) : 'липсва редът');
await asErr('анонимен не може да вика earnings_by_property', 'anon', null,
  `select * from earnings_by_property('2026-12-01','2026-12-31')`, /permission denied/);

// ---------------------------------------------------------------- bookings_sold (005)
// Продадени през септември 2026, за престои чак през март 2027 — доказва
// групиране по created_at, не по check_in/check_out.
r = await as('authenticated', A, `select * from bookings_sold('2026-09-01','2026-09-30')`);
ok('bookings_sold: брои по ДАТА НА РЕЗЕРВАЦИЯТА, не по нощувка — 2 продадени, 350 приход, 20 комисиона, 330 нето',
  same(r[0], { bookings_count: 2, revenue: 350, commission: 20, net: 330 }),
  show(r[0], ['bookings_count', 'revenue', 'commission', 'net']));
ok('bookings_sold: границата (21:30 UTC/30 септ.) НЕ изтича в септемврийската сметка',
  num(r[0].revenue) === 350, `revenue=${r[0].revenue} (трябваше да остане 350, не 427)`);
r = await as('authenticated', A, `select * from bookings_sold('2026-10-01','2026-10-31')`);
ok('bookings_sold: октомври вече включва и граничната резервация по българско време — 2 продадени, 577 приход',
  same(r[0], { bookings_count: 2, revenue: 577, commission: 0, net: 577 }),
  show(r[0], ['bookings_count', 'revenue', 'commission', 'net']));
r = await as('authenticated', B, `select * from bookings_sold('2026-09-01','2026-09-30')`);
ok('собственик B вижда 0 за чужди продажби — без параметър, само RLS',
  same(r[0], { bookings_count: 0, revenue: 0, commission: 0, net: 0 }));
await asErr('анонимен не може да вика bookings_sold', 'anon', null,
  `select * from bookings_sold('2026-09-01','2026-09-30')`, /permission denied/);

// ---------------------------------------------------------------- public_property (006)
r = await as('anon', null, `select * from public_property('studio-1')`);
ok('public_property: публикуван имот се вижда анонимно с правилните маркетингови полета',
  r.length === 1 &&
  same(r[0], { name: 'Студио 1', city: '', public_description: 'Уютно студио до плажа.', max_guests: 2 }),
  show(r[0] ?? {}, ['name', 'city', 'public_description', 'max_guests']));
ok('public_property: НЕ връща id/wifi/access_code/owner — само разрешените полета',
  r.length === 1 && same(
    { hasForbidden: Object.keys(r[0]).some((k) => /id|wifi|access_code|owner/i.test(k)) },
    { hasForbidden: false }
  ), `полета: ${Object.keys(r[0] ?? {}).join(',')}`);
r = await as('anon', null, `select * from public_property('apartment-2')`);
ok('public_property: is_listed=false връща 0 реда, ДОРИ slug-ът да съществува', r.length === 0);
r = await as('anon', null, `select * from public_property('няма-такъв')`);
ok('public_property: непознат slug връща 0 реда', r.length === 0);
r = await as('authenticated', A, `select * from public_property('studio-1')`);
ok('public_property: достъпна и за логнат собственик (без да връща повече данни)', r.length === 1);

// ---------------------------------------------------------------- quote_stay (006)
r = await as('anon', null, `select * from quote_stay('studio-1','2027-07-03','2027-07-07',2)`);
ok('quote_stay: смесва ценово правило (3 нощувки × 100) с base_price (1 нощувка × 70), + почистване 20',
  same(r[0], {
    nights: 4, accommodation_total: 370, cleaning_fee: 20, tourist_tax: 8,
    total: 390, deposit: 117, min_nights: 2, fits_guests: true, is_available: true,
  }),
  show(r[0], ['nights', 'accommodation_total', 'cleaning_fee', 'tourist_tax', 'total', 'deposit', 'min_nights', 'fits_guests', 'is_available']));
r = await as('anon', null, `select fits_guests from quote_stay('studio-1','2027-07-03','2027-07-05',5)`);
ok('quote_stay: 5 гости > max_guests(2) → fits_guests=false (все пак връща цена)', r[0].fits_guests === false);
r = await as('anon', null, `select is_available from quote_stay('studio-1','2026-12-21','2026-12-22',1)`);
ok('quote_stay: застъпване със съществуваща резервация (Гост 1) → is_available=false', r[0].is_available === false);
r = await as('anon', null, `select * from quote_stay('studio-1','2020-01-01','2020-01-03',1)`);
ok('quote_stay: check_in в миналото (спрямо България) → 0 реда', r.length === 0);
r = await as('anon', null, `select * from quote_stay('studio-1','2027-07-05','2027-07-03',1)`);
ok('quote_stay: check_out <= check_in → 0 реда', r.length === 0);
r = await as('anon', null, `select * from quote_stay('studio-1','2027-07-03','2027-07-05',0)`);
ok('quote_stay: 0 гости → 0 реда', r.length === 0);
r = await as('anon', null, `select * from quote_stay('apartment-2','2027-07-03','2027-07-05',1)`);
ok('quote_stay: is_listed=false → 0 реда', r.length === 0);
r = await as('anon', null, `select * from quote_stay('няма-такъв','2027-07-03','2027-07-05',1)`);
ok('quote_stay: непознат slug → 0 реда', r.length === 0);

// ---------------------------------------------------------------- booking_requests RLS (006)
await asErr('анонимен не може да пише в booking_requests директно', 'anon', null,
  `insert into booking_requests (property_id, check_in, check_out, guest_name) values
   ('${U1}','2027-08-01','2027-08-03','Спам')`, /row-level security/);
await asErr('дори логнат собственик не може да пише в booking_requests директно (само service role)', 'authenticated', A,
  `insert into booking_requests (property_id, check_in, check_out, guest_name) values
   ('${U1}','2027-08-01','2027-08-03','Гост')`, /row-level security/);

// Симулира insert-а, който в продукция прави Netlify функцията със service
// role (тук: директно през тестовата връзка, без anon/authenticated роля).
await db.exec(`
  insert into booking_requests (id, property_id, check_in, check_out, num_guests, guest_name, guest_email, quoted_total, quoted_deposit, created_at) values
    ('c1000000-0000-0000-0000-000000000000','${U1}','2027-08-01','2027-08-03',2,'Заявител','z@primer.bg',200,60,'2026-01-01'),
    ('c2000000-0000-0000-0000-000000000000','${U1}','2020-01-01','2020-01-03',1,'Стара чакаща заявка','x@primer.bg',100,30,'2020-01-01');
`);

r = await as('authenticated', A, `select guest_name, status from booking_requests where property_id = '${U1}' order by created_at`);
ok('собственик A вижда своите 2 заявки', r.length === 2, `видя ${r.length}`);
r = await as('authenticated', B, `select count(*)::int n from booking_requests where property_id = '${U1}'`);
ok('собственик B не вижда заявките на A', r[0].n === 0);
r = await as('anon', null, `select count(*)::int n from booking_requests`);
ok('анонимен не вижда никакви заявки', r[0].n === 0);

await as('authenticated', A, `update booking_requests set status = 'declined', decided_at = now()
  where id = 'c1000000-0000-0000-0000-000000000000'`);
r = await as('authenticated', A, `select status from booking_requests where id = 'c1000000-0000-0000-0000-000000000000'`);
ok('собственик A може да откаже своя заявка', r[0].status === 'declined');

r = (await db.query(`select expire_old_booking_requests() n`)).rows;
ok('expire_old_booking_requests: затваря точно старата чакаща заявка (2020)', r[0].n === 1, `затвори ${r[0].n}`);
r = await as('authenticated', A, `select status from booking_requests where id = 'c2000000-0000-0000-0000-000000000000'`);
ok('старата заявка вече е expired', r[0].status === 'expired');
await asErr('анонимен не може да вика expire_old_booking_requests', 'anon', null,
  `select expire_old_booking_requests()`, /permission denied/);
await asErr('authenticated не може да вика expire_old_booking_requests (само service role)', 'authenticated', A,
  `select expire_old_booking_requests()`, /permission denied/);

// ---------------------------------------------------------------- известия: outbox (007)
r = await as('authenticated', A, `select count(*)::int n from outbox`);
ok('преди да има notification_targets, по-ранните заявки не са оставили outbox редове', r[0].n === 0);

await asErr('анонимен не може да добавя notification_targets', 'anon', null,
  `insert into notification_targets (profile_id, channel, address) values ('${profA}','telegram','111')`,
  /row-level security/);
await asErr('собственик не може да добави target за чужд profile_id', 'authenticated', A,
  `insert into notification_targets (profile_id, channel, address) values ('${profB}','telegram','111')`,
  /row-level security/);

r = await as('authenticated', A, `insert into notification_targets (profile_id, channel, address)
  values ('${profA}','telegram','555000111') returning id::text as id`);
const targetA = r[0].id;
ok('собственик A добавя Telegram адресат', !!targetA);

await db.exec(`
  insert into booking_requests (id, property_id, check_in, check_out, num_guests, guest_name, guest_email, quoted_total, quoted_deposit, created_at) values
    ('c3000000-0000-0000-0000-000000000000','${U1}','2027-09-01','2027-09-03',2,'Нов заявител','nov@primer.bg',300,90,'2027-01-01');
`);
r = await as('authenticated', A, `select channel, recipient, event, status, payload from outbox where target_id = '${targetA}'`);
ok('тригърът пълни outbox при нова заявка за имот на A',
  r.length === 1 && r[0].channel === 'telegram' && r[0].recipient === '555000111' && r[0].event === 'new_booking_request' && r[0].status === 'queued',
  show(r[0] ?? {}, ['channel', 'recipient', 'event', 'status']));
ok('payload носи данните за известието (гост, дати, сума, име на имота)',
  r[0]?.payload?.guest_name === 'Нов заявител' && Number(r[0]?.payload?.quoted_total) === 300 && r[0]?.payload?.property_name === 'Студио 1',
  JSON.stringify(r[0]?.payload));

r = await as('authenticated', B, `select count(*)::int n from outbox`);
ok('собственик B не вижда outbox на A', r[0].n === 0);
r = await as('authenticated', B, `select count(*)::int n from notification_targets`);
ok('собственик B не вижда notification_targets на A', r[0].n === 0);
r = await as('anon', null, `select * from outbox`);
ok('анонимен не вижда никакви outbox редове (RLS филтрира, без грешка)', r.length === 0);

await as('authenticated', A, `update notification_targets set is_enabled = false where id = '${targetA}'`);
await db.exec(`
  insert into booking_requests (id, property_id, check_in, check_out, num_guests, guest_name, created_at) values
    ('c4000000-0000-0000-0000-000000000000','${U1}','2027-09-05','2027-09-07',1,'Докато е изключен','2027-01-02');
`);
r = await as('authenticated', A, `select count(*)::int n from outbox where channel = 'telegram' and payload->>'guest_name' = 'Докато е изключен'`);
ok('изключен target не получава ново известие', r[0].n === 0);

await as('authenticated', A, `select send_test_notification('${targetA}')`);
r = await as('authenticated', A, `select count(*)::int n from outbox where target_id = '${targetA}' and event = 'test'`);
ok('собственик A праща тестово известие на свой target', r[0].n === 1);
await asErr('собственик B не може да прати тест на target-а на A', 'authenticated', B,
  `select send_test_notification('${targetA}')`, /Нямате достъп/);

await as('authenticated', A, `delete from notification_targets where id = '${targetA}'`);
r = await as('authenticated', A, `select count(*)::int n from notification_targets where id = '${targetA}'`);
ok('собственик A трие своя адресат', r[0].n === 0);

// ---------------------------------------------------------------- съществуващата изолация (002/003) не е пробита
r = await as('anon', null, `select * from guest_card('${U1}')`);
ok('guest_card() все още работи анонимно за валиден имот', r.length === 1 && r[0].name === 'Студио 1');
const u1Token = (await as('authenticated', A, `select ical_token::text as t from properties where id = '${U1}'`))[0].t;
r = await as('anon', null, `select count(*)::int n from bookings_for_ical('${u1Token}')`);
// U1 вече има 8 резервации със статус <> 'cancelled' (b1, b2, b4-pending, b6,
// b7, b8, ba, bb — четирите нови от bookings_sold теста по-горе, минус
// отказания b9). bookings_for_ical изключва само отказаните, не и pending.
ok('bookings_for_ical() все още работи (вижда всички некотказани резервации на U1)',
  r[0].n === 8, `видя ${r[0].n}`);

// ---------------------------------------------------------------- листинг страница (009)
await as('authenticated', A, `update properties set
  bedrooms = 2, beds = 3, bathrooms = 1.5, area_m2 = 45.5,
  amenities = '["wifi","parking","kitchen"]'::jsonb,
  checkin_time = '15:00', checkout_time = '10:00',
  smoking_allowed = false, parties_allowed = false, cancellation_policy = 'flexible',
  lat = 43.214100, lng = 27.914700,
  public_description_en = 'Cozy studio near the beach.'
  where id = '${U1}'`);

await asErr('анонимен не може да пише в property_photos', 'anon', null,
  `insert into property_photos (property_id, photo_url) values ('${U1}','https://x/a.jpg')`,
  /row-level security/);
await asErr('собственик B не може да добави снимка към имот на A', 'authenticated', B,
  `insert into property_photos (property_id, photo_url) values ('${U1}','https://x/a.jpg')`,
  /row-level security/);
// Вмъкнати в обратен ред — доказва, че photos в public_property() е подредена
// по position, не по реда на вмъкване.
await as('authenticated', A, `insert into property_photos (property_id, photo_url, position) values
  ('${U1}','https://x/photo-b.jpg', 1)`);
await as('authenticated', A, `insert into property_photos (property_id, photo_url, position) values
  ('${U1}','https://x/photo-a.jpg', 0)`);
r = await as('authenticated', B, `select count(*)::int n from property_photos`);
ok('собственик B не вижда снимките на A', r[0].n === 0);

await asErr('анонимен не може да пише в reviews', 'anon', null,
  `insert into reviews (property_id, guest_name, rating, comment) values
   ('${U1}','Спам',5,'...')`, /row-level security/);
await asErr('собственик B не може да добави отзив към имот на A', 'authenticated', B,
  `insert into reviews (property_id, guest_name, rating, comment) values
   ('${U1}','Х',5,'Х')`, /row-level security/);
await as('authenticated', A, `insert into reviews (property_id, guest_name, rating, comment, stayed_on, created_at) values
  ('${U1}','Мария К.',5,'Невероятен изглед към морето!','2026-07-01','2026-07-05 10:00:00')`);
await as('authenticated', A, `insert into reviews (property_id, guest_name, rating, comment, created_at) values
  ('${U1}','Георги П.',4,'Удобно и чисто.','2026-08-10 10:00:00')`);
// Реален отзив на НЕПУБЛИКУВАН имот (U2/apartment-2) — не бива да изтича.
await as('authenticated', A, `insert into reviews (property_id, guest_name, rating, comment) values
  ('${U2}','Таен гост',5,'Това не бива да се вижда публично.')`);

r = await as('anon', null, `select * from public_property('studio-1')`);
const listing = r[0];
ok('public_property: нови полета (спални/легла/бани/кв.м/удобства/часове/анулиране)',
  listing.bedrooms === 2 && listing.beds === 3 && Number(listing.bathrooms) === 1.5 &&
  Number(listing.area_m2) === 45.5 && listing.checkin_time === '15:00' && listing.checkout_time === '10:00' &&
  listing.cancellation_policy === 'flexible',
  show(listing, ['bedrooms','beds','bathrooms','area_m2','checkin_time','checkout_time','cancellation_policy']));
ok('public_property: base_price от property_settings (за "от X €/нощувка")', num(listing.base_price) === 70);
ok('public_property: amenities и английско описание минават',
  listing.amenities.includes('wifi') && listing.public_description_en.includes('Cozy'));
ok('public_property: снимките излизат подредени по position, не по ред на вмъкване',
  listing.photos[0] === 'https://x/photo-a.jpg' && listing.photos[1] === 'https://x/photo-b.jpg',
  listing.photos.join(','));
ok('public_property: НЕ връща wifi/access_code/id дори с новите полета',
  !('id' in listing) && !('wifi_name' in listing) && !('wifi_password' in listing) && !('access_code' in listing),
  Object.keys(listing).join(','));

const latOffset = Math.abs(Number(listing.public_lat) - 43.214100);
const lngOffset = Math.abs(Number(listing.public_lng) - 27.914700);
ok('public_property: публичната локация е РАЗМАЗАНА (различна от точната, но до ~300м)',
  latOffset > 0 && latOffset < 0.0035 && lngOffset > 0 && lngOffset < 0.0045,
  `lat_offset≈${Math.round(latOffset * 111320)}м lng_offset≈${Math.round(lngOffset * 111320)}м`);

const r2 = await as('anon', null, `select public_lat, public_lng from public_property('studio-1')`);
ok('public_property: размазаната локация е СТАБИЛНА между заявки (не се разбърква всеки път)',
  Number(r2[0].public_lat) === Number(listing.public_lat) && Number(r2[0].public_lng) === Number(listing.public_lng));

r = await as('anon', null, `select public_lat from public_property('apartment-2')`);
ok('public_property: непубликуван имот без lat → 0 реда (is_listed=false печели)', r.length === 0);

// ---------------------------------------------------------------- busy_nights (009)
r = await as('anon', null, `select * from busy_nights('studio-1','2026-12-18','2026-12-26')`);
const nightsISO = r.map((x) => (x.night instanceof Date ? x.night.toISOString().slice(0, 10) : String(x.night)));
ok('busy_nights: Гост1(20-23)+Гост2(23-25) = 5 непрекъснати заети нощувки, 25-ти (checkout) свободен',
  nightsISO.length === 5 && nightsISO.includes('2026-12-20') && nightsISO.includes('2026-12-24') && !nightsISO.includes('2026-12-25'),
  nightsISO.join(','));
ok('busy_nights: връща САМО колоната night, нищо друго (нито guest_name, нито booking id)',
  r.length > 0 && Object.keys(r[0]).length === 1 && 'night' in r[0], Object.keys(r[0]).join(','));
r = await as('anon', null, `select * from busy_nights('apartment-2','2026-01-01','2027-12-31')`);
ok('busy_nights: непубликуван имот → 0 реда', r.length === 0);
r = await as('anon', null, `select * from busy_nights('няма-такъв','2026-01-01','2027-12-31')`);
ok('busy_nights: непознат slug → 0 реда', r.length === 0);

// ---------------------------------------------------------------- public_reviews (009)
r = await as('anon', null, `select * from public_reviews('studio-1')`);
ok('public_reviews: вижда 2-та реални отзива на публикувания имот, най-нов първи',
  r.length === 2 && r[0].guest_name === 'Георги П.' && r[1].guest_name === 'Мария К.',
  r.map((x) => x.guest_name).join(','));
ok('public_reviews: връща само guest_name/rating/comment/stayed_on/created_at/id — без property_id',
  !('property_id' in r[0]), Object.keys(r[0]).join(','));
r = await as('anon', null, `select * from public_reviews('apartment-2')`);
ok('public_reviews: отзив на НЕпубликуван имот не изтича дори да съществува в таблицата', r.length === 0);

// ---------------------------------------------------------------- AI обработки (010)
await asErr('анонимен не може да стартира AI обработка', 'anon', null,
  `select start_ai_run('${U1}', 5)`, /permission denied/);
await asErr('собственик B не може да стартира обработка за имот на A', 'authenticated', B,
  `select start_ai_run('${U1}', 5)`, /Нямате достъп/);
await asErr('над 30 снимки се отхвърля', 'authenticated', A,
  `select start_ai_run('${U1}', 31)`, /между 1 и 30/);

// Обработка от вчера (по българско време) — не бива да се брои в днешния лимит.
await db.exec(`insert into ai_runs (property_id, profile_id, status, created_at)
  values ('${U1}', '${profA}', 'done', now() - interval '1 day 2 hours')`);

const runIds = [];
for (let i = 0; i < 3; i++) {
  r = await as('authenticated', A, `select start_ai_run('${U1}', 10) as id`);
  runIds.push(r[0].id);
}
ok('собственик A стартира 3 обработки днес (вчерашната не се брои)', runIds.every(Boolean) && new Set(runIds).size === 3);
await asErr('4-та обработка за същия имот днес → дневен лимит', 'authenticated', A,
  `select start_ai_run('${U1}', 10)`, /дневния лимит|дневният лимит/);
r = await as('authenticated', A, `select start_ai_run('${U2}', 10) as id`);
ok('лимитът е на имот — друг имот на A още може', !!r[0].id);

r = await as('authenticated', A, `select status, photo_count from ai_runs where id = '${runIds[0]}'`);
ok('новата обработка е queued с броя снимки', r[0].status === 'queued' && r[0].photo_count === 10);
r = await as('authenticated', B, `select count(*)::int n from ai_runs`);
ok('собственик B не вижда обработките на A', r[0].n === 0);
await asErr('собственик не може да пише директно в ai_runs (само start_ai_run)', 'authenticated', A,
  `insert into ai_runs (property_id, profile_id) values ('${U1}','${profA}')`, /row-level security/);
r = await as('authenticated', A, `update ai_runs set status = 'done', cost_usd = 0 where id = '${runIds[0]}' returning id`);
ok('собственик не може да промени резултата/цената на обработка', r.length === 0);

await expectError('accent_color приема само #rrggbb', `update properties set accent_color = 'red' where id = '${U1}'`, /check constraint/);
await as('authenticated', A, `update properties set accent_color = '#1b5e7a' where id = '${U1}'`);
r = await as('anon', null, `select accent_color from public_property('studio-1')`);
ok('public_property връща accent_color', r[0].accent_color === '#1b5e7a');

// ---------------------------------------------------------------- етикети на снимки (011)
const photoRows = await as('authenticated', A, `select id::text as id from property_photos where property_id = '${U1}' order by position`);
await as('authenticated', A, `update property_photos set room = 'kitchen' where id = '${photoRows[0].id}'`);
r = await as('authenticated', A, `select room from property_photos where id = '${photoRows[0].id}'`);
ok('собственик A маркира своя снимка с етикет „Кухня“', r[0].room === 'kitchen');
await expectError('етикет извън списъка се отхвърля (CHECK)', `update property_photos set room = 'garage' where id = '${photoRows[0].id}'`, /check constraint/);
r = await as('authenticated', B, `update property_photos set room = 'living' where id = '${photoRows[0].id}' returning id`);
ok('собственик B не може да смени етикета на снимка на A', r.length === 0);
r = await as('authenticated', A, `select ai_assistant from properties where id = '${U1}'`);
ok('AI асистентът е изключен по подразбиране', r[0].ai_assistant === false);
r = await as('anon', null, `select * from public_property('studio-1')`);
ok('public_property не разкрива ai_assistant нито етикетите', !('ai_assistant' in r[0]) && !('room' in r[0]));

// ---------------------------------------------------------------- автоматични разходи/приходи (012)
// Всички дати са явни (днес = 2028-04-15) — без скрита зависимост от now().
const UX = 'c4c4c4c4-0000-0000-0000-000000000000'; // чист имот на A само за този тест
const TODAY = '2028-04-15';
const gen = async (profile = profA, today = TODAY) => (await db.query(`select generate_auto_entries('${profile}', '${today}') as n`)).rows[0].n;
const autoCount = async (where = '') => (await db.query(`select count(*)::int n from money_entries where rule_id is not null ${where}`)).rows[0].n;

await db.exec(`
  insert into properties (id, owner_id, name, max_guests, channels) values ('${UX}', '${profA}', 'Чист имот', 2, '[]');
  insert into bookings (id, property_id, status, source, check_in, check_out, guest_name, total_price, commission, created_at) values
    ('e1000000-0000-0000-0000-000000000000','${UX}','confirmed','direct','2028-03-02','2028-03-05','Р1',300,0,'2028-01-01'),
    ('e2000000-0000-0000-0000-000000000000','${UX}','confirmed','direct','2028-03-10','2028-03-12','Р2',200,0,'2028-01-01'),
    ('e3000000-0000-0000-0000-000000000000','${UX}','cancelled','direct','2028-03-20','2028-03-22','Р3 отказана',999,0,'2028-01-01'),
    ('e4000000-0000-0000-0000-000000000000','${UX}','confirmed','direct','2028-04-28','2028-05-01','Р4 бъдеща',150,0,'2028-01-01');
`);

// ---- права и валидации
await asErr('анонимен не може да създава правила', 'anon', null,
  `insert into recurring_rules (profile_id, kind, category, label, amount, frequency, starts_on) values ('${profA}','expense','Друго','x',5,'per_stay','2028-03-01')`, /permission denied|row-level security/);
await asErr('собственик B не може да създаде правило за профила на A', 'authenticated', B,
  `insert into recurring_rules (profile_id, kind, category, label, amount, frequency, starts_on) values ('${profA}','expense','Друго','x',5,'per_stay','2028-03-01')`, /row-level security/);
await asErr('собственик B не може да закачи правило към имот на A', 'authenticated', B,
  `insert into recurring_rules (profile_id, property_id, kind, category, label, amount, frequency, starts_on) values ('${profB}','${UX}','expense','Друго','x',5,'per_stay','2028-03-01')`, /row-level security/);
await expectError('сума ≤ 0 се отхвърля', `insert into recurring_rules (profile_id, kind, category, label, amount, frequency, starts_on) values ('${profA}','expense','Друго','x',0,'per_stay','2028-03-01')`, /check constraint/);
await expectError('monthly изисква ден от месеца', `insert into recurring_rules (profile_id, kind, category, label, amount, frequency, starts_on) values ('${profA}','expense','Ток','x',5,'monthly','2028-03-01')`, /check constraint/);
await expectError('per_stay не приема ден от месеца', `insert into recurring_rules (profile_id, kind, category, label, amount, frequency, day_of_month, starts_on) values ('${profA}','expense','Ток','x',5,'per_stay',5,'2028-03-01')`, /check constraint/);
await expectError('категория, непозната за вида (income + Ток)', `insert into recurring_rules (profile_id, kind, category, label, amount, frequency, starts_on) values ('${profA}','income','Ток','x',5,'per_stay','2028-03-01')`, /check constraint/);
await asErr('автоматичният генератор НЕ е достъпен за authenticated', 'authenticated', A,
  `select generate_auto_entries('${profA}', '${TODAY}')`, /permission denied/);
await asErr('нито за anon', 'anon', null, `select generate_auto_entries('${profA}', '${TODAY}')`, /permission denied/);
await asErr('anon не може да вика generate_my_auto_entries', 'anon', null, `select generate_my_auto_entries()`, /permission denied/);

// ---- правилата от примера: Почистване 25€/резервация, Интернет 20€/месец (ден 5), Закуска 8€/резервация (приход), +2€/нощувка консумативи
const mkRule = (fields) => as('authenticated', A, `insert into recurring_rules (profile_id, property_id, kind, category, label, amount, frequency, day_of_month, starts_on) values
  ('${profA}','${UX}',${fields}) returning id::text as id`);
const R1 = (await mkRule(`'expense','Почистване','Почистване',25,'per_stay',null,'2028-03-01'`))[0].id;
const R2 = (await mkRule(`'expense','Интернет/ТВ','Интернет/ТВ',20,'monthly',5,'2028-03-01'`))[0].id;
const R3 = (await mkRule(`'income','Допълнителна услуга','Закуска',8,'per_stay',null,'2028-03-01'`))[0].id;
const R4 = (await mkRule(`'expense','Консумативи','Консумативи',2,'per_night',null,'2028-03-01'`))[0].id;
ok('собственик A създава 4 правила', [R1, R2, R3, R4].every(Boolean));

const created1 = await gen();
ok('първо пускане: 8 записа (интернет март+април, 3×по 2 за двете потвърдени минали резервации; отказаната и бъдещата — не)', created1 === 8, `създадени ${created1}`);

const sumFor = async (from, to) => {
  const rows = await as('authenticated', A, `select * from earnings_by_property('${from}','${to}')`);
  return rows.find((x) => x.property_id === UX);
};
let march = await sumFor('2028-03-01', '2028-03-31');
ok('март: приход 500, доп. приход 16 (2×8), разходи 80 (20+2×25+6+4), печалба 436',
  same(march, { revenue: 500, other_income: 16, expenses: 80, profit: 436 }), show(march, ['revenue','other_income','expenses','profit']));
let months = await as('authenticated', A, `select * from earnings_by_month('2028-03-01','2028-04-30')`);
const mMar = months.find((x) => monthKey(x.month) === '2028-03'), mApr = months.find((x) => monthKey(x.month) === '2028-04');
// Април: интернет −20 (разход); бъдещата Р4 дава 150 приход по нощувки (28–30 април), но още няма авто записи (check_out е 1 май > днес).
ok('по месеци: март печалба 436; април: разходи 20 (само интернет), печалба 150−20 = 130',
  num(mMar.profit) === 436 && num(mApr.expenses) === 20 && num(mApr.profit) === 130,
  `март=${mMar.profit} април=${mApr.profit}`);
ok('записите са означени като автоматични и закачени към резервацията',
  (await autoCount('and is_auto')) === 8 && (await autoCount('and booking_id is not null')) === 6);

// ---- идемпотентност
const created2 = await gen();
ok('второ пускане със същата дата: 0 нови, същите числа', created2 === 0 && (await autoCount()) === 8 && num((await sumFor('2028-03-01', '2028-03-31')).profit) === 436);
ok('нощувките се умножават: консумативи 3 нощувки×2=6 и 2×2=4', (await db.query(`select string_agg(amount::text, ',' order by amount) a from money_entries where rule_id = '${R4}'`)).rows[0].a === '4.00,6.00');
ok('по-късна дата не създава стари записи наново (днес 2028-04-20)', (await gen(profA, '2028-04-20')) === 0);

// ---- ръчна редакция: губи „авто“, не се дублира
const e1r1 = (await db.query(`select id::text id from money_entries where rule_id = '${R1}' and booking_id = 'e1000000-0000-0000-0000-000000000000'`)).rows[0].id;
await as('authenticated', A, `update money_entries set amount = 30 where id = '${e1r1}'`);
r = await as('authenticated', A, `select is_auto, amount from money_entries where id = '${e1r1}'`);
ok('редактиран автоматичен запис губи „авто“', r[0].is_auto === false && num(r[0].amount) === 30);
// ---- ръчно изтриване: не се връща
const e2r3 = (await db.query(`select id::text id from money_entries where rule_id = '${R3}' and booking_id = 'e2000000-0000-0000-0000-000000000000'`)).rows[0].id;
await as('authenticated', A, `delete from money_entries where id = '${e2r3}'`);
ok('след редакция и изтриване нищо не се създава наново', (await gen()) === 0 && (await autoCount()) === 7);
march = await sumFor('2028-03-01', '2028-03-31');
ok('март след редакцията (30) и изтриването (−8): доп. приход 8, разходи 85, печалба 423',
  same(march, { other_income: 8, expenses: 85, profit: 423 }), show(march, ['other_income','expenses','profit']));

// ---- отказана резервация → автоматичните ѝ записи се махат, редактираният остава
await db.exec(`update bookings set status = 'cancelled' where id = 'e2000000-0000-0000-0000-000000000000'`);
await gen();
march = await sumFor('2028-03-01', '2028-03-31');
ok('отказ на Р2: махат се нейните авто записи (25 и 4); редактираният (30) за Р1 остава → приход 300, доп. приход 8, разходи 56, печалба 252',
  same(march, { revenue: 300, other_income: 8, expenses: 56, profit: 252 }) && (await autoCount()) === 5, show(march, ['revenue','other_income','expenses','profit']));
// ---- връщане на резервацията: пресъздава се, но изтритата закуска остава изтрита
await db.exec(`update bookings set status = 'confirmed' where id = 'e2000000-0000-0000-0000-000000000000'`);
ok('връщане в „потвърдена“: 2 нови записа (почистване+консумативи), закуската за Р2 НЕ се връща', (await gen()) === 2 && (await autoCount()) === 7);
// ---- изтрита резервация → авто записите ѝ се махат, редактираният остава
await db.exec(`delete from bookings where id = 'e1000000-0000-0000-0000-000000000000'`);
r = await db.query(`select count(*)::int n from money_entries where booking_id is null and rule_id = '${R1}' and amount = 30`);
ok('изтрита резервация Р1: нейният авто запис за консумативи/закуска се маха, ръчно редактираният (30) остава (booking_id → null)',
  (await autoCount(`and rule_id in ('${R3}','${R4}') and amount <> 8 and booking_id is null`)) === 0 && r.rows[0].n === 1);

// ---- пауза: не създава нови
await as('authenticated', A, `update recurring_rules set active = false where id = '${R2}'`);
// На 2028-05-20 бъдещата Р4 (check_out 1 май) вече е минала → 3 записа (почистване, закуска, консумативи 3×2);
// интернет за май НЕ се създава, защото правилото е на пауза.
const pausedRun = await gen(profA, '2028-05-20');
ok('правило на пауза не генерира нови месеци (май): само 3-те записа на вече минала Р4',
  pausedRun === 3 && (await autoCount(`and rule_id = '${R2}' and auto_period = '2028-05-01'`)) === 0, `създадени ${pausedRun}`);
await as('authenticated', A, `update recurring_rules set active = true where id = '${R2}'`);
ok('след включване — догонва май (1 запис)', (await gen(profA, '2028-05-20')) === 1);

// ---- изтриване на правило: запази / махни записите
const R5 = (await mkRule(`'expense','Реклама','Реклама',9,'monthly',1,'2028-03-01'`))[0].id;
await gen(profA, '2028-05-20');
ok('ново правило „Реклама“ създава 3 записа (март, април, май)…', (await autoCount(`and rule_id = '${R5}'`)) === 3);
r = await as('authenticated', A, `select delete_recurring_rule('${R5}', false) as removed`);
ok('…изтриване със запазване: 0 махнати; записите остават като обикновени (без „авто“, без правило)',
  r[0].removed === 0 && (await db.query(`select count(*)::int n from money_entries where note = 'Реклама' and is_auto = false and rule_id is null and entry_date >= '2028-03-01'`)).rows[0].n === 3);
const R6 = (await mkRule(`'expense','Вода','Вода',7,'monthly',2,'2028-03-01'`))[0].id;
await gen(profA, '2028-05-20');
r = await as('authenticated', A, `select delete_recurring_rule('${R6}', true) as removed`);
ok('изтриване с „махни и създадените“: махнати 3, няма следа',
  r[0].removed === 3 && (await db.query(`select count(*)::int n from money_entries where note = 'Вода'`)).rows[0].n === 0);
await asErr('собственик B не може да изтрие правило на A', 'authenticated', B, `select delete_recurring_rule('${R1}', true)`, /не е намерено/);

// ---- изолация между собственици
r = await as('authenticated', B, `select count(*)::int n from recurring_rules`);
ok('собственик B не вижда правилата на A', r[0].n === 0);
r = await as('authenticated', B, `select count(*)::int n from money_entries where rule_id is not null`);
ok('нито автоматичните записи на A', r[0].n === 0);
r = await as('authenticated', B, `select generate_my_auto_entries() as n`);
ok('generate_my_auto_entries() на B не създава нищо (няма свои правила) и не пипа чужди', r[0].n === 0);
await as('authenticated', B, `insert into recurring_rules (profile_id, property_id, kind, category, label, amount, frequency, day_of_month, starts_on)
  values ('${profB}','${UB}','expense','Ток','Ток',40,'monthly',1,'2028-03-01')`);
ok('генераторът за B създава само негови записи (март, април): 2', (await gen(profB)) === 2);
r = await as('authenticated', A, `select count(*)::int n from money_entries where note = 'Ток'`);
ok('…които A не вижда', r[0].n === 0);
r = await as('authenticated', B, `select count(*)::int n from money_entries where note = 'Ток'`);
ok('B вижда своите 2', r[0].n === 2);

// ---- обвивката за собственик (без параметри, реално „днес“): правило от 2020 → детерминирано 2 записа
await as('authenticated', A, `insert into recurring_rules (profile_id, property_id, kind, category, label, amount, frequency, day_of_month, starts_on, ends_on)
  values ('${profA}','${UX}','expense','Друго','Тест 2020',1,'monthly',1,'2020-01-01','2020-02-28')`);
r = await as('authenticated', A, `select generate_my_auto_entries() as n`);
ok('generate_my_auto_entries() на A работи без параметри: 2 записа за 2020 (не зависи от днешна дата)', r[0].n === 2);
r = await as('authenticated', A, `select generate_my_auto_entries() as n`);
ok('…и е идемпотентна', r[0].n === 0);

// ---------------------------------------------------------------- миниатюри на публичната страница (013)
// photo-a (позиция 0) получава миниатюра; photo-b (позиция 1) — не (стара снимка).
await as('authenticated', A, `update property_photos set thumb_url = 'https://x/photo-a.thumb.jpg' where property_id = '${U1}' and photo_url = 'https://x/photo-a.jpg'`);
// Две снимки с ЕДНАКВА позиция — доказва, че двата масива остават в един и същ ред.
await as('authenticated', A, `insert into property_photos (property_id, photo_url, thumb_url, position) values
  ('${U1}','https://x/photo-d.jpg','https://x/photo-d.thumb.jpg', 7),
  ('${U1}','https://x/photo-c.jpg','https://x/photo-c.thumb.jpg', 7)`);

r = await as('anon', null, `select photos, photo_thumbs from public_property('studio-1')`);
const th = r[0];
ok('013: photo_thumbs е със същата дължина като photos', th.photos.length === th.photo_thumbs.length && th.photos.length >= 4,
  `${th.photos.length} / ${th.photo_thumbs.length}`);
ok('013: снимка с миниатюра → излиза миниатюрата, на същата позиция',
  th.photos[0] === 'https://x/photo-a.jpg' && th.photo_thumbs[0] === 'https://x/photo-a.thumb.jpg');
ok('013: снимка БЕЗ миниатюра → излиза основната (резервен вариант)',
  th.photos[1] === 'https://x/photo-b.jpg' && th.photo_thumbs[1] === 'https://x/photo-b.jpg');
ok('013: при равни позиции photo_thumbs[i] отговаря точно на photos[i]',
  th.photos.every((p, i) => p === th.photo_thumbs[i] || p.replace('.jpg', '.thumb.jpg') === th.photo_thumbs[i]),
  th.photos.map((p, i) => `${p.split('/').pop()}→${th.photo_thumbs[i].split('/').pop()}`).join(' '));
ok('013: редът по position си остава (photo-a, photo-b преди равните позиции)',
  th.photos.slice(0, 2).join(',') === 'https://x/photo-a.jpg,https://x/photo-b.jpg');
r = await as('anon', null, `select * from public_property('studio-1')`);
ok('013: полетата са същите + само photo_thumbs; нищо чувствително не изтича',
  'photo_thumbs' in r[0] && !('id' in r[0]) && !('wifi_name' in r[0]) && !('wifi_password' in r[0]) &&
  !('access_code' in r[0]) && !('ai_assistant' in r[0]) && !('room' in r[0]) && !('owner_id' in r[0]),
  Object.keys(r[0]).join(','));
ok('013: адресите на снимките не съдържат id на имота',
  !JSON.stringify([r[0].photos, r[0].photo_thumbs]).includes(U1));
r = await as('anon', null, `select * from public_property('apartment-2')`);
ok('013: непубликуван имот → пак 0 реда', r.length === 0);
r = await as('authenticated', A, `select photo_thumbs from public_property('studio-1')`);
ok('013: достъпна и за логнат собственик', r.length === 1 && r[0].photo_thumbs.length >= 4);
r = await as('authenticated', B, `update property_photos set thumb_url = 'https://evil/x.jpg' where property_id = '${U1}' returning id`);
ok('013: собственик B не може да подмени миниатюра на снимка на A', r.length === 0);
// RLS филтрира редовете на UPDATE — без грешка, но и без засегнат ред.
r = await as('anon', null, `update property_photos set thumb_url = 'https://evil/x.jpg' where property_id = '${U1}' returning id`);
ok('013: анонимен не може да подмени миниатюра (0 засегнати реда)', r.length === 0);
ok('013: миниатюрите са непроменени след опитите на B и anon',
  (await db.query(`select count(*)::int n from property_photos where thumb_url like 'https://evil/%'`)).rows[0].n === 0);
r = await as('anon', null, `select has_function_privilege('anon','public.public_property(text)','execute') as a,
  has_function_privilege('public','public.public_property(text)','execute') as p`);
ok('013: правата са върнати след DROP+CREATE — anon може, „public“ не (изрично revoke)', r[0].a === true && r[0].p === false, JSON.stringify(r[0]));
// Повторно пускане на самата миграция — без грешка и със същия резултат.
await db.exec(readFileSync(join(projectDir, 'supabase/migrations/013_public_photo_thumbs.sql'), 'utf8'));
r = await as('anon', null, `select photo_thumbs from public_property('studio-1')`);
ok('013: е идемпотентна (повторно пускане без грешка, функцията работи)', r.length === 1 && r[0].photo_thumbs.length >= 4);

// ---------------------------------------------------------------- сезонни цени (014)
const U3 = 'd3d3d3d3-0000-0000-0000-000000000000'; // имот със сезони (отделен, за да не променя по-старите тестове за цена)
await db.exec(`
  insert into properties (id, owner_id, name, max_guests, channels, slug, is_listed) values
    ('${U3}', '${profA}', 'Къща със сезони', 4, '[]', 'sezoni', true);
  insert into property_settings (property_id, ota_commission_pct, tourist_tax, cleaning_fee, deposit_pct, base_price) values
    ('${U3}', 15.0, 0, 20, 30, 70);
  insert into price_seasons (property_id, name, start_month, start_day, end_month, end_day, price_per_night, min_nights, created_at) values
    ('${U3}', 'Зима',        11,  1,  3, 31,  60, 3, '2026-01-01'),
    ('${U3}', 'Лято',         6,  1,  9, 30, 120, 4, '2026-01-02'),
    ('${U3}', 'Август пик',   8, 10,  8, 20, 150, 2, '2026-01-03');
  insert into pricing_rules (property_id, start_date, end_date, price_per_night, min_nights, created_at) values
    ('${U3}', '2027-07-01', '2027-07-05', 100, 2, '2026-01-01');
`);
const quote = async (a, b) => (await as('anon', null, `select * from quote_stay('sezoni','${a}','${b}',2)`))[0];
const Q = ['nights', 'accommodation_total', 'total', 'min_nights'];

let q = await quote('2027-12-10', '2027-12-13');
ok('сезон „Зима“: 3 нощувки × 60 = 180, мин. 3, общо 200 (с почистване 20)', same(q, { nights: 3, accommodation_total: 180, total: 200, min_nights: 3 }), show(q, Q));
q = await quote('2027-03-30', '2027-04-02');
ok('зимата минава през Нова година: 30.03 и 31.03 са зима (60+60), 01.04 е извън сезон (основна 70) = 190, мин. 3', same(q, { accommodation_total: 190, min_nights: 3 }), show(q, Q));
q = await quote('2027-12-30', '2028-01-02');
ok('през Нова година 30.12 → 02.01: 3 нощувки зима = 180', same(q, { nights: 3, accommodation_total: 180 }), show(q, Q));
q = await quote('2027-10-30', '2027-11-02');
ok('границата на сезона: 30.10 и 31.10 са основна (70+70), 01.11 е зима (60) = 200', same(q, { accommodation_total: 200 }), show(q, Q));
q = await quote('2027-08-01', '2027-08-03');
ok('сезон „Лято“: 2 нощувки × 120 = 240, мин. 4', same(q, { accommodation_total: 240, min_nights: 4 }), show(q, Q));
q = await quote('2027-08-12', '2027-08-14');
ok('сезоните се застъпват (Лято и Август пик): печели по-новият → 2 × 150 = 300, мин. 2', same(q, { accommodation_total: 300, min_nights: 2 }), show(q, Q));
q = await quote('2027-07-03', '2027-07-07');
ok('правилото за конкретни дати бие сезона: 3–5.07 по 100, 6.07 по сезона Лято 120 = 420, мин. 2 от правилото', same(q, { accommodation_total: 420, min_nights: 2 }), show(q, Q));
q = await quote('2027-04-10', '2027-04-12');
ok('извън правила и сезони важи основната цена: 2 × 70 = 140, мин. 1', same(q, { accommodation_total: 140, min_nights: 1 }), show(q, Q));
q = await quote('2027-09-29', '2027-10-01');
ok('последният ден на лятото: 29.09 и 30.09 са сезон (240), 01.10 не влиза в престоя', same(q, { nights: 2, accommodation_total: 240 }), show(q, Q));

// помощната функция за дата
r = (await db.query(`select
  public.season_covers(11,1,3,31,'2027-03-31') a, public.season_covers(11,1,3,31,'2027-04-01') b,
  public.season_covers(11,1,3,31,'2027-11-01') c, public.season_covers(11,1,3,31,'2027-10-31') d,
  public.season_covers(1,1,12,31,'2027-02-28') e, public.season_covers(5,5,5,5,'2027-05-05') f,
  public.season_covers(5,5,5,5,'2027-05-06') g, public.season_covers(2,28,3,1,'2028-02-29') h,
  public.season_covers(12,20,1,10,'2027-12-31') i, public.season_covers(12,20,1,10,'2028-01-11') j`)).rows[0];
ok('season_covers: край на сезона (31.03 да, 01.04 не), начало (01.11 да, 31.10 не)', r.a && !r.b && r.c && !r.d, JSON.stringify(r));
ok('season_covers: цяла година, един ден, 29 февруари в 28.02–01.03, 20.12–10.01 през Нова година', r.e && r.f && !r.g && r.h && r.i && !r.j, JSON.stringify(r));

// ограничения
const ins = (cols, vals) => `insert into price_seasons (property_id, ${cols}) values ('${U3}', ${vals})`;
await expectError('сезон с несъществуващ ден (30 февруари) се отхвърля', ins('start_month, start_day, end_month, end_day, price_per_night', '2, 30, 3, 1, 50'), /price_seasons_start_valid|check constraint/i);
await expectError('сезон с несъществуващ ден (31 април) в края се отхвърля', ins('start_month, start_day, end_month, end_day, price_per_night', '4, 1, 4, 31, 50'), /price_seasons_end_valid|check constraint/i);
await expectError('месец 13 се отхвърля', ins('start_month, start_day, end_month, end_day, price_per_night', '13, 1, 3, 1, 50'), /check constraint/i);
await expectError('отрицателна цена се отхвърля', ins('start_month, start_day, end_month, end_day, price_per_night', '1, 1, 2, 1, -1'), /check constraint/i);
await expectError('минимален престой 0 се отхвърля', ins('start_month, start_day, end_month, end_day, price_per_night, min_nights', '1, 1, 2, 1, 50, 0'), /check constraint/i);
await expectError('име над 60 знака се отхвърля', ins('name, start_month, start_day, end_month, end_day, price_per_night', "'" + 'я'.repeat(61) + "', 1, 1, 2, 1, 50"), /check constraint/i);
await db.exec(`insert into price_seasons (id, property_id, name, start_month, start_day, end_month, end_day, price_per_night) values ('f0000000-0000-0000-0000-000000000029', '${U3}', 'Високосен ден', 2, 29, 2, 29, 99)`);
ok('29 февруари като начало и край е позволен', (await db.query(`select count(*)::int n from price_seasons where id = 'f0000000-0000-0000-0000-000000000029'`)).rows[0].n === 1);
await db.exec(`delete from price_seasons where id = 'f0000000-0000-0000-0000-000000000029'`);

// RLS: само собственикът
r = await as('authenticated', A, `select name from price_seasons where property_id = '${U3}' order by start_month`);
ok('собственик A вижда трите си сезона', r.length === 3, r.map((x) => x.name).join(', '));
r = await as('authenticated', B, `select id from price_seasons where property_id = '${U3}'`);
ok('друг собственик B не вижда сезоните на A (0 реда)', r.length === 0);
r = await as('anon', null, 'select id from price_seasons');
ok('анонимен не чете price_seasons директно (0 реда)', r.length === 0);
await asErr('B не може да добави сезон към имот на A', 'authenticated', B, ins('start_month, start_day, end_month, end_day, price_per_night', '1, 1, 2, 1, 1'), /row-level security/);
await asErr('анонимен не може да добави сезон', 'anon', null, ins('start_month, start_day, end_month, end_day, price_per_night', '1, 1, 2, 1, 1'), /row-level security/);
r = await as('authenticated', B, `update price_seasons set price_per_night = 1 where property_id = '${U3}' returning id`);
ok('B не може да смени цена на сезон на A (0 засегнати)', r.length === 0);
r = await as('authenticated', B, `delete from price_seasons where property_id = '${U3}' returning id`);
ok('B не може да изтрие сезон на A (0 засегнати)', r.length === 0);
r = await as('authenticated', A, `insert into price_seasons (property_id, name, start_month, start_day, end_month, end_day, price_per_night, min_nights) values ('${U3}', 'Пролет', 4, 1, 5, 31, 80, 2) returning id`);
ok('собственик A добавя сезон', r.length === 1);
const springId = r[0].id;
r = await as('authenticated', A, `update price_seasons set price_per_night = 85 where id = '${springId}' returning price_per_night`);
ok('собственик A сменя цената на сезон', r.length === 1 && Number(r[0].price_per_night) === 85);
q = await quote('2027-04-10', '2027-04-12');
ok('новият сезон „Пролет“ веднага влиза в цената: 2 × 85 = 170, мин. 2', same(q, { accommodation_total: 170, min_nights: 2 }), show(q, Q));
r = await as('authenticated', A, `delete from price_seasons where id = '${springId}' returning id`);
ok('собственик A изтрива сезон', r.length === 1);
q = await quote('2027-04-10', '2027-04-12');
ok('след изтриването пак важи основната цена (140)', same(q, { accommodation_total: 140, min_nights: 1 }), show(q, Q));

// public_seasons
r = await as('anon', null, "select * from public_seasons('sezoni')");
ok('public_seasons: анонимен вижда трите сезона по ред на месеца (Лято, Август пик, Зима)', r.map((x) => x.name).join('|') === 'Лято|Август пик|Зима', r.map((x) => x.name).join('|'));
ok('public_seasons: само периоди и цени (без id и собственик)', Object.keys(r[0]).sort().join(',') === 'end_day,end_month,min_nights,name,price_per_night,start_day,start_month', Object.keys(r[0]).join(','));
ok('public_seasons: стойностите са правилни (Зима 1.11–31.03 по 60, мин. 3)', (() => { const z = r.find((x) => x.name === 'Зима'); return z.start_month === 11 && z.start_day === 1 && z.end_month === 3 && z.end_day === 31 && Number(z.price_per_night) === 60 && z.min_nights === 3; })());
r = await as('anon', null, "select * from public_seasons('няма-такъв')");
ok('public_seasons: непознат slug → 0 реда', r.length === 0);
await db.exec(`insert into price_seasons (property_id, name, start_month, start_day, end_month, end_day, price_per_night) values ('${U2}', 'Скрит', 1, 1, 12, 31, 5)`);
r = await as('anon', null, "select * from public_seasons('apartment-2')");
ok('public_seasons: непубликуван имот (is_listed=false) → 0 реда, сезоните му не изтичат', r.length === 0);
r = await as('anon', null, "select * from quote_stay('apartment-2','2027-07-03','2027-07-05',1)");
ok('quote_stay: непубликуван имот със сезон пак → 0 реда', r.length === 0);
await db.exec(`delete from price_seasons where property_id = '${U2}'`);
r = await as('anon', null, `select has_function_privilege('anon','public.public_seasons(text)','execute') as a,
  has_function_privilege('public','public.public_seasons(text)','execute') as p,
  has_function_privilege('anon','public.quote_stay(text,date,date,int)','execute') as q,
  has_function_privilege('public','public.quote_stay(text,date,date,int)','execute') as qp`);
ok('014: правата — anon може public_seasons и quote_stay, „public“ не може нито едно', r[0].a === true && r[0].p === false && r[0].q === true && r[0].qp === false, JSON.stringify(r[0]));

// изтриване на имот маха сезоните му; повторно пускане на миграцията
await db.exec(`
  insert into properties (id, owner_id, name, max_guests, channels, slug, is_listed) values ('c9c9c9c9-0000-0000-0000-000000000000', '${profA}', 'Временен', 2, '[]', null, false);
  insert into price_seasons (property_id, start_month, start_day, end_month, end_day, price_per_night) values ('c9c9c9c9-0000-0000-0000-000000000000', 1, 1, 12, 31, 5);
  delete from properties where id = 'c9c9c9c9-0000-0000-0000-000000000000';`);
ok('014: изтриването на имот каскадно маха и сезоните му', (await db.query("select count(*)::int n from price_seasons where property_id = 'c9c9c9c9-0000-0000-0000-000000000000'")).rows[0].n === 0);
// Повторно пускане на 014 — без раздела за quote_stay: 015 вече го е сменил (повече колони), а връщането му към 014 би махнало офертите.
const m014 = readFileSync(join(projectDir, 'supabase/migrations/014_price_seasons.sql'), 'utf8').replace(/\r\n/g, '\n');
await db.exec(m014.slice(0, m014.indexOf('-- 4. quote_stay')) + m014.slice(m014.indexOf('-- 5. public_seasons')));
q = await quote('2027-12-10', '2027-12-13');
ok('014: е идемпотентна — повторно пускане без грешка, цената е същата (180)', same(q, { accommodation_total: 180, min_nights: 3 }), show(q, Q));
ok('014: след повторното пускане политиките не са задвоени (по една на действие)', (await db.query("select count(*)::int n from pg_policies where tablename = 'price_seasons'")).rows[0].n === 4);
// старата цена за Студио 1 (без сезони) остава непроменена от новата quote_stay
r = await as('anon', null, "select * from quote_stay('studio-1','2027-07-03','2027-07-07',2)");
ok('014: имот без сезони се цени както преди (Студио 1: 370 за 3.07–7.07)', same(r[0], { accommodation_total: 370, min_nights: 2 }), show(r[0], Q));

// ---------------------------------------------------------------- пакети и оферти (015)
const U4 = 'd4d4d4d4-0000-0000-0000-000000000000'; // имот само за пакети: основна цена 100, почистване 20, капаро 30%
await db.exec(`
  insert into properties (id, owner_id, name, max_guests, channels, slug, is_listed) values
    ('${U4}', '${profA}', 'Къща с пакети', 4, '[]', 'pakety', true);
  insert into property_settings (property_id, ota_commission_pct, tourist_tax, cleaning_fee, deposit_pct, base_price) values
    ('${U4}', 15.0, 0, 20, 30, 100);
`);
const sofiaToday = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Sofia' });
const plus = (n) => { const d = new Date(sofiaToday() + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const isodow = (iso) => { const w = new Date(iso + 'T00:00:00Z').getUTCDay(); return w === 0 ? 7 : w; };
const qp = async (inOffset, nights) => (await as('anon', null, `select * from quote_stay('pakety','${plus(inOffset)}','${plus(inOffset + nights)}',2)`))[0];
const QP = ['nights', 'accommodation_total', 'discount', 'total', 'deposit'];
const addPkg = async (cols, vals) => (await db.query(`insert into stay_packages (property_id, ${cols}) values ('${U4}', ${vals}) returning id`)).rows[0].id;
const clearPkgs = () => db.exec(`delete from stay_packages where property_id = '${U4}'`);

let q4 = await qp(60, 3);
ok('без пакети: 3 × 100 + почистване 20 = 320, отстъпка 0 и без package_id', same(q4, { nights: 3, accommodation_total: 300, discount: 0, total: 320 }) && q4.package_id === null, show(q4, QP));

// --- „6+1“
const six1 = await addPkg('kind, name, paid_nights, free_nights', `'free_nights', '6+1', 6, 1`);
q4 = await qp(60, 7);
ok('„6+1“: 7 нощувки → 1 безплатна: 700 − 100 = 600 + 20 = 620, капаро 30% = 186', same(q4, { accommodation_total: 700, discount: 100, total: 620, deposit: 186 }) && q4.package_id === six1, show(q4, QP));
q4 = await qp(60, 6);
ok('„6+1“: 6 нощувки още не са достатъчни — без отстъпка (620 − 20 = 600 за 6 × 100)', same(q4, { discount: 0, total: 620 }) && q4.package_id === null, show(q4, QP));
q4 = await qp(60, 8);
ok('„6+1“ без повторение: 8 нощувки пак 1 безплатна', same(q4, { accommodation_total: 800, discount: 100 }), show(q4, QP));
q4 = await qp(60, 14);
ok('„6+1“ без повторение: 14 нощувки пак само 1 безплатна', same(q4, { accommodation_total: 1400, discount: 100 }), show(q4, QP));
await clearPkgs();
await addPkg('kind, name, paid_nights, free_nights, repeat_block', `'free_nights', '6+1', 6, 1, true`);
q4 = await qp(60, 14);
ok('„6+1“ с повторение: 14 нощувки → 2 безплатни (2 пълни блока по 7)', same(q4, { accommodation_total: 1400, discount: 200, total: 1220 }), show(q4, QP));
q4 = await qp(60, 13);
ok('„6+1“ с повторение: 13 нощувки → 1 безплатна (един пълен блок)', same(q4, { discount: 100 }), show(q4, QP));
await clearPkgs();

// --- безплатни са най-евтините нощувки
await db.exec(`insert into pricing_rules (property_id, start_date, end_date, price_per_night, min_nights, created_at) values ('${U4}', '${plus(200)}', '${plus(205)}', 150, 1, '2026-01-01')`);
await addPkg('kind, paid_nights, free_nights', `'free_nights', 6, 1`);
q4 = await qp(200, 7);
ok('безплатната нощувка е най-евтината: 6 нощувки по 150 и 1 по 100 → отстъпка 100 (не 150)', same(q4, { accommodation_total: 1000, discount: 100, total: 920 }), show(q4, QP));
await clearPkgs();

// --- отстъпка за по-дълъг престой
const week = await addPkg('kind, name, min_nights, percent', `'percent_off', 'Седмица', 7, 10`);
q4 = await qp(60, 7);
ok('седмица −10%: 7 нощувки → 700 − 70 = 630 + 20 = 650', same(q4, { accommodation_total: 700, discount: 70, total: 650 }) && q4.package_id === week, show(q4, QP));
q4 = await qp(60, 6);
ok('седмица −10%: 6 нощувки — без отстъпка', same(q4, { discount: 0 }), show(q4, QP));
q4 = await qp(60, 30);
ok('седмица −10%: 30 нощувки → −300', same(q4, { accommodation_total: 3000, discount: 300 }), show(q4, QP));
await clearPkgs();

// --- фиксирана цена
await addPkg('kind, name, fixed_nights, fixed_total', `'fixed_price', '3 нощувки за 250', 3, 250`);
q4 = await qp(60, 3);
ok('фиксирана цена: 3 нощувки за 250 вместо 300 → отстъпка 50, общо 270', same(q4, { accommodation_total: 300, discount: 50, total: 270 }), show(q4, QP));
q4 = await qp(60, 4);
ok('фиксирана цена важи само за точно 3 нощувки (4 → без отстъпка)', same(q4, { discount: 0 }), show(q4, QP));
await clearPkgs();
await addPkg('kind, fixed_nights, fixed_total', `'fixed_price', 3, 300`);
q4 = await qp(60, 3);
ok('фиксирана цена, която не е по-ниска от сметката (300 при 300), не дава „отстъпка“', same(q4, { discount: 0 }) && q4.package_id === null, show(q4, QP));
await clearPkgs();
await addPkg('kind, fixed_nights, fixed_total, checkin_weekday', `'fixed_price', 2, 150, ${isodow(plus(60))}`);
q4 = await qp(60, 2);
ok('фиксирана цена само при настаняване в определен ден: в правилния ден важи (2 за 150)', same(q4, { accommodation_total: 200, discount: 50 }), show(q4, QP));
q4 = await qp(61, 2);
ok('… а на следващия ден (друг ден от седмицата) — не', same(q4, { discount: 0 }), show(q4, QP));
await clearPkgs();

// --- ранно записване и последна минута (спрямо днешна дата по българско време)
await addPkg('kind, name, days_before, percent', `'early_bird', 'Ранно', 30, 20`);
q4 = await qp(40, 2);
ok('ранно записване −20% (≥ 30 дни по-рано): настаняване след 40 дни → −40 от 200', same(q4, { accommodation_total: 200, discount: 40 }), show(q4, QP));
q4 = await qp(30, 2);
ok('ранно записване: точно 30 дни по-рано още важи', same(q4, { discount: 40 }), show(q4, QP));
q4 = await qp(29, 2);
ok('ранно записване: 29 дни — вече не', same(q4, { discount: 0 }), show(q4, QP));
await clearPkgs();
await addPkg('kind, name, days_before, percent', `'last_minute', 'Последна минута', 3, 15`);
q4 = await qp(0, 2);
ok('последна минута −15% (настаняване до 3 дни): днес → −30 от 200', same(q4, { accommodation_total: 200, discount: 30, total: 190 }), show(q4, QP));
q4 = await qp(3, 2);
ok('последна минута: след точно 3 дни още важи', same(q4, { discount: 30 }), show(q4, QP));
q4 = await qp(4, 2);
ok('последна минута: след 4 дни — вече не', same(q4, { discount: 0 }), show(q4, QP));
await clearPkgs();

// --- най-изгодният печели; отстъпките не се събират
const sixPlus = await addPkg('kind, name, paid_nights, free_nights, created_at', `'free_nights', '6+1', 6, 1, '2026-01-01'`);
const twenty = await addPkg('kind, name, min_nights, percent, created_at', `'percent_off', '−20% от 7', 7, 20, '2026-01-02'`);
q4 = await qp(60, 7);
ok('две подходящи оферти: важи по-изгодната за госта (−20% = 140, не 6+1 = 100) и не се събират', same(q4, { accommodation_total: 700, discount: 140, total: 580 }) && q4.package_id === twenty, show(q4, QP));
await db.exec(`update stay_packages set percent = 14.29 where id = '${twenty}'`);
q4 = await qp(60, 7);
ok('при по-малка отстъпка (14.29% = 100.03 > 100) печели пак процентът; при 14% (98) — „6+1“', same(q4, { discount: 100.03 }), show(q4, QP));
await db.exec(`update stay_packages set percent = 14 where id = '${twenty}'`);
q4 = await qp(60, 7);
ok('при −14% (98) печели „6+1“ (100)', same(q4, { discount: 100 }) && q4.package_id === sixPlus, show(q4, QP));
// равни отстъпки: „7 нощувки за 600“ също дава 100 — при равенство печели по-рано създаденият
const fixed7 = await addPkg('kind, fixed_nights, fixed_total, created_at', `'fixed_price', 7, 600, '2026-01-03'`);
await db.exec(`delete from stay_packages where id = '${twenty}'`);
q4 = await qp(60, 7);
ok('при равни отстъпки (100 и 100) печели по-рано създаденият („6+1“)', same(q4, { discount: 100 }) && q4.package_id === sixPlus, show(q4, QP));
await db.exec(`update stay_packages set created_at = '2026-01-04' where id = '${sixPlus}'`);
q4 = await qp(60, 7);
ok('… и ако „6+1“ е по-нов — печели фиксираната цена', same(q4, { discount: 100 }) && q4.package_id === fixed7, show(q4, QP));
await clearPkgs();

// --- период на важене и изключване
const jul = await addPkg('kind, min_nights, percent, valid_from, valid_to', `'percent_off', 2, 10, '${plus(100)}', '${plus(110)}'`);
q4 = await qp(105, 2);
ok('оферта с период: настаняване вътре в периода важи', same(q4, { discount: 20 }), show(q4, QP));
q4 = await qp(111, 2);
ok('… настаняване след края на периода — не', same(q4, { discount: 0 }), show(q4, QP));
q4 = await qp(99, 2);
ok('… настаняване преди началото — не', same(q4, { discount: 0 }), show(q4, QP));
q4 = await qp(110, 2);
ok('… последният ден на периода още важи (по датата на настаняване, не на напускане)', same(q4, { discount: 20 }), show(q4, QP));
await db.exec(`update stay_packages set is_active = false where id = '${jul}'`);
q4 = await qp(105, 2);
ok('изключена оферта (is_active = false) не се прилага', same(q4, { discount: 0 }), show(q4, QP));
await clearPkgs();

// --- отстъпката не надвишава сметката
await addPkg('kind, min_nights, percent', `'percent_off', 1, 90`);
q4 = await qp(60, 2);
ok('максималната отстъпка 90% — остава поне 10% (200 → 180 отстъпка, общо 20 + 20)', same(q4, { accommodation_total: 200, discount: 180, total: 40 }), show(q4, QP));
await clearPkgs();

// --- ограничения на таблицата
const bad = (cols, vals) => `insert into stay_packages (property_id, ${cols}) values ('${U4}', ${vals})`;
await expectError('непознат вид се отхвърля', bad('kind', `'нещо'`), /check constraint/i);
await expectError('„6+1“ без безплатни нощувки се отхвърля', bad('kind, paid_nights', `'free_nights', 6`), /stay_packages_params|check constraint/i);
await expectError('отстъпка без процент се отхвърля', bad('kind, min_nights', `'percent_off', 7`), /stay_packages_params|check constraint/i);
await expectError('процент 0 се отхвърля', bad('kind, min_nights, percent', `'percent_off', 7, 0`), /check constraint/i);
await expectError('процент над 90 се отхвърля', bad('kind, min_nights, percent', `'percent_off', 7, 95`), /check constraint/i);
await expectError('фиксирана цена без сума се отхвърля', bad('kind, fixed_nights', `'fixed_price', 3`), /stay_packages_params|check constraint/i);
await expectError('фиксирана цена 0 се отхвърля', bad('kind, fixed_nights, fixed_total', `'fixed_price', 3, 0`), /check constraint/i);
await expectError('ранно записване с 0 дни се отхвърля', bad('kind, days_before, percent', `'early_bird', 0, 10`), /stay_packages_params|check constraint/i);
await expectError('ден от седмицата 8 се отхвърля', bad('kind, fixed_nights, fixed_total, checkin_weekday', `'fixed_price', 3, 200, 8`), /check constraint/i);
await expectError('край на периода преди началото се отхвърля', bad('kind, min_nights, percent, valid_from, valid_to', `'percent_off', 2, 10, '2027-02-01', '2027-01-01'`), /stay_packages_valid_dates|check constraint/i);
await expectError('име над 60 знака се отхвърля', bad('kind, name, min_nights, percent', `'percent_off', '${'я'.repeat(61)}', 2, 10`), /check constraint/i);
await expectError('0 платени нощувки се отхвърля', bad('kind, paid_nights, free_nights', `'free_nights', 0, 1`), /check constraint/i);

// --- RLS: само собственикът
const pa = (await as('authenticated', A, `insert into stay_packages (property_id, kind, name, min_nights, percent) values ('${U4}', 'percent_off', 'Моя', 5, 12) returning id`))[0].id;
ok('собственик A добавя оферта', !!pa);
let rp = await as('authenticated', A, `select id from stay_packages where property_id = '${U4}'`);
ok('собственик A я вижда', rp.length === 1);
rp = await as('authenticated', B, `select id from stay_packages where property_id = '${U4}'`);
ok('друг собственик B не вижда офертите на A (0 реда)', rp.length === 0);
rp = await as('anon', null, 'select id from stay_packages');
ok('анонимен не чете stay_packages директно (0 реда)', rp.length === 0);
await asErr('B не може да добави оферта към имот на A', 'authenticated', B, bad('kind, min_nights, percent', `'percent_off', 2, 10`), /row-level security/);
await asErr('анонимен не може да добави оферта', 'anon', null, bad('kind, min_nights, percent', `'percent_off', 2, 10`), /row-level security/);
rp = await as('authenticated', B, `update stay_packages set percent = 90 where id = '${pa}' returning id`);
ok('B не може да смени оферта на A (0 засегнати)', rp.length === 0);
rp = await as('authenticated', B, `delete from stay_packages where id = '${pa}' returning id`);
ok('B не може да изтрие оферта на A (0 засегнати)', rp.length === 0);
rp = await as('authenticated', A, `update stay_packages set percent = 15 where id = '${pa}' returning percent`);
ok('собственик A сменя процента', rp.length === 1 && Number(rp[0].percent) === 15);
q4 = await qp(60, 5);
ok('променената оферта веднага влиза в цената: 5 × 100 = 500, −15% = 75', same(q4, { accommodation_total: 500, discount: 75, total: 445 }), show(q4, QP));

// --- public_packages
await db.exec(`
  insert into stay_packages (property_id, kind, name, is_active, min_nights, percent, valid_to) values ('${U4}', 'percent_off', 'Изключена', false, 3, 5, null);
  insert into stay_packages (property_id, kind, name, min_nights, percent, valid_from, valid_to) values ('${U4}', 'percent_off', 'Изтекла', 3, 5, '2026-01-01', '2026-02-01');
  insert into stay_packages (property_id, kind, name, fixed_nights, fixed_total, checkin_weekday) values ('${U4}', 'fixed_price', 'Уикенд', 2, 150, 5);
`);
let pubs = await as('anon', null, "select * from public_packages('pakety') ");
ok('public_packages: само активните и неизтеклите (Моя и Уикенд), по ред на създаване', pubs.map((x) => x.name).join('|') === 'Моя|Уикенд', pubs.map((x) => x.name).join('|'));
ok('public_packages: само параметри на офертата (без имот и собственик)', Object.keys(pubs[0]).sort().join(',') === 'checkin_weekday,days_before,fixed_nights,fixed_total,free_nights,id,kind,min_nights,name,paid_nights,percent,repeat_block,valid_from,valid_to', Object.keys(pubs[0]).join(','));
ok('public_packages: ден от седмицата е число (5 = петък), процентът е правилен', pubs[1].checkin_weekday === 5 && Number(pubs[0].percent) === 15);
pubs = await as('anon', null, "select * from public_packages('няма-такъв')");
ok('public_packages: непознат адрес → 0 реда', pubs.length === 0);
await db.exec(`insert into stay_packages (property_id, kind, name, min_nights, percent) values ('${U2}', 'percent_off', 'Скрита', 2, 10)`);
pubs = await as('anon', null, "select * from public_packages('apartment-2')");
ok('public_packages: непубликуван имот → 0 реда', pubs.length === 0);
r = await as('anon', null, "select * from quote_stay('apartment-2','2027-07-03','2027-07-05',1)");
ok('quote_stay: непубликуван имот с оферта пак → 0 реда', r.length === 0);
await db.exec(`delete from stay_packages where property_id = '${U2}'`);

// --- остава всичко старо: имотите със сезони и без пакети се цеnят както преди
r = await as('anon', null, "select * from quote_stay('sezoni','2027-12-10','2027-12-13',2)");
ok('015: имот със сезони без пакети — същата цена като преди (180 + 20 = 200), отстъпка 0', same(r[0], { accommodation_total: 180, total: 200, discount: 0, min_nights: 3 }) && r[0].package_id === null, show(r[0], ['accommodation_total', 'total', 'discount', 'min_nights']));
r = await as('anon', null, "select * from quote_stay('studio-1','2027-07-03','2027-07-07',2)");
ok('015: Студио 1 (правило за дати + основна цена) — същата цена като преди (370)', same(r[0], { accommodation_total: 370, discount: 0, min_nights: 2 }), show(r[0], ['accommodation_total', 'discount', 'min_nights']));

// --- права, каскада, повторно пускане
r = await as('anon', null, `select has_function_privilege('anon','public.public_packages(text)','execute') as a,
  has_function_privilege('public','public.public_packages(text)','execute') as p,
  has_function_privilege('anon','public.quote_stay(text,date,date,int)','execute') as q,
  has_function_privilege('authenticated','public.quote_stay(text,date,date,int)','execute') as qa,
  has_function_privilege('public','public.quote_stay(text,date,date,int)','execute') as qp`);
ok('015: правата — anon и логнат може quote_stay и public_packages, „public“ не може нито едно', r[0].a === true && r[0].p === false && r[0].q === true && r[0].qa === true && r[0].qp === false, JSON.stringify(r[0]));
await db.exec(`
  insert into properties (id, owner_id, name, max_guests, channels, slug, is_listed) values ('c8c8c8c8-0000-0000-0000-000000000000', '${profA}', 'Временен 2', 2, '[]', null, false);
  insert into stay_packages (property_id, kind, min_nights, percent) values ('c8c8c8c8-0000-0000-0000-000000000000', 'percent_off', 2, 10);
  delete from properties where id = 'c8c8c8c8-0000-0000-0000-000000000000';`);
ok('015: изтриването на имот каскадно маха и офертите му', (await db.query("select count(*)::int n from stay_packages where property_id = 'c8c8c8c8-0000-0000-0000-000000000000'")).rows[0].n === 0);
await db.exec(readFileSync(join(projectDir, 'supabase/migrations/015_stay_packages.sql'), 'utf8'));
q4 = await qp(60, 5);
ok('015: е идемпотентна — повторно пускане без грешка, цената е същата (500 − 75)', same(q4, { accommodation_total: 500, discount: 75, total: 445 }), show(q4, QP));
ok('015: след повторното пускане политиките не са задвоени (по една на действие)', (await db.query("select count(*)::int n from pg_policies where tablename = 'stay_packages'")).rows[0].n === 4);
ok('015: функцията quote_stay е една (без остатък от стария подпис)', (await db.query("select count(*)::int n from pg_proc where proname = 'quote_stay'")).rows[0].n === 1);

console.log(`\n${pass} успешни, ${fail} провалени\n`);
process.exit(fail ? 1 : 0);
