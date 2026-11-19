// Гърция, стъпки 2–4: шаблони за съобщения, такса „Климатична устойчивост“, документи за безопасност, цени по канал.
//   node scripts/test-greece2.mjs
import {
  KINDS, LANGS, TAG_KEYS, DEFAULT_TEMPLATES, EMERGENCY_TEXT, hasEmergencyInfo, guestLanguage, buildContext, renderTemplate,
  templateText, unknownTags, cleanOverrides, setOverride,
} from '../src/lib/messageTemplates.js'
import { CLIMATE_RATES, climateFee, dwellingType } from '../src/lib/climateFee.js'
import { markupFromCommission, priceWithMarkup, netAfterCommission, validMarkup, channelRows } from '../src/lib/channelPricing.js'
import { SAFETY_ITEMS, itemState, summarize, attentionFromSummaries, daysUntil } from '../src/lib/safetyLogic.js'

let pass = 0
let fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) pass++
  else {
    fail++
    console.log('  ПРОВАЛ:', name, extra)
  }
}

/* ---------- шаблони ---------- */
ok('5 вида съобщения на 3 езика — всички шаблони са налични', KINDS.length === 5 && LANGS.length === 3 && KINDS.every((k) => LANGS.every((l) => DEFAULT_TEMPLATES[k][l]?.length > 40)))
ok('всеки шаблон ползва само познати етикети', KINDS.every((k) => LANGS.every((l) => unknownTags(DEFAULT_TEMPLATES[k][l]).length === 0)))
ok('гръцкият и английският шаблон са без кирилица, българският — на кирилица', KINDS.every((k) => !/[Ѐ-ӿ]/.test(DEFAULT_TEMPLATES[k].el) && !/[Ѐ-ӿ]/.test(DEFAULT_TEMPLATES[k].en) && /[Ѐ-ӿ]/.test(DEFAULT_TEMPLATES[k].bg)))
ok('гръцкият е на гръцка азбука', KINDS.every((k) => /[Ͱ-Ͽ]/.test(DEFAULT_TEMPLATES[k].el)))
ok('„Преди пристигане“ съдържа код, Wi-Fi и линк на всички езици', LANGS.every((l) => ['{code}', '{wifi}', '{wifi_password}', '{link}'].every((t) => DEFAULT_TEMPLATES.before_arrival[l].includes(t))))
ok('„Данни за декларацията“ иска паспорт и споменава ΑΦΜ на всички езици', LANGS.every((l) => /ΑΦΜ|AFM/.test(DEFAULT_TEMPLATES.declaration_data[l])))
ok('„Напомняне за плащане“ има {amount}', LANGS.every((l) => DEFAULT_TEMPLATES.payment_reminder[l].includes('{amount}')))

const booking = { guest_name: 'Anna Maria Schmidt', check_in: '2027-04-10', check_out: '2027-04-14' }
const property = { name: 'Вила Елия', address: 'Κασσάνδρα 5', city: 'Халкидики', access_code: '4821', wifi_name: 'Elia', wifi_password: 'sea12345' }
const ctxBg = buildContext({ booking, property, owner: { name: 'Иван' }, balance: 180, link: 'https://x.test/guest/1', lang: 'bg' })
ok('етикети: първото име, дати dd.mm.гггг, нощи на български', ctxBg.name === 'Anna' && ctxBg.checkin === '10.04.2027' && ctxBg.checkout === '14.04.2027' && ctxBg.nights === '4 нощи')
ok('етикети: остатък с € и адрес с град', ctxBg.amount === '180.00 €' && ctxBg.address === 'Κασσάνδρα 5, Халкидики')
ok('нощи на гръцки и английски, 1 нощ в единствено число', buildContext({ booking, lang: 'el' }).nights === '4 διανυκτερεύσεις' && buildContext({ booking, lang: 'en' }).nights === '4 nights' && buildContext({ booking: { ...booking, check_out: '2027-04-11' }, lang: 'bg' }).nights === '1 нощ' && buildContext({ booking: { ...booking, check_out: '2027-04-11' }, lang: 'en' }).nights === '1 night')
ok('липсващите данни стават „—“, не празно', (() => { const c = buildContext({ booking: {}, property: {}, lang: 'bg' }); return c.name === '—' && c.property === '—' && c.checkin === '—' && c.nights === '—' && c.code === '—' && c.amount === '—' && c.address === '—' })())
const out = renderTemplate(DEFAULT_TEMPLATES.before_arrival.bg, ctxBg)
ok('попълване: няма останали {етикети} и няма „undefined“', !/[{}]/.test(out) && !/undefined|null/.test(out), out)
ok('попълване: кодът, Wi-Fi и линкът са в текста', out.includes('4821') && out.includes('sea12345') && out.includes('https://x.test/guest/1') && out.includes('Elia'))
ok('попълване: непознат етикет остава видим', renderTemplate('Здравей {name} {нещо} {foo}', { name: 'A' }) === 'Здравей A {нещо} {foo}')
ok('попълване: празно име на собственик не оставя висящ интервал в края', !renderTemplate(DEFAULT_TEMPLATES.after_stay.bg, buildContext({ booking, property, owner: {}, lang: 'bg' })).endsWith(' '))
ok('гръцкото съобщение се попълва изцяло', !/[{}]/.test(renderTemplate(DEFAULT_TEMPLATES.declaration_data.el, buildContext({ booking, property, lang: 'el' }))))
ok('unknownTags намира грешни етикети', unknownTags('Здравей {name} {nmae} {foo}').join() === 'nmae,foo' && unknownTags('без етикети').length === 0)
ok('всички познати етикети са 12', TAG_KEYS.length === 12 && new Set(TAG_KEYS).size === 12)

