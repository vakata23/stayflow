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
  insert into properties (id, owner_id, name, max_guests, channels) values
    ('${U1}', '${profA}', 'Студио 1', 2, '[{"type":"viber","value":"+359888000001"}]'),
    ('${U2}', '${profA}', 'Апартамент 2', 4, '[]'),
    ('${UB}', '${profB}', 'Имотът на Б', 3, '[]');

  insert into property_settings (property_id, ota_commission_pct, tourist_tax, cleaning_fee, deposit_pct) values
    ('${U1}', 15.0, 1.00, 20, 30),
    ('${U2}', 20.0, 1.00, 20, 30);

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

console.log(`\n${pass} успешни, ${fail} провалени\n`);
process.exit(fail ? 1 : 0);
