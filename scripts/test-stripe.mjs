// Плащане с карта през Stripe — сървърна логика без мрежа (подменен fetch).   node scripts/test-stripe.mjs
import crypto from 'node:crypto'
import { planPayment, createPaymentLink, verifyStripeSignature, handleStripeWebhook, isSecretKey, keyMode, parseProfileIds, MIN_CENTS } from '../src/lib/stripeServer.js'

let pass = 0
let fail = 0
const ok = (cond, name, extra = '') => {
  if (cond) pass++
  else {
    fail++
    console.log('FAIL ', name, extra)
  }
}
const eq = (a, b, name) => ok(JSON.stringify(a) === JSON.stringify(b), name, `получи ${JSON.stringify(a)}, очаквано ${JSON.stringify(b)}`)

/* ---------- планиране на сумата ---------- */
const bk = { total_price: '300.00', tourist_tax: '0.00', source: 'direct', status: 'confirmed' }
eq(planPayment({ booking: bk, depositPct: 30, payments: [], kind: 'deposit' }), { ok: true, kind: 'deposit', cents: 9000 }, 'капаро 30% от 300 = 90.00')
eq(planPayment({ booking: bk, depositPct: 30, payments: [], kind: 'balance' }), { ok: true, kind: 'balance', cents: 30000 }, 'остатък без плащания = всичко')
eq(planPayment({ booking: bk, depositPct: 30, payments: [{ kind: 'deposit', amount: 90 }], kind: 'balance' }).cents, 21000, 'след капаро остатъкът е 210')
eq(planPayment({ booking: bk, depositPct: 30, payments: [{ kind: 'deposit', amount: 90 }], kind: 'deposit' }).reason, 'nothing_due', 'капарото е платено → няма какво да се иска пак')
eq(planPayment({ booking: bk, depositPct: 30, payments: [{ kind: 'deposit', amount: 40 }], kind: 'deposit' }).cents, 5000, 'платени 40 от капаро 90 → още 50')
eq(planPayment({ booking: bk, depositPct: 30, payments: [{ kind: 'deposit', amount: 90 }, { kind: 'refund', amount: 90 }], kind: 'deposit' }).cents, 9000, 'върнато капаро се иска пак')
eq(planPayment({ booking: bk, depositPct: null, payments: [], kind: 'deposit' }).cents, 9000, 'без зададен % → 30%')
eq(planPayment({ booking: bk, depositPct: 100, payments: [], kind: 'deposit' }).cents, 30000, '100% = цялата сума')
eq(planPayment({ booking: bk, depositPct: 250, payments: [], kind: 'deposit' }).cents, 30000, '% над 100 се свежда до 100')
eq(planPayment({ booking: { ...bk, tourist_tax: '12.50' }, depositPct: 30, payments: [], kind: 'balance' }).cents, 31250, 'туристическият данък се включва')
eq(planPayment({ booking: { ...bk, total_price: '300' }, depositPct: 33, payments: [], kind: 'deposit' }).cents, 9900, 'закръгляне до цент (33% от 300)')
eq(planPayment({ booking: { ...bk, total_price: '0.30' }, depositPct: 100, payments: [], kind: 'balance' }).reason, 'nothing_due', `под ${MIN_CENTS / 100} € не се иска плащане`)
eq(planPayment({ booking: { ...bk, total_price: null }, depositPct: 30, payments: [], kind: 'balance' }).reason, 'no_price', 'без цена → отказ')
eq(planPayment({ booking: { ...bk, source: 'airbnb' }, depositPct: 30, payments: [], kind: 'balance' }).reason, 'platform', 'Airbnb резервация → отказ')
eq(planPayment({ booking: { ...bk, source: 'booking' }, depositPct: 30, payments: [], kind: 'balance' }).reason, 'platform', 'Booking резервация → отказ')
eq(planPayment({ booking: { ...bk, status: 'cancelled' }, depositPct: 30, payments: [], kind: 'balance' }).reason, 'cancelled', 'отказана резервация → отказ')
eq(planPayment({ booking: bk, kind: 'refund' }).reason, 'kind', 'непознат вид → отказ')
eq(planPayment({ booking: null, kind: 'balance' }).reason, 'missing', 'няма резервация → отказ')
eq(planPayment({ booking: bk, depositPct: 30, payments: [{ kind: 'balance', amount: 300 }], kind: 'balance' }).reason, 'nothing_due', 'платено изцяло → отказ')