ok('език на госта: GR → гръцки, BG → български, друго → английски, без държава → български', guestLanguage('GR') === 'el' && guestLanguage('BG') === 'bg' && guestLanguage('DE') === 'en' && guestLanguage('US') === 'en' && guestLanguage(null) === 'bg' && guestLanguage('') === 'bg')

/* ---------- редакции ---------- */
ok('templateText: без редакция → по подразбиране', templateText('confirm', 'bg') === DEFAULT_TEMPLATES.confirm.bg)
ok('templateText: със собствена редакция → нея', templateText('confirm', 'bg', { confirm: { bg: 'Мой текст {name}' } }) === 'Мой текст {name}')
ok('setOverride: нов текст се записва', setOverride({}, 'confirm', 'bg', 'Мой {name}').confirm.bg === 'Мой {name}')
ok('setOverride: връщане към стандартния или празен текст изтрива редакцията', Object.keys(setOverride({ confirm: { bg: 'x' } }, 'confirm', 'bg', DEFAULT_TEMPLATES.confirm.bg)).length === 0 && Object.keys(setOverride({ confirm: { bg: 'x' } }, 'confirm', 'bg', '   ')).length === 0)
ok('setOverride: пази другите езици на същия вид', (() => { const o = setOverride({ confirm: { bg: 'a', en: 'b' } }, 'confirm', 'bg', DEFAULT_TEMPLATES.confirm.bg); return o.confirm.en === 'b' && !('bg' in o.confirm) })())
ok('setOverride: не променя подадения обект', (() => { const base = { confirm: { bg: 'a' } }; setOverride(base, 'confirm', 'bg', 'b'); return base.confirm.bg === 'a' })())
ok('cleanOverrides: пази само познати видове/езици и разумни низове', (() => { const c = cleanOverrides({ confirm: { bg: 'ok', xx: 'no' }, nope: { bg: 'no' }, after_stay: { en: 123 }, before_arrival: { el: 'x'.repeat(2001) } }); return c.confirm.bg === 'ok' && !('xx' in c.confirm) && !c.nope && !c.after_stay && !c.before_arrival })())
ok('cleanOverrides: боклук вътре → празен обект', Object.keys(cleanOverrides(null)).length === 0 && Object.keys(cleanOverrides('x')).length === 0 && Object.keys(cleanOverrides([1])).length === 0)

ok('текст за спешни случаи: 112 е вътре и се разпознава', hasEmergencyInfo(EMERGENCY_TEXT) && hasEmergencyInfo('Правила… 112 …') && !hasEmergencyInfo('Тишина след 22:00') && !hasEmergencyInfo(null) && !hasEmergencyInfo('телефон 1120'))
ok('текстът за спешни случаи съдържа и 100, 166, 199, 1571', ['100', '166', '199', '1571'].every((n) => EMERGENCY_TEXT.includes(n)))

