// Логика без браузър: търсене на гост (име, телефон, имейл) и проверка на профила на собственика.
//   node scripts/test-usability.mjs
import { searchBookings, phoneDigits, searchTokens } from '../src/lib/bookingSearch.js'
import { validateProfile, validatePhone, guestFacingContact, profileChanged } from '../src/lib/profileLogic.js'

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

/* ---------------- телефон ---------------- */
eq(phoneDigits('+359 888 123 456'), '0888123456', '+359 → 0')
eq(phoneDigits('0888 12 34 56'), '0888123456', 'интервали се махат')
eq(phoneDigits('00359888123456'), '0888123456', '00359 → 0')
eq(phoneDigits('(02) 981-23-45'), '029812345', 'скоби и тирета')
eq(phoneDigits(null), '', 'null')
eq(phoneDigits('+30 694 123 4567'), '306941234567', 'чужд номер не се пипа')

/* ---------------- търсене ---------------- */
const B = [
  { id: 1, guest_name: 'Иван Петров', guest_phone: '+359 888 123 456', guest_email: 'ivan@example.com' },
  { id: 2, guest_name: 'Maria Schmidt', guest_phone: '0899 55 44 33', guest_email: null },
  { id: 3, guest_name: 'Георги Димитров', guest_phone: null, guest_email: 'georgi.d@abv.bg' },
  { id: 4, guest_name: 'Елена Петрова', guest_phone: '+30 694 123 4567', guest_email: '' },
  { id: 5, guest_name: 'José Álvarez', guest_phone: '', guest_email: '' },
]
const ids = (q) => searchBookings(B, q).map((b) => b.id)

eq(ids(''), [1, 2, 3, 4, 5], 'празна заявка → всички')
eq(ids('   '), [1, 2, 3, 4, 5], 'само интервали → всички')
eq(ids('иван'), [1], 'име на кирилица')
eq(ids('ИВАН'), [1], 'главни букви')
eq(ids('петров'), [1, 4], '„петров“ намира и „Петрова“ (част от думата)')
eq(ids('петров иван'), [1], 'думите в друг ред')
eq(ids('иван георги'), [], 'всички думи трябва да съвпаднат')
eq(ids('schmidt'), [2], 'латиница')
eq(ids('jose'), [5], 'без диакритици: jose = José')
eq(ids('alvarez'), [5], 'без диакритици: alvarez = Álvarez')
eq(ids('0888123456'), [1], 'пълен телефон като 0888…')
eq(ids('+359888123456'), [1], 'пълен телефон като +359…')
eq(ids('888 123'), [1], 'част от телефона с интервал')
eq(ids('123456'), [1, 4], 'цифри в средата/края (намира и чуждия номер с 1234567)')
eq(ids('0899554433'), [2], 'телефон записан с интервали')
eq(ids('55 44'), [2], 'средата на номера')
eq(ids('12'), [], 'по-малко от 3 цифри не търси в телефоните (шум)')
eq(ids('ivan@example'), [1], 'имейл')
eq(ids('abv.bg'), [3], 'домейн на имейл')
eq(ids('+30694'), [4], 'чужд номер')
eq(ids('+359'), [1, 2], '„+359“ докато още се пише: всички български номера')
eq(ids('+359 888'), [1], '„+359 888“')
eq(ids('нямагост'), [], 'без съвпадения')
ok(searchBookings(B, 'иван') !== B, 'резултатът е нов масив, входът не се пипа')
eq(B.length, 5, 'входът не е променен')
eq(searchTokens('  Иван   Петров '), ['иван', 'петров'], 'токени')
// „петров“ намира и „Петрова“ (частично съвпадение е нарочно — търси се в движение)
eq(ids('петрова'), [4], '„петрова“ → само Елена')
eq(searchBookings([{ id: 9, guest_name: null }], 'x'), [], 'липсващо име не гърми')

/* ---------------- профил ---------------- */
eq(validatePhone(''), null, 'телефонът е по желание')
eq(validatePhone('+359 888 123 456'), null, 'нормален телефон')
eq(validatePhone('0888-123-456'), null, 'тирета')
eq(validatePhone('(02) 981 23 45'), null, 'скоби')
ok(validatePhone('abc') !== null, 'букви → грешка')
ok(validatePhone('12345') !== null, 'под 6 цифри → грешка')
ok(validatePhone('1'.repeat(16)) !== null, 'над 15 цифри → грешка')
ok(validatePhone('0888 12x456') !== null, 'буква в номера → грешка')

let r = validateProfile({ full_name: '  Иван   Петров ', company_name: '  ', phone: ' +359  888 123 456 ' })
eq(r.errors, {}, 'добър профил без грешки')
eq(r.values, { full_name: 'Иван Петров', company_name: null, phone: '+359 888 123 456' }, 'стойностите се чистят, празното става null')
r = validateProfile({ full_name: '   ', company_name: '', phone: '' })
ok(r.errors.full_name, 'празно име → грешка')
r = validateProfile({ full_name: 'А'.repeat(81), company_name: 'Б'.repeat(121), phone: 'x' })
ok(r.errors.full_name && r.errors.company_name && r.errors.phone, 'твърде дълги имена и лош телефон → 3 грешки')
r = validateProfile({ full_name: 'А'.repeat(80), company_name: 'Б'.repeat(120), phone: '' })
eq(r.errors, {}, 'точно на границата е допустимо')
r = validateProfile({})
ok(r.errors.full_name && !r.errors.phone, 'празен обект: само името е задължително')

eq(guestFacingContact({ full_name: 'Иван', company_name: 'Морски къщи ЕООД', phone: '0888' }), { name: 'Морски къщи ЕООД', phone: '0888' }, 'гостът вижда фирмата, ако има')
eq(guestFacingContact({ full_name: 'Иван', company_name: '  ', phone: null }), { name: 'Иван', phone: null }, 'без фирма → името')
eq(guestFacingContact({ full_name: '', company_name: null, phone: '' }), { name: null, phone: null }, 'нищо попълнено')
eq(guestFacingContact(null), { name: null, phone: null }, 'без профил')

const prof = { full_name: 'Иван', company_name: null, phone: null }
ok(!profileChanged(prof, { full_name: 'Иван', company_name: null, phone: null }), 'без промяна')
ok(profileChanged(prof, { full_name: 'Иван П.', company_name: null, phone: null }), 'сменено име')
ok(profileChanged(prof, { full_name: 'Иван', company_name: 'Ф', phone: null }), 'добавена фирма')
ok(profileChanged(prof, { full_name: 'Иван', company_name: null, phone: '0888 123 456' }), 'добавен телефон')

console.log(`\nusability: ${pass} успешни, ${fail} провалени`)
process.exit(fail ? 1 : 0)