/* ключове */
ok(isSecretKey('sk_test_51ABCdefGHIjkl'), 'тестов таен ключ е валиден')
ok(isSecretKey('rk_live_51ABCdefGHIjkl'), 'ограничен ключ е валиден')
ok(!isSecretKey('pk_test_51ABCdefGHIjkl'), 'публичен ключ pk_ се отхвърля')
ok(!isSecretKey('') && !isSecretKey(undefined) && !isSecretKey('sk_test_'), 'празен/кратък ключ се отхвърля')
eq([keyMode('sk_test_51ABCdefGHIjkl'), keyMode('sk_live_51ABCdefGHIjkl')], ['test', 'live'], 'режим тест/на живо по ключа')

/* ---------- подпис ---------- */
const SECRET = 'whsec_testsecret'
const sign = (body, t, secret = SECRET) => `t=${t},v1=${crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`
const NOW = 1_800_000_000
const body = '{"id":"evt_1","type":"x"}'
ok(verifyStripeSignature(body, sign(body, NOW), SECRET, NOW), 'верен подпис минава')
ok(!verifyStripeSignature(body + ' ', sign(body, NOW), SECRET, NOW), 'подправено тяло се отхвърля')
ok(!verifyStripeSignature(body, sign(body, NOW, 'whsec_other'), SECRET, NOW), 'подпис с друг ключ се отхвърля')
ok(!verifyStripeSignature(body, sign(body, NOW - 301), SECRET, NOW), 'стар подпис (над 5 мин) се отхвърля')
ok(verifyStripeSignature(body, sign(body, NOW - 299), SECRET, NOW), 'подпис отпреди 4:59 минава')
ok(!verifyStripeSignature(body, sign(body, NOW + 400), SECRET, NOW), 'подпис от бъдещето се отхвърля')
ok(!verifyStripeSignature(body, '', SECRET, NOW) && !verifyStripeSignature(body, null, SECRET, NOW), 'без заглавие се отхвърля')
ok(!verifyStripeSignature(body, `t=${NOW},v1=abc`, SECRET, NOW), 'кратък подпис не гърми и не минава')
ok(!verifyStripeSignature(body, `t=abc,v1=${'0'.repeat(64)}`, SECRET, NOW), 'нечислово време се отхвърля')
ok(verifyStripeSignature(body, `${sign(body, NOW)},v1=${'0'.repeat(64)}`, SECRET, NOW), 'при два v1 подписа достатъчно е единият да е верен')
ok(!verifyStripeSignature(body, sign(body, NOW), '', NOW), 'без тайна → отхвърля')

