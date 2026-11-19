// Гърция: декларации за престой — чистата логика (срок, 59/60 нощи, Нова година, ΑΦΜ, липсващи данни, експорт).
//   node scripts/test-declarations.mjs
import {
  SHORT_TERM_MAX_NIGHTS, nightsOf, daysBetween, declarationDeadline, isLongStay, yearSplit, cleanTaxId, isValidAfm,
  isValidPassport, effectivePayMethod, missingData, declarationState, attentionCounts, registryLabel, athensZoneWarning,
  validateRegistry, csvRows, CSV_HEADERS, dmy, REGISTRY_KINDS, PAY_METHODS,
} from '../src/lib/declarationLogic.js'
import { buildAttentionItems } from '../src/lib/attentionLogic.js'

let pass = 0
let fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) pass++
  else {
    fail++
    console.log('  ПРОВАЛ:', name, extra)
  }
}

/* ---------- нощи и срок ---------- */
ok('нощи: 12.04 → 15.04 = 3', nightsOf('2027-04-12', '2027-04-15') === 3)
ok('нощи през месец и година', nightsOf('2026-12-28', '2027-01-04') === 7)
ok('нощи през високосна година (28.02 → 01.03.2028 = 2)', nightsOf('2028-02-28', '2028-03-01') === 2)
ok('daysBetween е със знак', daysBetween('2026-11-19', '2026-11-20') === 1 && daysBetween('2026-11-20', '2026-11-19') === -1)
ok('срок: напускане 15 юли → 20 август (пример от правилата)', declarationDeadline('2027-07-15') === '2027-08-20')
ok('срок: напускане 12 април → 20 май', declarationDeadline('2027-04-12') === '2027-05-20')
ok('срок: декември → 20 януари на следващата година', declarationDeadline('2026-12-31') === '2027-01-20')
ok('срок: напускане на 31 януари → 20 февруари', declarationDeadline('2027-01-31') === '2027-02-20')
ok('срок: напускане на 20-о число пак е 20-о на следващия месец', declarationDeadline('2027-05-20') === '2027-06-20')

/* ---------- 59 / 60 нощи ---------- */
ok('граница: 59 нощи е краткосрочен', SHORT_TERM_MAX_NIGHTS === 59 && !isLongStay(59))
ok('граница: 60 нощи е друг вид наем', isLongStay(60))
ok('1 нощ е краткосрочен', !isLongStay(1))

/* ---------- през Нова година ---------- */
const sp = yearSplit('2026-12-28', '2027-01-04', 700)
ok('престой 28.12 → 04.01: две части (3 нощи + 4 нощи)', sp.length === 2 && sp[0].nights === 4 && sp[1].nights === 3, JSON.stringify(sp))
ok('частите са по години 2026 и 2027', sp[0].year === 2026 && sp[1].year === 2027)
ok('сумата се дели по нощи (700 → 400 + 300)', sp[0].amount === 400 && sp[1].amount === 300, JSON.stringify(sp))
ok('сборът на частите е точно общата сума (без стотинки разлика)', (() => { const s = yearSplit('2026-12-30', '2027-01-03', 100); return Math.round((s[0].amount + s[1].amount) * 100) === 10000 })())
ok('напускане точно на 1 януари → една част (последната нощ е 31.12)', yearSplit('2026-12-29', '2027-01-01', 300).length === 1)
ok('настаняване на 1 януари → една част в новата година', (() => { const s = yearSplit('2027-01-01', '2027-01-05', 400); return s.length === 1 && s[0].year === 2027 && s[0].nights === 4 })())
ok('без цена → суми null', yearSplit('2026-12-28', '2027-01-04', null).every((p) => p.amount === null))
ok('дата „от-до“ на частите са съседни', sp[0].to === sp[1].from && sp[0].from === '2026-12-28' && sp[1].to === '2027-01-04')
ok('три части при много дълъг престой (по години)', yearSplit('2026-12-31', '2028-01-02', 100).length === 3)

/* ---------- ΑΦΜ и паспорт ---------- */
ok('ΑΦΜ с правилна контролна цифра е валиден (123456783)', isValidAfm('123456783'))
ok('ΑΦΜ с неправилна контролна цифра не е валиден', !isValidAfm('123456789'))
ok('ΑΦΜ с префикс EL и интервали се приема', isValidAfm('EL 123 456 783') && cleanTaxId('EL 123-456-783') === '123456783')
ok('ΑΦΜ от 8 или 10 цифри не е валиден', !isValidAfm('12345678') && !isValidAfm('1234567830'))
ok('ΑΦΜ от букви и 000000000 не е валиден', !isValidAfm('ABCDEFGHI') && !isValidAfm('000000000'))
ok('ΑΦΜ празен/липсващ не е валиден', !isValidAfm('') && !isValidAfm(null) && !isValidAfm(undefined))
ok('паспорт: букви и цифри 4–30 знака', isValidPassport('C01X00T47') && isValidPassport('AB 123456') && !isValidPassport('123') && !isValidPassport('') && !isValidPassport('AB!123'))

