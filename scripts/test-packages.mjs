// Пакети и оферти — чистата логика (без база): същите случаи и числа като SQL тестовете за quote_stay (015),
// проверка на формата, описания, пример за собственика. node scripts/test-packages.mjs
import {
  PACKAGE_KINDS, PACKAGE_PRESETS, emptyPackage, toDraft, toPayload, samePackage, validatePackage, appliesOnDate, packageSaving,
  bestPackage, examplePackage, describePackage, daysBetween, addDaysISO, isoWeekday,
} from '../src/lib/packageLogic.js'

let pass = 0
let fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) pass++
  else {
    fail++
    console.log('  ПРОВАЛ:', name, extra)
  }
}

const TODAY = '2026-10-24'
const nightly = (n, price = 100) => Array(n).fill(price)
const pk = (kind, extra = {}) => ({ ...emptyPackage(), kind, ...extra })
const ctx = (prices, inDays = 60) => ({ prices, checkIn: addDaysISO(TODAY, inDays), today: TODAY })
const six1 = pk('free_nights', { paid_nights: 6, free_nights: 1 })

/* ---------- „6+1“ ---------- */
ok('6+1: 7 нощувки по 100 → 1 безплатна = 100', packageSaving(six1, ctx(nightly(7))) === 100)
ok('6+1: 6 нощувки още не стигат → 0', packageSaving(six1, ctx(nightly(6))) === 0)
ok('6+1 без повторение: 8 и 14 нощувки → пак 1 безплатна', packageSaving(six1, ctx(nightly(8))) === 100 && packageSaving(six1, ctx(nightly(14))) === 100)
const rep = { ...six1, repeat_block: true }
ok('6+1 с повторение: 14 нощувки → 2 безплатни = 200; 13 → 1', packageSaving(rep, ctx(nightly(14))) === 200 && packageSaving(rep, ctx(nightly(13))) === 100)
ok('безплатната е най-евтината: 6 × 150 и 1 × 100 → отстъпка 100, не 150', packageSaving(six1, ctx([150, 150, 150, 150, 150, 150, 100])) === 100)
ok('безплатната е най-евтината и когато е в началото', packageSaving(six1, ctx([100, 150, 150, 150, 150, 150, 150])) === 100)
ok('„6+1“ в 2 нощувки (1+1): 1 безплатна от най-евтината', packageSaving(pk('free_nights', { paid_nights: 1, free_nights: 1 }), ctx([80, 120])) === 80)

/* ---------- отстъпка за по-дълъг престой ---------- */
const week = pk('percent_off', { min_nights: 7, percent: 10 })
ok('седмица −10%: 7 нощувки → 70; 6 → 0; 30 → 300', packageSaving(week, ctx(nightly(7))) === 70 && packageSaving(week, ctx(nightly(6))) === 0 && packageSaving(week, ctx(nightly(30))) === 300)
ok('процент с стотинки: 14.29% от 700 = 100.03', packageSaving(pk('percent_off', { min_nights: 7, percent: '14.29' }), ctx(nightly(7))) === 100.03)
ok('максимална отстъпка 90%: 200 → 180', packageSaving(pk('percent_off', { min_nights: 1, percent: 90 }), ctx(nightly(2))) === 180)

/* ---------- фиксирана цена ---------- */
const fix3 = pk('fixed_price', { fixed_nights: 3, fixed_total: 250 })
ok('3 нощувки за 250 при 300 → отстъпка 50', packageSaving(fix3, ctx(nightly(3))) === 50)
ok('важи само за точно 3 нощувки (4 → 0)', packageSaving(fix3, ctx(nightly(4))) === 0)
ok('цена, която не е по-ниска от сметката (300 при 300), не е отстъпка', packageSaving(pk('fixed_price', { fixed_nights: 3, fixed_total: 300 }), ctx(nightly(3))) === 0)
const checkIn60 = addDaysISO(TODAY, 60)
const wd60 = isoWeekday(checkIn60)
const fixWd = pk('fixed_price', { fixed_nights: 2, fixed_total: 150, checkin_weekday: String(wd60) })
ok('настаняване в определен ден: правилният ден важи, следващият — не', packageSaving(fixWd, ctx(nightly(2), 60)) === 50 && packageSaving(fixWd, ctx(nightly(2), 61)) === 0)

/* ---------- ранно записване и последна минута (граници) ---------- */
const early = pk('early_bird', { days_before: 30, percent: 20 })
ok('ранно записване −20% (≥ 30 дни): 40 дни → 40; точно 30 → 40; 29 → 0', packageSaving(early, ctx(nightly(2), 40)) === 40 && packageSaving(early, ctx(nightly(2), 30)) === 40 && packageSaving(early, ctx(nightly(2), 29)) === 0)
const last = pk('last_minute', { days_before: 3, percent: 15 })
ok('последна минута −15% (≤ 3 дни): днес → 30; след 3 дни → 30; след 4 → 0', packageSaving(last, ctx(nightly(2), 0)) === 30 && packageSaving(last, ctx(nightly(2), 3)) === 30 && packageSaving(last, ctx(nightly(2), 4)) === 0)

