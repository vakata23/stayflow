// Логика на платения достъп без браузър: пакети, цени, състояние на достъпа, удължаване, заявка, калкулатор.
//   node scripts/test-access.mjs
import {
  PLANS, yearlyPrice, planForBand, addMonthsIso, daysBetween, extendUntil, accessState, validateAccessRequest,
  requestErrorMessage, commissionCost, todayIso, paysForItself, BANDS, TRIAL_DAYS, addDaysIso, trialUntil,
} from '../src/lib/accessLogic.js'

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

/* пакети (vkcompany.site/produkti) */
eq([PLANS.start.monthly, PLANS.plus.monthly, PLANS.pro.monthly], [9, 19, 39], 'цени 9 / 19 / 39 € на месец')
eq([PLANS.start.properties, PLANS.plus.properties, PLANS.pro.properties], [3, 10, 30], 'до 3 / 10 / 30 имота')
eq([PLANS.start.users, PLANS.plus.users, PLANS.pro.users], [1, 3, 10], 'до 1 / 3 / 10 потребители')
eq([yearlyPrice('start'), yearlyPrice('plus'), yearlyPrice('pro')], [90, 190, 390], 'година = 10 месеца (2 безплатни)')
eq(planForBand('1-3'), 'start', '1–3 имота → Старт')
eq(planForBand('4-10'), 'plus', '4–10 → Плюс')
eq(planForBand('11-30'), 'pro', '11–30 → Про')
eq(planForBand('31+'), null, 'над 30 → по оферта')
eq(planForBand('x'), null, 'непознато → null')
eq(BANDS.length, 4, '4 диапазона')

/* дати */
eq(addMonthsIso('2026-01-31', 1), '2026-02-28', '31 яну + 1 мес = 28 фев')
eq(addMonthsIso('2024-01-31', 1), '2024-02-29', 'високосна година')
eq(addMonthsIso('2026-11-15', 1), '2026-12-15', 'обикновен месец')
eq(addMonthsIso('2026-12-15', 1), '2027-01-15', 'преминаване през Нова година')
eq(addMonthsIso('2026-03-31', -1), '2026-02-28', 'назад')
eq(addMonthsIso('2026-11-15', 12), '2027-11-15', '12 месеца')
eq(daysBetween('2026-11-15', '2026-11-22'), 7, '7 дни')
eq(daysBetween('2026-11-15', '2026-11-14'), -1, 'минал ден')
eq(daysBetween('2026-12-30', '2027-01-02'), 3, 'през Нова година')
ok(/^\d{4}-\d{2}-\d{2}$/.test(todayIso()), 'todayIso формат')
eq(todayIso(new Date('2026-11-14T22:30:00Z')), '2026-11-15', 'България: 22:30 UTC вече е следващият ден')

/* удължаване */
eq(extendUntil('2026-12-01', '2026-11-15'), '2027-01-01', 'активен: от крайната дата')
eq(extendUntil('2026-11-01', '2026-11-15'), '2026-12-15', 'изтекъл: от днес')
eq(extendUntil(null, '2026-11-15'), '2026-12-15', 'без дата: от днес')
eq(extendUntil('2026-11-15', '2026-11-15', 12), '2027-11-15', 'година')

/* състояние */
const T = '2026-11-15'
eq(accessState(null, T), { state: 'active', daysLeft: null, expiresSoon: false, trial: false }, 'без запис → активен (съществуващ акаунт)')
eq(accessState({ status: 'pending' }, T).state, 'pending', 'pending')
eq(accessState({ status: 'suspended', active_until: '2099-01-01' }, T).state, 'suspended', 'спрян печели над датата')
eq(accessState({ status: 'active', active_until: null }, T), { state: 'active', daysLeft: null, expiresSoon: false, trial: false }, 'активен без срок')
eq(accessState({ status: 'active', active_until: '2026-12-31' }, T), { state: 'active', daysLeft: 46, expiresSoon: false, trial: false }, 'активен, 46 дни')
eq(accessState({ status: 'active', active_until: '2026-11-20' }, T), { state: 'active', daysLeft: 5, expiresSoon: true, trial: false }, 'изтича скоро (≤7 дни)')
eq(accessState({ status: 'active', active_until: '2026-11-22' }, T).expiresSoon, true, 'точно 7 дни е „скоро“')
eq(accessState({ status: 'active', active_until: '2026-11-23' }, T).expiresSoon, false, '8 дни не е „скоро“')
eq(accessState({ status: 'active', active_until: '2026-11-15' }, T).state, 'active', 'последният ден още е активен')
eq(accessState({ status: 'active', active_until: '2026-11-14' }, T).state, 'expired', 'вчера = изтекъл')

