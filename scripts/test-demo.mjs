// Демо витрина (/demo) — чистата логика (без база): сметката е огледало на quote_stay, данните са пълни и валидни,
// снимките съществуват. node scripts/test-demo.mjs
import { existsSync } from 'node:fs'
import { DEMO_PROPERTIES, findDemo, demoFromPrice, demoQuote, demoBusyNights } from '../src/lib/demoData.js'
import { AMENITIES } from '../src/lib/amenities.js'
import { TOUR, MORE } from '../src/lib/demoTour.js'
import { toDraft as pkgDraft, validatePackage, addDaysISO } from '../src/lib/packageLogic.js'
import { toDraft as seasonDraft, validateSeason } from '../src/lib/seasonLogic.js'

let pass = 0
let fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) pass++
  else {
    fail++
    console.log('  ПРОВАЛ:', name, extra)
  }
}
const eq = (a, b) => Math.abs(Number(a) - b) < 0.005

const TODAY = '2026-10-24' // събота
const NK = findDemo('morski-apartament-dve-terasi')
const SOFIA = findDemo('svetal-apartament-sofia')
const LOFT = findDemo('loft-s-tuhlena-stena-plovdiv')
const q = (d, a, b, g = 2) => demoQuote(d, a, b, g, TODAY)

/* ---------- данни ---------- */
ok('три демо имота с различни адреси', DEMO_PROPERTIES.length === 3 && new Set(DEMO_PROPERTIES.map((d) => d.slug)).size === 3 && NK && SOFIA && LOFT)
ok('findDemo: непознат адрес → null', findDemo('nqma') === null)
const amenityKeys = new Set(AMENITIES.map((a) => a.key))
for (const d of DEMO_PROPERTIES) {
  const p = d.property
  const who = d.slug
  ok(`${who}: име, град, цена, гости, часове, правила`, p.name && p.city && p.base_price > 0 && p.max_guests >= 1 && p.checkin_time && p.checkout_time && typeof p.smoking_allowed === 'boolean' && typeof p.parties_allowed === 'boolean')
  ok(`${who}: описание на български и английски`, p.public_description.length > 60 && p.public_description_en.length > 60)
  ok(`${who}: всички удобства са познати ключове`, p.amenities.length > 0 && p.amenities.every((k) => amenityKeys.has(k)), p.amenities.join(','))
  ok(`${who}: акцентът е валиден цвят`, /^#[0-9a-f]{6}$/i.test(p.accent_color))
  ok(`${who}: снимките и миниатюрите са еднакъв брой и файловете ги има`, p.photos.length === p.photo_thumbs.length && p.photos.length >= 3 && [...p.photos, ...p.photo_thumbs].every((u) => existsSync(`public${u}`)), p.photos.concat(p.photo_thumbs).filter((u) => !existsSync(`public${u}`)).join(','))
  ok(`${who}: корицата е първата снимка`, p.cover_image_url === p.photos[0])
  ok(`${who}: сезоните минават проверката на редактора`, d.seasons.every((s) => validateSeason(seasonDraft(s)) === null), d.seasons.map((s) => validateSeason(seasonDraft(s))).join('|'))
  ok(`${who}: офертите минават проверката на редактора`, d.packages.every((x) => validatePackage(pkgDraft(x)) === null), d.packages.map((x) => validatePackage(pkgDraft(x))).join('|'))
  ok(`${who}: без измислени отзиви и контакти`, !p.reviews && Array.isArray(p.channels) && p.channels.length === 0)
}
ok('„от“ цената: сезонът може да е по-евтин (50), без сезони е основната (118), по-скъп сезон не я вдига (74)', demoFromPrice(NK) === 50 && demoFromPrice(SOFIA) === 118 && demoFromPrice(LOFT) === 74)

/* ---------- „Какво има вътре“ ---------- */
ok('тур: 9 функции с различни ключове', TOUR.length === 9 && new Set(TOUR.map((t) => t.key)).size === 9)
ok('тур: всяка функция има таб, заглавие, увод, 3–4 точки и описание на снимката', TOUR.every((t) => t.tab && t.title && t.lead && t.points.length >= 3 && t.points.length <= 4 && t.alt.length > 15), TOUR.filter((t) => !(t.points.length >= 3 && t.points.length <= 4)).map((t) => t.key).join(','))
ok('тур: снимките за компютър и телефон съществуват за всяка функция', TOUR.every((t) => existsSync(`public/demo/tour/desktop-${t.key}.webp`) && existsSync(`public/demo/tour/phone-${t.key}.webp`)), TOUR.filter((t) => !existsSync(`public/demo/tour/desktop-${t.key}.webp`) || !existsSync(`public/demo/tour/phone-${t.key}.webp`)).map((t) => t.key).join(','))
ok('тур: иконите са познати (lucide)', ['LayoutDashboard', 'CalendarDays', 'ClipboardList', 'TrendingUp', 'House', 'Sparkles', 'FileText', 'Inbox', 'Languages'].length === new Set(TOUR.map((t) => t.icon)).size && TOUR.every((t) => ['LayoutDashboard', 'CalendarDays', 'ClipboardList', 'TrendingUp', 'House', 'Sparkles', 'FileText', 'Inbox', 'Languages'].includes(t.icon)))
ok('„И още“: 6 точки със заглавие и описание', MORE.length === 6 && MORE.every(([t, d]) => t && d.length > 20))

/* ---------- сметка: Неа Каликратия (основна 65; лято 85 мин. 3; зима 50 мин. 2; почистване 25) ---------- */
let r = q(NK, '2027-01-10', '2027-01-13')
ok('зима, 3 нощувки: 3 × 50 = 150, общо 175, капаро 52,50, мин. 2', r && r.nights === 3 && eq(r.accommodation_total, 150) && eq(r.total, 175) && eq(r.deposit, 52.5) && r.min_nights === 2 && r.discount === 0 && r.package_id === null && r.is_available && r.fits_guests)
r = q(NK, '2027-01-20', '2027-01-27')
ok('„6+1“: 7 зимни нощувки 350 → безплатна най-евтината (50), общо 325', eq(r.accommodation_total, 350) && eq(r.discount, 50) && eq(r.total, 325) && r.package_id === 'nk-1')
r = q(NK, '2027-01-05', '2027-02-04')
ok('30 нощувки: „Месец“ −25% (375) бие „6+1“ (50) → общо 1150', eq(r.accommodation_total, 1500) && eq(r.discount, 375) && eq(r.total, 1150) && r.package_id === 'nk-2')
r = q(NK, '2027-07-10', '2027-07-13')
ok('лято, 3 нощувки: 3 × 85 = 255, минимум 3', eq(r.accommodation_total, 255) && r.min_nights === 3 && r.nights === 3)
r = q(NK, '2027-07-10', '2027-07-12')
ok('лято, 2 нощувки: под минимума 3 (страницата показва грешка)', r.nights === 2 && r.min_nights === 3)
r = q(NK, '2027-04-10', '2027-04-12')
ok('извън сезон: основна цена 2 × 65 = 130, минимум по подразбиране 2', eq(r.accommodation_total, 130) && r.min_nights === 2)
r = q(NK, '2027-03-30', '2027-04-02')
ok('през края на зимата: 50 + 50 + 65 = 165', eq(r.accommodation_total, 165))
ok('над максимума гости (5 > 4) → fits_guests false', q(NK, '2027-04-10', '2027-04-12', 5).fits_guests === false)

/* ---------- заети нощи ---------- */
ok('заети нощи на Неа Каликратия: 30.10–01.11, 12–15.11, 04–10.12', JSON.stringify(demoBusyNights(NK, '2026-10-24', '2026-12-31', TODAY)) === JSON.stringify(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-12-04', '2026-12-05', '2026-12-06', '2026-12-07', '2026-12-08', '2026-12-09', '2026-12-10']))
ok('интервалът се подрязва (само 31.10–12.11 → 31.10, 01.11, 12.11)', JSON.stringify(demoBusyNights(NK, '2026-10-31', '2026-11-12', TODAY)) === JSON.stringify(['2026-10-31', '2026-11-01', '2026-11-12']))
ok('пресичане със заето → недостъпно', q(NK, '2026-10-29', '2026-10-31').is_available === false)
ok('свършва в деня на първата заета нощ → свободно', q(NK, '2026-10-28', '2026-10-30').is_available === true)
ok('започва в деня след последната заета → свободно', q(NK, '2026-11-02', '2026-11-04').is_available === true)

/* ---------- София (основна 118, почистване 30, такса 0,50, „Седмица“ −10%, „Ранно записване“ −8% от 30 дни) ---------- */
r = q(SOFIA, addDaysISO(TODAY, 60), addDaysISO(TODAY, 67))
ok('7 нощувки: „Седмица“ −10% (82,60) бие ранното (−8% = 66,08); такса 7 €; капаро 30%', eq(r.accommodation_total, 826) && eq(r.discount, 82.6) && r.package_id === 'sf-1' && eq(r.total, 773.4) && eq(r.tourist_tax, 7) && eq(r.deposit, 232.02))
r = q(SOFIA, addDaysISO(TODAY, 40), addDaysISO(TODAY, 43))
ok('3 нощувки след 40 дни: ранно записване −8% (28,32)', eq(r.discount, 28.32) && r.package_id === 'sf-2' && eq(r.total, 354 - 28.32 + 30))
r = q(SOFIA, addDaysISO(TODAY, 10), addDaysISO(TODAY, 13))
ok('3 нощувки след 10 дни: няма подходяща оферта', r.discount === 0 && r.package_id === null)

/* ---------- Пловдив (основна 74; празници 20.12–05.01 за 99, мин. 3; „Уикенд“ 2 нощувки за 130 от петък; последна минута −15% до 3 дни) ---------- */
r = q(LOFT, '2026-11-06', '2026-11-08') // петък
ok('петък, 2 нощувки: фиксирана цена 130 вместо 148 → общо 150', eq(r.accommodation_total, 148) && eq(r.discount, 18) && r.package_id === 'pl-1' && eq(r.total, 150))
r = q(LOFT, '2026-11-07', '2026-11-09') // събота
ok('събота, 2 нощувки: „Уикенд“ не важи (само от петък)', r.discount === 0)
r = q(LOFT, TODAY, '2026-10-26')
ok('настаняване днес: последна минута −15% (22,20)', eq(r.discount, 22.2) && r.package_id === 'pl-2' && eq(r.total, 148 - 22.2 + 20))
r = q(LOFT, '2026-12-22', '2026-12-25')
ok('празници: 3 × 99 = 297, минимум 3', eq(r.accommodation_total, 297) && r.min_nights === 3)
r = q(LOFT, '2027-01-04', '2027-01-07')
ok('през Нова година: 99 + 99 (до 5.01 вкл. е 04 и 05) + 74', eq(r.accommodation_total, 99 + 99 + 74))

/* ---------- невалидни заявки (както quote_stay не връща ред) ---------- */
ok('вчерашна дата → null', q(NK, '2026-10-23', '2026-10-25') === null)
ok('напускане преди настаняване → null; еднакви дати → null', q(NK, '2027-01-10', '2027-01-09') === null && q(NK, '2027-01-10', '2027-01-10') === null)
ok('0 гости → null', demoQuote(NK, '2027-01-10', '2027-01-13', 0, TODAY) === null)
ok('днес е позволено', q(NK, TODAY, '2026-10-26') !== null)
ok('всички стойности в отговора са числа', Object.entries(q(NK, '2027-01-10', '2027-01-13')).every(([k, v]) => ['is_available', 'fits_guests'].includes(k) ? typeof v === 'boolean' : k === 'package_id' ? v === null || typeof v === 'string' : typeof v === 'number' && Number.isFinite(v)))

console.log(`\n${pass} минали, ${fail} провалени`)
process.exit(fail ? 1 : 0)
