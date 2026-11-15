// Логика на потвърждението към гост и CSV експорта на резервации без браузър.   node scripts/test-guestconfirm.mjs
import {
  paidTotal, balanceDue, guestTotals, waNumber, whatsappUrl, viberForwardUrl, guestMessage, confirmationData, confirmationFilename,
  bookingsCsvRows, BOOKINGS_CSV_HEADERS, bookingsCsvFilename,
} from '../src/lib/guestConfirm.js'

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

/* плащания */
eq(paidTotal([]), 0, 'без плащания = 0')
eq(paidTotal([{ kind: 'deposit', amount: '200.00' }, { kind: 'balance', amount: 100 }]), 300, 'задатък + остатък')
eq(paidTotal([{ kind: 'deposit', amount: 200 }, { kind: 'refund', amount: 50.5 }]), 149.5, 'връщане се изважда')
eq(paidTotal([{ kind: 'deposit', amount: 0.1 }, { kind: 'deposit', amount: 0.2 }]), 0.3, 'без грешка от плаваща запетая')
eq(paidTotal([{ kind: 'deposit', amount: 'x' }, { kind: 'deposit', amount: 10 }]), 10, 'нечислова сума се пропуска')
eq(balanceDue(610, 200), 410, 'остатък 610 − 200')
eq(balanceDue('610.00', 610), 0, 'платено изцяло → 0')
eq(balanceDue(100, 150), 0, 'преплатено → не е отрицателно')
eq(balanceDue(null, 0), null, 'без цена → няма остатък')
eq(balanceDue('', 0), null, 'празна цена → няма остатък')

/* телефон и връзки */
eq(waNumber('+359 888 123 456'), '359888123456', '+359 → цифри')
eq(waNumber('0888 123 456'), '359888123456', '0… → 359…')
eq(waNumber('00359888123456'), '359888123456', '00359 → 359')
eq(waNumber('+30 694 123 4567'), '306941234567', 'чужд номер не се пипа')
eq(waNumber(''), null, 'празно')
eq(waNumber('123'), null, 'твърде кратко')
ok(whatsappUrl('0888123456', 'Здравей & до скоро').startsWith('https://wa.me/359888123456?text=%D0%97'), 'WhatsApp към номер')
ok(whatsappUrl(null, 'x').startsWith('https://wa.me/?text='), 'WhatsApp без номер → избор на контакт')
ok(!/[ &]/.test(whatsappUrl('0888123456', 'a b&c').split('?text=')[1]), 'текстът е кодиран')
ok(viberForwardUrl('a b').startsWith('viber://forward?text=a%20b'), 'Viber forward')

/* съобщение */
const booking = { guest_name: 'Мария Петрова', guest_phone: '0888 123 456', guest_email: 'm@x.bg', check_in: '2026-10-17', check_out: '2026-10-22', num_guests: 2, total_price: '610.00', notes: 'Късно  настаняване\nв 22:00' }
const property = { name: 'Вила „Тихи бряг“', city: 'Царево', address: 'ул. Крайбрежна 12', checkin_time: '14:00:00', checkout_time: '11:00:00' }
const owner = { name: 'Морски имоти ЕООД', phone: '+359 88 712 4093' }
const msg = guestMessage({ booking, property, owner, balance: 410, link: 'https://x.bg/guest/1' })
ok(msg.startsWith('Здравейте, Мария!'), 'поздрав с малкото име')
ok(/в Вила „Тихи бряг“, Царево:/.test(msg) && !/„Вила „/.test(msg), 'име с кавички не се удвоява')
ok(/ в „Тихи бряг“: /.test(guestMessage({ booking, property: { name: 'Тихи бряг' }, owner })), 'име без кавички получава „…“')
ok(/17\.10\.2026 – 22\.10\.2026 \(5 нощувки\)/.test(msg), 'дати и нощувки')
ok(/Остава за плащане: 410\.00 €\./.test(msg), 'остатък в съобщението')
ok(/https:\/\/x\.bg\/guest\/1/.test(msg) && /— Морски имоти ЕООД, \+359 88 712 4093$/.test(msg), 'връзка и подпис')
ok(!/Остава за плащане/.test(guestMessage({ booking, property, owner, balance: 0, link: 'l' })), 'платено → без ред за остатък')
ok(!/Остава за плащане/.test(guestMessage({ booking, property, owner, balance: null, link: 'l' })), 'без цена → без ред за остатък')
ok(/1 нощувка\)/.test(guestMessage({ booking: { ...booking, check_out: '2026-10-18' }, property, owner })), '1 нощувка (ед. число)')
ok(guestMessage({ booking: { ...booking, guest_name: '' }, property, owner }).startsWith('Здравейте!'), 'без име → „Здравейте!“')
ok(!/undefined|null/.test(msg), 'без undefined/null в текста')