/* пробен период */
eq(TRIAL_DAYS, 7, 'проба = 7 дни')
eq(addDaysIso('2026-11-15', 7), '2026-11-22', '+7 дни')
eq(addDaysIso('2026-12-28', 7), '2027-01-04', '+7 дни през Нова година')
eq(addDaysIso('2026-02-25', 7), '2026-03-04', '+7 дни през февруари')
eq(trialUntil('2026-11-15'), '2026-11-22', 'проба от днес до +7')
eq(accessState({ status: 'active', active_until: '2026-11-22', is_trial: true }, T), { state: 'active', daysLeft: 7, expiresSoon: true, trial: true }, 'проба, 7 дни: лентата се показва от първия ден')
eq(accessState({ status: 'active', active_until: '2026-11-22', is_trial: false }, T).expiresSoon, true, 'платен, 7 дни: лента (≤7)')
eq(accessState({ status: 'active', active_until: '2026-11-30', is_trial: true }, T).expiresSoon, true, 'проба винаги показва лента')
eq(accessState({ status: 'active', active_until: '2026-11-14', is_trial: true }, T), { state: 'expired', daysLeft: -1, expiresSoon: false, trial: true }, 'пробата изтече → expired + trial')
eq(accessState({ status: 'pending', is_trial: false }, T).trial, false, 'pending не е проба')

/* заявка */
let r = validateAccessRequest({ name: '  Мария   Петрова ', phone: ' +359  888 123 456 ', email: '', band: '4-10', consent: true })
eq(r.errors, {}, 'добра заявка')
eq(r.values, { name: 'Мария Петрова', phone: '+359 888 123 456', email: null, band: '4-10', plan: null, note: null }, 'стойности: подрязани, празното → null')
r = validateAccessRequest({ name: 'Иван', phone: '', email: 'IVAN@Example.BG', consent: true, plan: 'plus', note: ' здравейте ' })
eq(r.values.email, 'ivan@example.bg', 'имейлът в малки букви')
eq([r.values.plan, r.values.note], ['plus', 'здравейте'], 'пакет и бележка')
ok(validateAccessRequest({ name: 'Иван', consent: true }).errors.contact, 'без телефон и имейл → грешка')
ok(validateAccessRequest({ name: 'И', phone: '0888123456', consent: true }).errors.name, 'твърде кратко име')
ok(validateAccessRequest({ name: 'Иван', phone: 'abc', consent: true }).errors.phone, 'телефон с букви')
ok(validateAccessRequest({ name: 'Иван', phone: '12345', consent: true }).errors.phone, 'телефон под 6 цифри')
ok(validateAccessRequest({ name: 'Иван', email: 'ivan@', consent: true }).errors.email, 'лош имейл')
ok(validateAccessRequest({ name: 'Иван', phone: '0888123456' }).errors.consent, 'без съгласие → грешка')
ok(validateAccessRequest({ name: 'Иван', phone: '0888123456', consent: true, note: 'x'.repeat(501) }).errors.note, 'дълга бележка')
eq(validateAccessRequest({ name: 'Иван', phone: '0888123456', consent: true, band: 'zzz' }).values.band, null, 'непознат диапазон → null')
eq(Object.keys(validateAccessRequest({}).errors).sort(), ['consent', 'contact', 'name'], 'празна заявка: име, контакт, съгласие')
ok(/Viber/.test(requestErrorMessage('too_many')), 'too_many → Viber')
ok(requestErrorMessage('boom').length > 10, 'непозната грешка → общо съобщение')

/* калкулатор */
eq(commissionCost({ nights: 18, price: 70, percent: 15 }), { month: 189, year: 2268 }, '18 нощи × 70 € × 15% = 189 € / 2268 €')
eq(commissionCost({ nights: 0, price: 70, percent: 15 }), { month: 0, year: 0 }, '0 нощи')
eq(commissionCost({ nights: 32, price: 70, percent: 15 }), null, 'над 31 нощи → невалидно')
eq(commissionCost({ nights: 10, price: -1, percent: 15 }), null, 'отрицателна цена')
eq(commissionCost({ nights: 10, price: 70, percent: 41 }), null, 'комисиона над 40%')
eq(commissionCost({ nights: 'x', price: 70, percent: 15 }), null, 'не е число')
eq(paysForItself('start', 2268), true, 'Старт (108 €/год.) се връща от 2268 €')
eq(paysForItself('pro', 100), false, 'Про не се връща от 100 €')

console.log(`\naccess: ${pass} успешни, ${fail} провалени`)
process.exit(fail ? 1 : 0)