/* ---------- най-изгодната и равенство ---------- */
const a = { ...six1, created_at: '2026-01-01', id: 'a' }
const b = { ...pk('percent_off', { min_nights: 7, percent: 20 }), created_at: '2026-01-02', id: 'b' }
ok('две подходящи: печели −20% (140), не 6+1 (100)', bestPackage([a, b], ctx(nightly(7)))?.pkg.id === 'b' && bestPackage([a, b], ctx(nightly(7)))?.saving === 140)
const c = { ...pk('fixed_price', { fixed_nights: 7, fixed_total: 600 }), created_at: '2026-01-03', id: 'c' }
ok('равни отстъпки (100 и 100): печели по-рано създаденият', bestPackage([c, a], ctx(nightly(7)))?.pkg.id === 'a' && bestPackage([a, c], ctx(nightly(7)))?.pkg.id === 'a')
ok('без подходяща оферта → null', bestPackage([a, b], ctx(nightly(3))) === null && bestPackage([], ctx(nightly(7))) === null)

/* ---------- период и изключване ---------- */
const win = pk('percent_off', { min_nights: 2, percent: 10, valid_from: addDaysISO(TODAY, 100), valid_to: addDaysISO(TODAY, 110) })
ok('период: вътре важи, преди и след — не; последният ден важи (по датата на настаняване)', packageSaving(win, ctx(nightly(2), 105)) === 20 && packageSaving(win, ctx(nightly(2), 99)) === 0 && packageSaving(win, ctx(nightly(2), 111)) === 0 && packageSaving(win, ctx(nightly(2), 110)) === 20)
ok('изключена оферта не важи', packageSaving({ ...week, is_active: false }, ctx(nightly(7))) === 0 && !appliesOnDate({ ...week, is_active: false }, '2027-01-01'))

/* ---------- проверка на формата ---------- */
ok('всички образци са валидни', PACKAGE_PRESETS.every((p) => validatePackage(emptyPackage(p.key)) === null))
ok('образците са 5 и покриват 4 от видовете', PACKAGE_PRESETS.length === 5 && new Set(PACKAGE_PRESETS.map((p) => p.kind)).size === 4)
ok('видовете са 5', PACKAGE_KINDS.length === 5)
ok('„6+1“ с 0 платени нощувки → грешка', /Платените/.test(validatePackage({ ...six1, paid_nights: 0 }) ?? ''))
ok('„6+1“ без безплатни нощувки → грешка', /Безплатните/.test(validatePackage({ ...six1, free_nights: '' }) ?? ''))
ok('отстъпка 0 или над 90 → грешка', validatePackage({ ...week, percent: 0 }) !== null && validatePackage({ ...week, percent: 95 }) !== null && validatePackage({ ...week, percent: 90 }) === null)
ok('фиксирана цена без сума → грешка', /обща цена/.test(validatePackage({ ...fix3, fixed_total: '' }) ?? ''))
ok('ранно записване с 0 дни → грешка; последна минута с 0 дни е позволена', validatePackage({ ...early, days_before: 0 }) !== null && validatePackage({ ...last, days_before: 0 }) === null)
ok('период с край преди началото → грешка', /Краят/.test(validatePackage({ ...week, valid_from: '2027-02-01', valid_to: '2027-01-01' }) ?? ''))
ok('име над 60 знака → грешка', validatePackage({ ...week, name: 'я'.repeat(61) }) !== null)
ok('непознат вид → грешка', validatePackage({ ...week, kind: 'нещо' }) !== null)