/* ---------- мрежата е подменена ---------- */
const realFetch = globalThis.fetch
const BASE = 'https://db.test'
const OWNER_PROFILE = '11111111-1111-4111-8111-111111111111'
const OTHER_PROFILE = '22222222-2222-4222-8222-222222222222'
const BOOKING_ID = '33333333-3333-4333-8333-333333333333'
const PROP_ID = '44444444-4444-4444-8444-444444444444'
const state = { calls: [], bookings: [], properties: [], settings: [], payments: [], users: {}, profiles: {}, stripe: { ok: true, status: 200, json: { id: 'cs_1', url: 'https://checkout.stripe.com/c/pay/cs_1' } } }
const resetState = () => {
  state.calls = []
  state.bookings = [{ id: BOOKING_ID, property_id: PROP_ID, guest_email: 'gost@example.com', check_in: '2026-12-10', check_out: '2026-12-13', total_price: '300.00', tourist_tax: '0.00', source: 'direct', status: 'confirmed' }]
  state.properties = [{ id: PROP_ID, owner_id: OWNER_PROFILE, name: 'Вила Тихи бряг' }]
  state.settings = [{ property_id: PROP_ID, deposit_pct: 30 }]
  state.payments = []
  state.users = { 'tok-owner': 'u-owner', 'tok-other': 'u-other' }
  state.profiles = { 'u-owner': OWNER_PROFILE, 'u-other': OTHER_PROFILE }
  state.stripe = { ok: true, status: 200, json: { id: 'cs_1', url: 'https://checkout.stripe.com/c/pay/cs_1' } }
}
const jsonRes = (status, data) => ({ ok: status < 400, status, json: async () => data })
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url)
  state.calls.push({ url: u, method: opts.method ?? 'GET', body: opts.body, headers: opts.headers })
  if (u.startsWith('https://api.stripe.com/')) return { ok: state.stripe.ok, status: state.stripe.status, json: async () => state.stripe.json }
  if (u.startsWith(`${BASE}/auth/v1/user`)) {
    const t = String(opts.headers?.Authorization ?? '').replace('Bearer ', '')
    return state.users[t] ? jsonRes(200, { id: state.users[t] }) : jsonRes(401, {})
  }
  const m = u.match(/^https:\/\/db\.test\/rest\/v1\/([a-z_]+)(?:\?(.*))?$/)
  if (!m) return jsonRes(404, {})
  const [, table, qs = ''] = m
  const q = new URLSearchParams(qs)
  const eqv = (col) => (q.get(col) ?? '').replace(/^eq\./, '')
  if (opts.method === 'POST') {
    const row = JSON.parse(opts.body)
    if (table === 'payments') state.payments.push({ id: `pay-${state.payments.length + 1}`, paid_at: new Date(2026, 0, 1, 0, 0, state.payments.length).toISOString(), ...row })
    return jsonRes(201, [])
  }
  if (opts.method === 'DELETE') {
    state.payments = state.payments.filter((p) => p.id !== eqv('id'))
    return jsonRes(204, [])
  }
  if (table === 'profiles') return jsonRes(200, Object.entries(state.profiles).filter(([uid]) => uid === eqv('user_id')).map(([, id]) => ({ id })))
  if (table === 'bookings') return jsonRes(200, state.bookings.filter((b) => b.id === eqv('id')))
  if (table === 'properties') return jsonRes(200, state.properties.filter((p) => p.id === eqv('id')))
  if (table === 'property_settings') return jsonRes(200, state.settings.filter((s) => s.property_id === eqv('property_id')))
  if (table === 'payments') {
    if (q.get('booking_id')) return jsonRes(200, state.payments.filter((p) => p.booking_id === eqv('booking_id')))
    if (q.get('external_ref')) return jsonRes(200, state.payments.filter((p) => p.external_ref === decodeURIComponent(eqv('external_ref'))))
  }
  return jsonRes(200, [])
}
const base = { supabaseUrl: BASE, serviceKey: 'service', stripeKey: 'sk_test_51ABCdefGHIjkl', appUrl: 'https://stayfloww.netlify.app', now: NOW * 1000, allowedProfiles: `${OWNER_PROFILE}, ${OTHER_PROFILE}` }
const stripeCalls = () => state.calls.filter((c) => c.url.startsWith('https://api.stripe.com/'))

/* ---------- кой профил може да прави линкове (парите отиват в ЕДНА сметка на Stripe) ---------- */
eq(parseProfileIds(` ${OWNER_PROFILE.toUpperCase()} , не-id,${OTHER_PROFILE}`), [OWNER_PROFILE, OTHER_PROFILE], 'списъкът с профили: интервали, главни букви, невалидните се пропускат')
eq([parseProfileIds(''), parseProfileIds(undefined), parseProfileIds('a,b')], [[], [], []], 'празен или невалиден списък = никой')

/* ---------- линк за плащане ---------- */
resetState()
let r = await createPaymentLink({ ...base, stripeKey: undefined, token: 'tok-owner', bookingId: BOOKING_ID, kind: 'deposit' })
ok(r.status === 501 && r.body.configured === false, 'без ключ на Stripe → 501 „не е свързан“', JSON.stringify(r))
ok(stripeCalls().length === 0 && state.calls.length === 0, 'без ключ → нито една заявка (дори към базата)')
r = await createPaymentLink({ ...base, stripeKey: 'pk_test_51ABCdefGHIjkl', token: 'tok-owner', bookingId: BOOKING_ID, kind: 'deposit' })
ok(r.status === 501 && /sk_test_/.test(r.body.error), 'публичен ключ вместо таен → ясно съобщение')