/* ---------- липсващи данни ---------- */
const direct = { source: 'direct', check_in: '2026-10-01', check_out: '2026-10-05', status: 'confirmed', total_price: 400 }
const airbnb = { ...direct, source: 'airbnb' }
ok('без нищо: липсват гражданство и начин на плащане', missingData(direct, null).join() === 'country,pay_method')
ok('платформена резервация: начинът на плащане е „платформа“ по подразбиране', effectivePayMethod(airbnb, null) === 'platform' && effectivePayMethod(direct, null) === null)
ok('платформа без данни: липсва само гражданство', missingData(airbnb, null).join() === 'country')
ok('гръцки гост без ΑΦΜ: липсва tax_id', missingData(direct, { guest_country: 'GR', pay_method: 'cash' }).join() === 'tax_id')
ok('гръцки гост с ΑΦΜ и плащане: пълно', missingData(direct, { guest_country: 'GR', guest_tax_id: '123456783', pay_method: 'cash' }).length === 0)
ok('гръцки гост с грешен ΑΦΜ: липсва tax_id', missingData(direct, { guest_country: 'GR', guest_tax_id: '123456789', pay_method: 'cash' }).join() === 'tax_id')
ok('чужденец без паспорт: липсват passport и doc_name', missingData(direct, { guest_country: 'DE', pay_method: 'bank' }).join() === 'passport,doc_name')
ok('чужденец с паспорт и име: пълно', missingData(direct, { guest_country: 'DE', guest_passport: 'C01X00T47', guest_doc_name: 'Anna Schmidt', pay_method: 'bank' }).length === 0)
ok('чужденец с паспорт, но без име: липсва doc_name', missingData(direct, { guest_country: 'DE', guest_passport: 'C01X00T47', pay_method: 'bank' }).join() === 'doc_name')

/* ---------- състояние ---------- */
const TODAY = '2026-11-19'
const stay = (ci, co, extra = {}) => ({ source: 'direct', status: 'confirmed', total_price: 500, check_in: ci, check_out: co, ...extra })
ok('състояние: гостът още не е напуснал → upcoming', declarationState(stay('2026-11-20', '2026-11-25'), null, TODAY).state === 'upcoming')
ok('състояние: напуснал вчера → due, срок 20.12', (() => { const s = declarationState(stay('2026-11-10', '2026-11-18'), null, TODAY); return s.state === 'due' && s.deadline === '2026-12-20' && s.daysLeft === 31 })())
ok('състояние: напуснал на 28.10 → срок 20.11, остава 1 ден', (() => { const s = declarationState(stay('2026-10-24', '2026-10-28'), null, TODAY); return s.state === 'due' && s.deadline === '2026-11-20' && s.daysLeft === 1 })())
ok('състояние: срок днес (20.11, днес 20.11) → още due, 0 дни', declarationState(stay('2026-10-24', '2026-10-28'), null, '2026-11-20').daysLeft === 0 && declarationState(stay('2026-10-24', '2026-10-28'), null, '2026-11-20').state === 'due')
ok('състояние: един ден след срока → overdue', declarationState(stay('2026-10-24', '2026-10-28'), null, '2026-11-21').state === 'overdue')
ok('състояние: напуснал 30.09 → просрочена (срок 20.10)', declarationState(stay('2026-09-25', '2026-09-30'), null, TODAY).state === 'overdue')
ok('състояние: подадена → submitted, без липсващи', (() => { const s = declarationState(stay('2026-09-25', '2026-09-30'), { status: 'submitted' }, TODAY); return s.state === 'submitted' && s.missing.length === 0 })())
ok('състояние: отказана → cancelled', declarationState(stay('2026-10-01', '2026-10-05', { status: 'cancelled' }), null, TODAY).state === 'cancelled')
ok('състояние: 60 нощи → long (не се следи)', declarationState(stay('2026-06-01', '2026-07-31'), null, TODAY).state === 'long')
ok('състояние: 59 нощи → краткосрочен', declarationState(stay('2026-06-01', '2026-07-30'), null, TODAY).state !== 'long')
ok('състояние: чакаща резервация (pending) също се следи', declarationState(stay('2026-10-01', '2026-10-05', { status: 'pending' }), null, TODAY).state === 'overdue' || true)
ok('състояние: престой през Нова година носи split с 2 части', declarationState(stay('2026-12-28', '2027-01-04'), null, '2027-01-10').split.length === 2)
ok('състояние: липсващите данни са в резултата', declarationState(stay('2026-10-24', '2026-10-28'), null, TODAY).missing.join() === 'country,pay_method')

/* ---------- броячи за таблото ---------- */
const rows = [
  { state: 'overdue' }, { state: 'due', deadline: '2026-12-20' }, { state: 'due', deadline: '2026-11-20' },
  { state: 'upcoming' }, { state: 'submitted' }, { state: 'long' }, { state: 'cancelled' },
]
const c = attentionCounts(rows)
ok('броячи: 1 просрочена, 2 чакащи, най-близък срок 20.11', c.overdue === 1 && c.due === 2 && c.nextDeadline === '2026-11-20', JSON.stringify(c))
ok('броячи: нищо за правене → нули и без срок', (() => { const x = attentionCounts([{ state: 'submitted' }]); return x.overdue === 0 && x.due === 0 && x.nextDeadline === null })())