/* данни за PDF */
const d = confirmationData({ booking, property, owner, payments: [{ kind: 'deposit', amount: 200 }] })
eq([d.total, d.paid, d.balance, d.period.nights, d.guests], [610, 200, 410, 5, 2], 'сума, платено, остатък, нощувки, гости')
/* какво дължи гостът: цена + туристически данък − платено; платформите — без остатък */
eq(guestTotals({ total_price: 520, tourist_tax: 32, source: 'direct' }, [{ kind: 'deposit', amount: 156 }, { kind: 'balance', amount: 364 }]), { price: 520, tax: 32, total: 552, paid: 520, viaPlatform: null, balance: 32 }, 'директна: 520 + 32 данък − 520 платено = 32 остатък')
eq(guestTotals({ total_price: 400, tourist_tax: 10, commission: 60, source: 'airbnb' }, []).balance, null, 'Airbnb: гостът плаща на платформата → без остатък')
eq(guestTotals({ total_price: 400, tourist_tax: 10, source: 'booking' }, []).viaPlatform, 'Booking.com', 'Booking.com е посочено')
eq(guestTotals({ total_price: null, source: 'manual' }, []).balance, null, 'без цена → без остатък')
eq(guestTotals({ total_price: 300, tourist_tax: null, source: 'manual' }, []).total, 300, 'без данък → само цената')
eq(guestTotals({ total_price: 300, tourist_tax: 0.1, source: 'manual' }, [{ kind: 'deposit', amount: 0.2 }]).balance, 299.9, 'закръгляне на стотинките')
eq([d.property.checkinTime, d.property.checkoutTime, d.property.address], ['14:00', '11:00', 'ул. Крайбрежна 12, Царево'], 'часове и адрес')
eq(confirmationData({ booking: { ...booking, total_price: null }, property, owner }).balance, null, 'без цена → остатък null')
eq(confirmationData({ booking, property: null, owner }).property.name, '', 'без имот не гърми')
eq(confirmationFilename(booking), 'Потвърждение-Мария-Петрова-2026-10-17.pdf', 'име на файла')
eq(confirmationFilename({ guest_name: '', check_in: '2026-10-17' }), 'Потвърждение-гост-2026-10-17.pdf', 'име на файла без име на гост')

/* CSV */
const labels = { property: (id) => ({ p1: 'Вила Тихи бряг' })[id], source: (s) => ({ airbnb: 'Airbnb' })[s] ?? s, status: (s) => ({ confirmed: 'Потвърдена' })[s] ?? s }
const rows = bookingsCsvRows([{ ...booking, property_id: 'p1', source: 'airbnb', status: 'confirmed', commission: '91.50' }, { guest_name: 'Без цена', check_in: '2026-11-01', check_out: '2026-11-03', property_id: 'zz', source: 'manual', status: 'confirmed', total_price: null }], labels)
eq(rows[0].length, BOOKINGS_CSV_HEADERS.length, 'колони = заглавия')
eq(rows[0], ['Мария Петрова', '0888 123 456', 'm@x.bg', 'Вила Тихи бряг', '17.10.2026', '22.10.2026', 5, 2, 'Airbnb', 'Потвърдена', '610.00', '91.50', 'Късно настаняване в 22:00'], 'ред с всички полета; бележката е на един ред')
eq([rows[1][3], rows[1][10], rows[1][11], rows[1][7]], ['', '', '', ''], 'липсваща цена/комисиона/имот → празни клетки')
eq(bookingsCsvRows([], labels), [], 'празен списък')
eq(bookingsCsvFilename(new Date(2026, 10, 5)), 'rezervacii-2026-11-05.csv', 'име на CSV файла')

console.log(`\nguestconfirm: ${pass} успешни, ${fail} провалени`)
process.exit(fail ? 1 : 0)