resetState()
r = await createPaymentLink({ ...base, token: '', bookingId: BOOKING_ID, kind: 'deposit' })
ok(r.status === 401, 'без вход → 401')
r = await createPaymentLink({ ...base, token: 'tok-bad', bookingId: BOOKING_ID, kind: 'deposit' })
ok(r.status === 401 && stripeCalls().length === 0, 'невалиден токен → 401, без заявка към Stripe')
r = await createPaymentLink({ ...base, token: 'tok-owner', bookingId: 'x; drop table', kind: 'deposit' })
ok(r.status === 400, 'невалиден идентификатор → 400')
for (const allowed of [undefined, '', 'rubbish', OTHER_PROFILE]) {
  resetState()
  r = await createPaymentLink({ ...base, allowedProfiles: allowed, token: 'tok-owner', bookingId: BOOKING_ID, kind: 'deposit' })
  ok(r.status === 403 && stripeCalls().length === 0 && !state.calls.some((c) => c.url.includes('/bookings')), `профил извън списъка (${JSON.stringify(allowed)}) → 403, без четене на резервации и без линк`, JSON.stringify(r))
}
resetState()
r = await createPaymentLink({ ...base, allowedProfiles: OWNER_PROFILE, token: 'tok-other', bookingId: BOOKING_ID, kind: 'deposit' })
ok(r.status === 403, 'друг собственик, който не е в списъка, не може да вкара пари в чужда сметка')
r = await createPaymentLink({ ...base, token: 'tok-other', bookingId: BOOKING_ID, kind: 'deposit' })
ok(r.status === 404 && stripeCalls().length === 0, 'чужда резервация → 404 и никакъв линк', JSON.stringify(r))
r = await createPaymentLink({ ...base, token: 'tok-owner', bookingId: '55555555-5555-4555-8555-555555555555', kind: 'deposit' })
ok(r.status === 404, 'несъществуваща резервация → същият 404')
r = await createPaymentLink({ ...base, token: 'tok-owner', bookingId: BOOKING_ID, kind: 'refund' })
ok(r.status === 422 && r.body.reason === 'kind', 'непознат вид → 422')

resetState()
r = await createPaymentLink({ ...base, token: 'tok-owner', bookingId: BOOKING_ID, kind: 'deposit' })
ok(r.status === 200 && r.body.ok && r.body.url === 'https://checkout.stripe.com/c/pay/cs_1' && r.body.amount === 90 && r.body.kind === 'deposit' && r.body.mode === 'test', 'собственикът получава линк за капаро 90 €', JSON.stringify(r))
const sc = stripeCalls()
ok(sc.length === 1 && sc[0].method === 'POST', 'точно една заявка към Stripe')
const sent = new URLSearchParams(sc[0].body)
ok(sc[0].headers.Authorization === 'Bearer sk_test_51ABCdefGHIjkl' && sc[0].headers['Content-Type'] === 'application/x-www-form-urlencoded', 'заглавия: ключ и form-encoded')
ok(sent.get('mode') === 'payment' && sent.get('line_items[0][price_data][currency]') === 'eur' && sent.get('line_items[0][price_data][unit_amount]') === '9000', 'режим payment, евро, 9000 цента')
ok(sent.get('metadata[booking_id]') === BOOKING_ID && sent.get('metadata[kind]') === 'deposit' && sent.get('payment_intent_data[metadata][booking_id]') === BOOKING_ID, 'резервацията е в метаданните (и на сесията, и на плащането)')
ok(sent.get('success_url') === `https://stayfloww.netlify.app/guest/${PROP_ID}?paid=1` && sent.get('cancel_url') === `https://stayfloww.netlify.app/guest/${PROP_ID}`, 'връщане към картата на госта')
ok(sent.get('customer_email') === 'gost@example.com', 'имейлът на госта е попълнен във формата на Stripe')
ok(Number(sent.get('expires_at')) === NOW + 23 * 3600, 'линкът важи 23 часа')
ok(/Капаро — Вила Тихи бряг, 2026-12-10 – 2026-12-13/.test(sent.get('line_items[0][price_data][product_data][name]')), 'заглавие с имот и дати')

// сумата не идва от браузъра
resetState()
r = await createPaymentLink({ ...base, token: 'tok-owner', bookingId: BOOKING_ID, kind: 'balance', amount: 1, cents: 1 })
ok(r.body.amount === 300 && new URLSearchParams(stripeCalls()[0].body).get('line_items[0][price_data][unit_amount]') === '30000', 'подадена от клиента сума се игнорира — смята се от базата')

resetState()
state.bookings[0].guest_email = null
await createPaymentLink({ ...base, token: 'tok-owner', bookingId: BOOKING_ID, kind: 'balance' })
ok(!new URLSearchParams(stripeCalls()[0].body).has('customer_email'), 'без имейл на госта полето не се праща')