/* ---------- такса „Климатична устойчивост“ ---------- */
const fee = (ci, co, dwelling) => climateFee({ checkIn: ci, checkOut: co, dwelling })
ok('такса: 5 нощи през юли, обикновено жилище = 5 × 8 = 40', fee('2027-07-10', '2027-07-15').total === 40 && fee('2027-07-10', '2027-07-15').peakNights === 5)
ok('такса: 5 нощи през януари = 5 × 2 = 10', fee('2027-01-10', '2027-01-15').total === 10 && fee('2027-01-10', '2027-01-15').offNights === 5)
ok('такса: къща над 80 м² — 15 € през лятото и 4 € през зимата', fee('2027-07-10', '2027-07-12', 'house').total === 30 && fee('2027-01-10', '2027-01-12', 'house').total === 8)
ok('такса: границата 31.10/01.11 — нощта на 31.10 е сезон (8), на 01.11 е извън (2)', fee('2027-10-31', '2027-11-02').total === 10, JSON.stringify(fee('2027-10-31', '2027-11-02')))
ok('такса: границата 31.03/01.04 — нощта на 31.03 е извън (2), на 01.04 е сезон (8)', fee('2027-03-31', '2027-04-02').total === 10)
ok('такса: престой през Нова година (28.12 → 04.01) = 7 × 2 = 14', fee('2026-12-28', '2027-01-04').total === 14)
ok('такса: не зависи от броя гости (няма такъв параметър) — на жилище, не на човек', climateFee.length === 1)
ok('такса: нощите са колкото дните между датите', fee('2027-04-01', '2027-04-30').nights === 29)
ok('такса: невалидни дати → 0', fee('', '2027-07-15').total === 0 && fee('2027-07-15', '2027-07-15').total === 0 && fee('2027-07-16', '2027-07-15').total === 0)
ok('такса: ставките са тези от източниците', CLIMATE_RATES.standard.peak === 8 && CLIMATE_RATES.standard.off === 2 && CLIMATE_RATES.house.peak === 15 && CLIMATE_RATES.house.off === 4)
ok('такса: собствени ставки се прилагат', climateFee({ checkIn: '2027-07-10', checkOut: '2027-07-12', rates: { standard: { peak: 10, off: 1 } } }).total === 20)
ok('вид жилище: къща над 80 м² е „house“, къща до 80 м², апартамент и липсващи данни — „standard“', dwellingType({ property_type: 'house', area_m2: 94 }) === 'house' && dwellingType({ property_type: 'house', area_m2: 80 }) === 'standard' && dwellingType({ property_type: 'apartment', area_m2: 120 }) === 'standard' && dwellingType({ property_type: 'house' }) === 'standard' && dwellingType(null) === 'standard')

/* ---------- цени по канал ---------- */
ok('надбавка от комисиона: 15% → 17,6%; 10% → 11,1%; 0 → 0; 100 → 0', markupFromCommission(15) === 17.6 && markupFromCommission(10) === 11.1 && markupFromCommission(0) === 0 && markupFromCommission(100) === 0 && markupFromCommission('x') === 0)
ok('цена с надбавка: 100 € + 12% = 112; 87 € + 17,6% = 102; закръглено до цяло', priceWithMarkup(100, 12) === 112 && priceWithMarkup(87, 17.6) === 102 && priceWithMarkup(0, 12) === 0 && priceWithMarkup(100, 0) === 100 && priceWithMarkup(100, 'x') === 100)
ok('предложената надбавка връща почти същата сума след комисионата (100 € → ~100 €)', Math.abs(netAfterCommission(priceWithMarkup(100, markupFromCommission(15)), 15) - 100) < 1)
ok('надбавка: валидна е между 0 и 100, не е празна', validMarkup('12') && validMarkup(0) && validMarkup('100') && !validMarkup('') && !validMarkup('-1') && !validMarkup('101') && !validMarkup('abc'))
const rows = channelRows({ basePrice: 70, seasons: [{ label: '1 юни – 30 септ.', name: 'Лято', price_per_night: 120 }, { label: '1 ноем. – 31 март', name: 'Зима', price_per_night: 60 }], airbnbPct: 12, bookingPct: 15 })
ok('таблица: ред за всеки сезон и един за „останалите дати“ (основна цена)', rows.length === 3 && rows[2].base === true && rows[2].direct === 70)
ok('таблица: директна, Airbnb и Booking по надбавките (120 → 134 / 138)', rows[0].direct === 120 && rows[0].airbnb === 134 && rows[0].booking === 138 && rows[1].airbnb === 67 && rows[1].booking === 69)
ok('таблица: без основна цена няма ред „останалите дати“; без сезони — само основната', channelRows({ basePrice: 0, seasons: [{ label: 'x', price_per_night: 50 }] }).length === 1 && channelRows({ basePrice: 80, seasons: [] }).length === 1)
ok('таблица: надбавка 0 → цената е същата', channelRows({ basePrice: 80, seasons: [] })[0].airbnb === 80)

