/**
 * Потвърждение към гост и експорт на резервации — чиста логика (без React/браузър), тества се в scripts/test-guestconfirm.mjs.
 *   • сметка на платеното и остатъка от плащанията по резервацията;
 *   • готово съобщение за Viber/WhatsApp и връзките към тях;
 *   • данни за PDF „Потвърждение“;
 *   • редове за CSV експорт на списъка с резервации.
 */
import { formatMoney } from './money.js'

const pad = (n) => String(n).padStart(2, '0')
const bgDate = (iso) => {
  if (!iso) return ''
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return `${d}.${m}.${y}`
}
const nights = (a, b) => Math.max(0, Math.round((Date.UTC(...b.split('-').map((v, i) => (i === 1 ? v - 1 : +v))) - Date.UTC(...a.split('-').map((v, i) => (i === 1 ? v - 1 : +v)))) / 86400000))

/** Платено = задатъци + остатъци − връщания (payments: { kind: 'deposit'|'balance'|'refund', amount }). */
export function paidTotal(payments = []) {
  const sum = payments.reduce((s, p) => {
    const a = Number(p.amount)
    if (!Number.isFinite(a)) return s
    return p.kind === 'refund' ? s - a : s + a
  }, 0)
  return Math.round(sum * 100) / 100
}

/** Резервации от платформите: гостът плаща на Airbnb/Booking.com, не на собственика — „остатък“ към госта няма смисъл. */
const PLATFORM = { airbnb: 'Airbnb', booking: 'Booking.com' }

/**
 * Какво дължи ГОСТЪТ: цена за престоя + туристически данък − платено. (Комисионата на платформата не е за госта —
 * затова не е същото като „Дължимо“ в приложението, което е за собственика.) viaPlatform — името на платформата, ако плаща през нея.
 */
export function guestTotals(booking, payments = []) {
  const price = booking.total_price == null || booking.total_price === '' ? null : Number(booking.total_price)
  const tax = Math.round(Number(booking.tourist_tax ?? 0) * 100) / 100 || 0
  const viaPlatform = PLATFORM[booking.source] ?? null
  const paid = paidTotal(payments)
  const total = price == null ? null : Math.round((price + tax) * 100) / 100
  return { price, tax, total, paid, viaPlatform, balance: viaPlatform ? null : balanceDue(total, paid) }
}

/** Остатък за плащане: null, ако цената още не е въведена; никога под 0. */
export function balanceDue(total, paid) {
  if (total == null || total === '' || !Number.isFinite(Number(total))) return null
  return Math.max(0, Math.round((Number(total) - paid) * 100) / 100)
}

/** Телефон във формат за wa.me: само цифри, български „0888…“ → „359888…“. Празно/кратко → null. */
export function waNumber(phone) {
  let d = String(phone ?? '').replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  else if (d.startsWith('0')) d = '359' + d.slice(1)
  return d.length >= 8 && d.length <= 15 ? d : null
}

export const whatsappUrl = (phone, text) => {
  const n = waNumber(phone)
  return `https://wa.me/${n ?? ''}?text=${encodeURIComponent(text)}`
}
/** Viber не приема готов текст към конкретен номер — „viber://forward“ отваря избор на контакт със съобщението вътре. */
export const viberForwardUrl = (text) => `viber://forward?text=${encodeURIComponent(text)}`

const firstName = (name) => String(name ?? '').trim().split(/\s+/)[0] || ''

/**
 * Съобщение до госта. owner = { name, phone } (от профила: фирма или име). link — картата на госта (адрес, Wi-Fi, код).
 */
export function guestMessage({ booking, property, owner = {}, balance = null, link }) {
  const n = nights(booking.check_in, booking.check_out)
  // имената често вече са в кавички („Тихи бряг“) — не ги удвояваме
  const quoted = (n) => (/[„“"]/.test(n) ? n : `„${n}“`)
  const name = quoted(property?.name ?? '')
  const where = property?.city ? `${name}, ${property.city}` : name
  const parts = [
    `Здравейте${firstName(booking.guest_name) ? ', ' + firstName(booking.guest_name) : ''}!`,
    `Потвърждавам резервацията ви в ${where}: ${bgDate(booking.check_in)} – ${bgDate(booking.check_out)} (${n} ${n === 1 ? 'нощувка' : 'нощувки'}).`,
  ]
  if (balance != null && balance > 0) parts.push(`Остава за плащане: ${formatMoney(balance)}.`)
  if (link) parts.push(`Всичко за настаняването (адрес, Wi-Fi, код): ${link}`)
  parts.push('До скоро!')
  const sign = [owner.name, owner.phone].filter(Boolean).join(', ')
  if (sign) parts.push(`— ${sign}`)
  return parts.join(' ')
}

/** Данни за PDF потвърждението. */
export function confirmationData({ booking, property, owner = {}, payments = [] }) {
  const t = guestTotals(booking, payments)
  return {
    guest: { name: booking.guest_name ?? '', phone: booking.guest_phone ?? '', email: booking.guest_email ?? '' },
    property: {
      name: property?.name ?? '',
      address: [property?.address, property?.city].filter(Boolean).join(', '),
      checkinTime: property?.checkin_time ? String(property.checkin_time).slice(0, 5) : '',
      checkoutTime: property?.checkout_time ? String(property.checkout_time).slice(0, 5) : '',
    },
    period: { checkIn: booking.check_in, checkOut: booking.check_out, nights: nights(booking.check_in, booking.check_out) },
    guests: booking.num_guests ?? null,
    price: t.price,
    tax: t.tax,
    total: t.total,
    paid: t.paid,
    balance: t.balance,
    viaPlatform: t.viaPlatform,
    owner: { name: owner.name ?? '', phone: owner.phone ?? '' },
  }
}

export const confirmationFilename = (booking) =>
  `Потвърждение-${String(booking.guest_name ?? 'гост').trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'гост'}-${String(booking.check_in).slice(0, 10)}.pdf`

/* ----------------------------------------------------------- CSV */

export const BOOKINGS_CSV_HEADERS = ['Гост', 'Телефон', 'Имейл', 'Имот', 'Настаняване', 'Напускане', 'Нощувки', 'Гости', 'Източник', 'Статус', 'Цена (€)', 'Комисиона (€)', 'Бележка']

/** labels = { property(id) → име, source(key) → текст, status(key) → текст } */
export function bookingsCsvRows(bookings, labels) {
  const money = (v) => (v == null || v === '' ? '' : Number(v).toFixed(2))
  return bookings.map((b) => [
    b.guest_name ?? '',
    b.guest_phone ?? '',
    b.guest_email ?? '',
    labels.property(b.property_id) ?? '',
    bgDate(b.check_in),
    bgDate(b.check_out),
    nights(b.check_in, b.check_out),
    b.num_guests ?? '',
    labels.source(b.source) ?? '',
    labels.status(b.status) ?? '',
    money(b.total_price),
    money(b.commission),
    (b.notes ?? '').replace(/\s+/g, ' ').trim(),
  ])
}

export const bookingsCsvFilename = (today = new Date()) => `rezervacii-${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}.csv`