resetState()
state.payments = [{ id: 'p0', booking_id: BOOKING_ID, kind: 'deposit', amount: '90.00' }]
r = await createPaymentLink({ ...base, token: 'tok-owner', bookingId: BOOKING_ID, kind: 'deposit' })
ok(r.status === 422 && r.body.reason === 'nothing_due' && stripeCalls().length === 0, 'капарото вече е платено → 422, без заявка към Stripe')
r = await createPaymentLink({ ...base, token: 'tok-owner', bookingId: BOOKING_ID, kind: 'balance' })
ok(r.status === 200 && r.body.amount === 210, 'остатъкът след капарото е 210 €')

resetState()
state.bookings[0].source = 'airbnb'
r = await createPaymentLink({ ...base, token: 'tok-owner', bookingId: BOOKING_ID, kind: 'balance' })
ok(r.status === 422 && r.body.reason === 'platform' && stripeCalls().length === 0, 'Airbnb резервация → 422, без линк')

resetState()
state.stripe = { ok: false, status: 401, json: { error: { message: 'Invalid API Key provided: sk_test_****abcd' } } }
r = await createPaymentLink({ ...base, token: 'tok-owner', bookingId: BOOKING_ID, kind: 'deposit' })
ok(r.status === 502 && /Stripe отказа/.test(r.body.error) && !/sk_test_51/.test(JSON.stringify(r)), 'грешка от Stripe → 502 с кратко съобщение и без ключа')
state.stripe = { ok: true, status: 200, json: { id: 'cs_x' } }
r = await createPaymentLink({ ...base, token: 'tok-owner', bookingId: BOOKING_ID, kind: 'deposit' })
ok(r.status === 502, 'отговор без линк → 502')
const prevFetch = globalThis.fetch
globalThis.fetch = async (url, opts) => {
  if (String(url).startsWith('https://api.stripe.com/')) throw new Error('network')
  return prevFetch(url, opts)
}
r = await createPaymentLink({ ...base, token: 'tok-owner', bookingId: BOOKING_ID, kind: 'deposit' })
ok(r.status === 502 && /връзка/.test(r.body.error), 'няма мрежа до Stripe → 502, не необработена грешка')
globalThis.fetch = prevFetch

/* ---------- webhook ---------- */
const evt = (over = {}, type = 'checkout.session.completed') =>
  JSON.stringify({ id: 'evt_1', type, data: { object: { id: 'cs_1', payment_intent: 'pi_1', payment_status: 'paid', currency: 'eur', amount_total: 9000, metadata: { booking_id: BOOKING_ID, kind: 'deposit' }, ...over } } })
const hook = (raw, over = {}) => handleStripeWebhook({ rawBody: raw, signature: sign(raw, NOW), webhookSecret: SECRET, supabaseUrl: BASE, serviceKey: 'service', nowSec: NOW, ...over })

resetState()
r = await hook(evt(), { webhookSecret: undefined })
ok(r.status === 501, 'webhook без тайна → 501')
r = await hook(evt(), { signature: 't=1,v1=bad' })
ok(r.status === 400 && state.payments.length === 0, 'лош подпис → 400 и нищо не се записва')
r = await hook(evt(), { signature: sign(evt(), NOW - 1000) })
ok(r.status === 400 && state.payments.length === 0, 'стар подпис (повторение на прихванато съобщение) → 400')
r = await hook('not json')
ok(r.status === 400, 'невалиден JSON (с верен подпис) → 400')

resetState()
r = await hook(evt())
ok(r.status === 200 && r.body.recorded && state.payments.length === 1, 'платено → записва се едно плащане', JSON.stringify(r))
eq({ k: state.payments[0].kind, a: state.payments[0].amount, m: state.payments[0].method, ref: state.payments[0].external_ref, b: state.payments[0].booking_id }, { k: 'deposit', a: 90, m: 'stripe', ref: 'pi_1', b: BOOKING_ID }, 'плащане: капаро, 90 €, метод stripe, референция pi_1')
r = await hook(evt())
ok(r.status === 200 && r.body.duplicate && state.payments.length === 1, 'повторна доставка → не се удвоява')
r = await hook(evt({ payment_intent: 'pi_2', amount_total: 21000, metadata: { booking_id: BOOKING_ID, kind: 'balance' } }), {})
ok(state.payments.length === 2 && state.payments[1].kind === 'balance' && state.payments[1].amount === 210, 'второ плащане (остатък) се добавя отделно')
r = await hook(evt({ payment_intent: 'pi_3', amount_total: 1234, metadata: { booking_id: BOOKING_ID, kind: 'нещо друго' } }))
ok(state.payments[2].kind === 'balance' && state.payments[2].amount === 12.34, 'непознат вид се записва като остатък; цент точно (12.34)')
r = await hook(evt({ payment_intent: null, id: 'cs_only' }))
ok(state.payments.at(-1).external_ref === 'cs_only', 'без payment_intent референцията е номерът на сесията')