/* ---------- безопасност ---------- */
const TODAY = '2026-11-20'
ok('6 изисквания: застраховка, електротехник, пожарогасител, дератизация, аптечка, спешни телефони', SAFETY_ITEMS.map((i) => i.key).join() === 'insurance,electrician,fire,pest,first_aid,emergency')
ok('срок имат застраховка, пожарогасител и дератизация', SAFETY_ITEMS.filter((i) => i.expiry).map((i) => i.key).join() === 'insurance,fire,pest')
const def = (k) => SAFETY_ITEMS.find((i) => i.key === k)
ok('липсва ред → missing; „има“ без срок → ok', itemState(def('insurance'), null, TODAY) === 'missing' && itemState(def('first_aid'), { done: true }, TODAY) === 'ok' && itemState(def('first_aid'), { done: false }, TODAY) === 'missing')
ok('срок след повече от 30 дни → ok; точно 30 дни → expiring; вчера → expired; днес → expiring', itemState(def('insurance'), { done: true, expires_on: '2027-01-10' }, TODAY) === 'ok' && itemState(def('insurance'), { done: true, expires_on: '2026-12-20' }, TODAY) === 'expiring' && itemState(def('insurance'), { done: true, expires_on: '2026-11-19' }, TODAY) === 'expired' && itemState(def('insurance'), { done: true, expires_on: '2026-11-20' }, TODAY) === 'expiring')
ok('срок на документ без изискване за срок се игнорира (аптечка)', itemState(def('first_aid'), { done: true, expires_on: '2020-01-01' }, TODAY) === 'ok')
ok('изтекъл, но неотбелязан като наличен → missing, не expired', itemState(def('insurance'), { done: false, expires_on: '2020-01-01' }, TODAY) === 'missing')
ok('спешни телефони: ок, ако правилата съдържат 112, дори без ред', itemState(def('emergency'), null, TODAY, 'Спешни: 112') === 'ok' && itemState(def('emergency'), null, TODAY, 'Тишина') === 'missing' && itemState(def('emergency'), { done: true }, TODAY, '') === 'ok')
const s = summarize([{ item_key: 'insurance', done: true, expires_on: '2026-12-01' }, { item_key: 'fire', done: true, expires_on: '2026-10-01' }, { item_key: 'pest', done: false }, { item_key: 'first_aid', done: true }], TODAY, '')
ok('обобщение: 6 общо; готови = ok + изтичащи (аптечка, застраховка); изтекъл 1; изтичащ 1; липсват 3', s.total === 6 && s.ready === 2 && s.expired === 1 && s.expiring === 1 && s.missing === 3, JSON.stringify({ r: s.ready, e: s.expired, x: s.expiring, m: s.missing }))
ok('обобщение: дните до срока са със знак', s.items[0].days === 11 && s.items[2].days === -50 && s.items[4].days === null)
ok('обобщение: празен списък → всичко липсва', (() => { const e = summarize([], TODAY, ''); return e.ready === 0 && e.missing === 6 })())
ok('обобщение: правилата със 112 броят спешните за готови', summarize([], TODAY, '112').ready === 1)
const att = attentionFromSummaries([s, summarize([{ item_key: 'insurance', done: true, expires_on: '2026-11-25' }], TODAY, '')])
ok('таблото: сборът изтекли/изтичащи от няколко имота', att.safetyExpired === 1 && att.safetyExpiring === 2, JSON.stringify(att))
ok('daysUntil е със знак', daysUntil('2026-11-25', TODAY) === 5 && daysUntil('2026-11-15', TODAY) === -5)

console.log(`test-greece2: ${pass} успешни, ${fail} провалени`)
process.exit(fail ? 1 : 0)