/* ---------- чернова ↔ база ---------- */
const payload = toPayload({ ...six1, name: '  6+1  ', repeat_block: true, valid_from: '', valid_to: '2027-01-01' }, 'p1')
ok('toPayload „6+1“: само полетата на вида, името подрязано, празният период → null', payload.kind === 'free_nights' && payload.paid_nights === 6 && payload.free_nights === 1 && payload.repeat_block === true && payload.min_nights === null && payload.percent === null && payload.name === '6+1' && payload.valid_from === null && payload.valid_to === '2027-01-01' && payload.property_id === 'p1')
const payloadFix = toPayload({ ...fix3, checkin_weekday: '5' }, 'p1')
ok('toPayload фиксирана цена: нощувки, сума и ден от седмицата; repeat_block е false', payloadFix.fixed_nights === 3 && payloadFix.fixed_total === 250 && payloadFix.checkin_weekday === 5 && payloadFix.repeat_block === false && payloadFix.paid_nights === null)
ok('toPayload: „всеки ден“ → checkin_weekday null', toPayload({ ...fix3, checkin_weekday: '' }, 'p1').checkin_weekday === null)
const row = { id: 'x1', kind: 'percent_off', name: null, is_active: true, min_nights: 7, percent: '10.00', paid_nights: null, free_nights: null, repeat_block: false, fixed_nights: null, fixed_total: null, checkin_weekday: null, days_before: null, valid_from: null, valid_to: '2027-03-01', created_at: '2026-01-01T00:00:00Z' }
const draft = toDraft(row)
ok('toDraft: числата са низове за полетата, празните — разумни стойности за другите видове', draft.percent === '10' && draft.min_nights === '7' && draft.name === '' && draft.valid_to === '2027-03-01' && draft.paid_nights === '6' && draft.id === 'x1')
ok('toDraft → toPayload връща същото като в базата за вида', (() => { const p = toPayload(draft, 'p1'); return p.kind === 'percent_off' && p.min_nights === 7 && p.percent === 10 && p.paid_nights === null && p.valid_to === '2027-03-01' })())
ok('samePackage: същото съдържание (низове/числа, ключ, дата) → да; друга цена → не', samePackage(draft, { ...draft, key: 'z', created_at: 'q', percent: '10.0' }) && !samePackage(draft, { ...draft, percent: '12' }) && !samePackage(draft, { ...draft, is_active: false }))
ok('samePackage: променено поле на друг вид не брои (min_nights при „6+1“)', samePackage(six1, { ...six1, min_nights: 99, percent: 5 }) && !samePackage(six1, { ...six1, free_nights: 2 }))

/* ---------- пример за собственика ---------- */
const ex = examplePackage(six1, 80)
ok('пример „6+1“ при 80 €: 7 нощувки, 560 → плащате 480', ex && ex.nights === 7 && ex.full === 560 && ex.pay === 480 && ex.saving === 80)
const exWeek = examplePackage(week, 100)
ok('пример седмица −10% при 100 €: 7 нощувки, 700 → 630', exWeek && exWeek.nights === 7 && exWeek.pay === 630)
const exEarly = examplePackage(early, 100)
ok('пример ранно записване (7 нощувки, 30 дни по-рано) −20%: 700 → 560', exEarly && exEarly.nights === 7 && exEarly.pay === 560)
const exLast = examplePackage(last, 100)
ok('пример последна минута −15%: 700 → 595', exLast && exLast.pay === 595)
const exFix = examplePackage(fixWd, 100)
ok('пример фиксирана цена с ден от седмицата (2 нощувки за 150 при 100 €): 200 → 150', exFix && exFix.nights === 2 && exFix.pay === 150)
ok('пример без цена → null; пример без отстъпка (фиксирана 300 при 100 € × 3) → null', examplePackage(six1, 0) === null && examplePackage(pk('fixed_price', { fixed_nights: 3, fixed_total: 300 }), 100) === null)
ok('примерът не гледа периода на важене', examplePackage(win, 100)?.pay === 180)

/* ---------- описания ---------- */
ok('описание „6+1“: „Платете 6 нощувки, останете 7 нощувки“', describePackage(six1).main === 'Платете 6 нощувки, останете 7 нощувки' && describePackage(rep).extra.join() === 'за всеки пълен блок')
ok('описание: единствено число (1+1: „Платете 1 нощувка, останете 2 нощувки“)', describePackage(pk('free_nights', { paid_nights: 1, free_nights: 1 })).main === 'Платете 1 нощувка, останете 2 нощувки')
ok('описание отстъпка: „−10% при престой от 7 нощувки нагоре“', describePackage(week).main === '−10% при престой от 7 нощувки нагоре')
ok('описание фиксирана цена: „3 нощувки за 250 €“; с ден: „настаняване в петък“', describePackage(fix3).main === '3 нощувки за 250 €' && describePackage({ ...fix3, checkin_weekday: '5' }).extra.join() === 'настаняване в петък', describePackage({ ...fix3, checkin_weekday: '5' }).extra.join())
ok('описание ранно записване: „−20% при резервация поне 30 дни по-рано“; 1 ден — „ден“', describePackage(early).main === '−20% при резервация поне 30 дни по-рано' && describePackage({ ...early, days_before: 1 }).main === '−20% при резервация поне 1 ден по-рано')
ok('описание последна минута: „… до 3 дни от днес“ и „… днес“', describePackage(last).main === '−15% при настаняване до 3 дни от днес' && describePackage({ ...last, days_before: 0 }).main === '−15% при настаняване днес')
ok('описание с процент със стотинки: „−12.5%“', describePackage({ ...week, percent: '12.5' }).main.startsWith('−12.5%'))

/* ---------- дати ---------- */
ok('daysBetween/addDaysISO/isoWeekday', daysBetween('2026-10-24', '2026-11-23') === 30 && addDaysISO('2026-12-30', 3) === '2027-01-02' && isoWeekday('2026-10-24') === 6 && isoWeekday('2026-10-25') === 7 && isoWeekday('2026-10-26') === 1)

console.log(`test-packages: ${pass} успешни, ${fail} провалени`)
process.exit(fail ? 1 : 0)