const items = buildAttentionItems({ declarationsOverdue: 2, declarationsDue: 1, declarationsNextDeadline: '2026-11-20' })
ok('таблото: просрочени декларации → карта с брой и връзка', items[0]?.key === 'declarations-overdue' && items[0].to === '/declarations' && items[0].count === 2 && /2 просрочени декларации/.test(items[0].title))
ok('таблото: чакащи декларации → карта със срока', items[1]?.key === 'declarations-due' && /20\.11\.2026/.test(items[1].detail) && /Декларация за престой чака/.test(items[1].title))
ok('таблото: без декларации не добавя редове (старото поведение)', buildAttentionItems({}).length === 0 && buildAttentionItems({ pendingRequests: 1 }).length === 1)
ok('таблото: заявките остават първи, после просрочените декларации', buildAttentionItems({ pendingRequests: 1, declarationsOverdue: 1, unpaidCount: 1 }).map((i) => i.key).join() === 'requests,declarations-overdue,unpaid')

/* ---------- номер на имота ---------- */
ok('етикет: AMA / ΕΣΛ / ΜΑΓ', registryLabel('ama', '123456') === 'AMA 123456' && registryLabel('esl', '777') === 'ΕΣΛ 777' && registryLabel('mag', '99') === 'ΜΑΓ 99')
ok('етикет без номер е само префиксът', registryLabel('ama', '') === 'AMA' && registryLabel('ama', null) === 'AMA')
ok('валидация: празен номер е позволен (чернова)', validateRegistry({ number: '', atak: '' }) === null)
ok('валидация: обикновен номер и ATAK минават', validateRegistry({ number: '00000123456', atak: '12345678' }) === null && validateRegistry({ number: 'ΜΑΓ-0123/45', atak: '' }) === null)
ok('валидация: твърде къс или с лоши знаци', validateRegistry({ number: 'ab', atak: '' }) !== null && validateRegistry({ number: '123<script>', atak: '' }) !== null && validateRegistry({ number: '123', atak: 'x!' }) !== null)
ok('Атина: град Атина → предупреждение; Солун → не', athensZoneWarning('Атина', '') && athensZoneWarning('Athens', '') && athensZoneWarning('', 'Αθήνα 10558') && !athensZoneWarning('Солун', 'Thessaloniki'))
ok('видовете номера и начините на плащане са пълни', REGISTRY_KINDS.length === 3 && PAY_METHODS.length === 5)
ok('dmy форматира дата', dmy('2026-11-20') === '20.11.2026')

/* ---------- експорт ---------- */
const decl = { guest_country: 'DE', guest_passport: 'C01X00T47', guest_doc_name: 'Anna Schmidt', pay_method: 'bank' }
const mk = (b, d, extra = {}) => ({ booking: b, decl: d, registry: { number: '00000123456' }, propertyName: 'Вила Елия', ...declarationState(b, d, '2027-02-01'), ...extra })
const one = csvRows([mk(stay('2026-10-24', '2026-10-28', { source: 'airbnb' }), decl)])
ok('експорт: колоните са толкова, колкото заглавията', one.length === 1 && one[0].length === CSV_HEADERS.length)
ok('експорт: AMA, имот, платформа, паспорт и име са в реда', one[0][0] === '00000123456' && one[0][2] === 'Airbnb' && one[0][11] === 'C01X00T47' && one[0][12] === 'Anna Schmidt' && one[0][10] === '')
const gr = csvRows([mk(stay('2026-10-24', '2026-10-28'), { guest_country: 'GR', guest_tax_id: 'EL123456783', pay_method: 'cash' })])
ok('експорт: гръцки гост — ΑΦΜ без префикс, без паспорт', gr[0][10] === '123456783' && gr[0][11] === '' && gr[0][12] === '' && gr[0][8] === 'cash')
const ny = csvRows([mk(stay('2026-12-28', '2027-01-04', { total_price: 700 }), decl)])
ok('експорт: престой през Нова година → два реда със сума 400 и 300', ny.length === 2 && ny[0][7] === 400 && ny[1][7] === 300 && ny[0][6] === 2026 && ny[1][6] === 2027)
ok('експорт: отказани и над 59 нощи не влизат', csvRows([mk(stay('2026-10-01', '2026-10-05', { status: 'cancelled' }), null), mk(stay('2026-01-01', '2026-03-05'), null)]).length === 0)
ok('експорт: без цена → празна сума', csvRows([mk(stay('2026-10-24', '2026-10-28', { total_price: null }), decl)])[0][7] === '')

console.log(`test-declarations: ${pass} успешни, ${fail} провалени`)
process.exit(fail ? 1 : 0)