resetState()
r = await hook(evt({}), {})
r = await hook(evt({ payment_status: 'unpaid', payment_intent: 'pi_u' }))
ok(r.status === 200 && r.body.ignored === 'not_paid' && state.payments.length === 1, 'неплатена сесия (чака банков превод) → игнорира се')
r = await hook(evt({ payment_intent: 'pi_a' }), { rawBody: evt({ payment_intent: 'pi_a' }, 'checkout.session.async_payment_succeeded'), signature: sign(evt({ payment_intent: 'pi_a' }, 'checkout.session.async_payment_succeeded'), NOW) })
ok(state.payments.length === 2, 'async_payment_succeeded също се записва')
const other = evt({}, 'charge.refunded')
r = await hook(other, { signature: sign(other, NOW) })
ok(r.status === 200 && r.body.ignored === 'charge.refunded' && state.payments.length === 2, 'други събития се потвърждават (200), но не променят нищо')
r = await hook(evt({ metadata: {} , payment_intent: 'pi_n'}))
ok(r.status === 200 && r.body.ignored === 'no_booking', 'сесия без резервация (чужда на StayFlow) → 200, игнорира се')
r = await hook(evt({ metadata: { booking_id: 'zzz' }, payment_intent: 'pi_n' }))
ok(r.body.ignored === 'no_booking', 'невалиден идентификатор → игнорира се')
r = await hook(evt({ currency: 'usd', payment_intent: 'pi_usd' }))
ok(r.body.ignored === 'amount' && state.payments.length === 2, 'друга валута → игнорира се (не записваме погрешна сума)')
r = await hook(evt({ amount_total: 0, payment_intent: 'pi_0' }))
ok(r.body.ignored === 'amount', 'нулева сума → игнорира се')
r = await hook(evt({ amount_total: '9000', payment_intent: 'pi_s' }))
ok(r.body.ignored === 'amount', 'сума като текст → игнорира се')
r = await hook(evt({ metadata: { booking_id: '66666666-6666-4666-8666-666666666666', kind: 'deposit' }, payment_intent: 'pi_g' }))
ok(r.status === 200 && r.body.ignored === 'booking_gone' && state.payments.length === 2, 'изтрита резервация → 200 (без безкрайни повторения от Stripe), нищо не се записва')

// грешка при запис → 500, за да опита Stripe пак
resetState()
const f2 = globalThis.fetch
globalThis.fetch = async (url, opts = {}) => (opts.method === 'POST' && String(url).includes('/payments') ? jsonRes(500, {}) : f2(url, opts))
r = await hook(evt())
ok(r.status === 500 && state.payments.length === 0, 'неуспешен запис → 500 (Stripe ще опита пак)')
globalThis.fetch = f2

// едновременни доставки: остава едно плащане
resetState()
state.payments = [
  { id: 'pay-a', booking_id: BOOKING_ID, kind: 'deposit', amount: 90, method: 'stripe', external_ref: 'pi_race', paid_at: '2026-01-01T00:00:00Z' },
]
const f3 = globalThis.fetch
let seen = 0
globalThis.fetch = async (url, opts = {}) => {
  // първата проверка за повторение „не вижда“ реда (двете доставки се разминават по време) — после той се вижда
  if (String(url).includes('/payments?external_ref=') && !opts.method && seen++ === 0) return jsonRes(200, [])
  return f3(url, opts)
}
r = await hook(evt({ payment_intent: 'pi_race' }))
ok(r.status === 200 && state.payments.filter((p) => p.external_ref === 'pi_race').length === 1 && state.payments[0].id === 'pay-a', 'при състезание дубликатът се маха, остава най-старото')
globalThis.fetch = f3

globalThis.fetch = realFetch
console.log(`stripe: ${pass} успешни, ${fail} провалени`)
process.exit(fail ? 1 : 0)
