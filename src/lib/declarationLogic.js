/**
 * Гърция: декларация за всеки краткосрочен престой — чиста логика (без база, без мрежа), за да се тества в Node.
 *
 * Правилата (от търговски източници; да се потвърдят със счетоводител):
 *  - краткосрочен е престой до 59 нощи; от 60 нощи е друг вид наем с друга декларация;
 *  - декларацията се подава до 20-о число на месеца след напускането;
 *  - престой през Нова година се декларира на две части, сумата се дели по броя нощи;
 *  - гръцки гост: ΑΦΜ; чужденец: име и номер на паспорт; начинът на плащане е задължителен.
 * StayFlow пази данните и следи срока — подаването е в портала myAADE.
 */
import { OTA_SOURCES } from './sources.js'

export const SHORT_TERM_MAX_NIGHTS = 59
export const DECLARATION_DUE_DAY = 20
/** Нови регистрации в част от централна Атина са спрени до тази дата. */
export const ATHENS_FROZEN_UNTIL = '2026-12-31'

export const REGISTRY_KINDS = [
  { value: 'ama', label: 'AMA — краткосрочен наем' },
  { value: 'esl', label: 'ΕΣΛ — лицензиран обект' },
  { value: 'mag', label: 'ΜΑΓ — лицензиран обект' },
]
const REGISTRY_PREFIX = { ama: 'AMA', esl: 'ΕΣΛ', mag: 'ΜΑΓ' }

export const PAY_METHODS = [
  { value: 'platform', label: 'Платформа' },
  { value: 'bank', label: 'Банков превод' },
  { value: 'card', label: 'Карта' },
  { value: 'cash', label: 'В брой' },
  { value: 'other', label: 'Друго' },
]

const DAY = 86400000
const utc = (iso) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))
const pad = (n) => String(n).padStart(2, '0')
const round2 = (n) => Math.round(n * 100) / 100

export const nightsOf = (checkIn, checkOut) => Math.round((utc(checkOut) - utc(checkIn)) / DAY)
export const daysBetween = (fromIso, toIso) => Math.round((utc(toIso) - utc(fromIso)) / DAY)

/** Краен срок: 20-о число на месеца след напускането (напускане 15 юли → 20 август; декември → 20 януари). */
export function declarationDeadline(checkOut) {
  let y = Number(checkOut.slice(0, 4))
  let m = Number(checkOut.slice(5, 7)) + 1
  if (m > 12) {
    m = 1
    y += 1
  }
  return `${y}-${pad(m)}-${pad(DECLARATION_DUE_DAY)}`
}

export const isLongStay = (nights) => nights > SHORT_TERM_MAX_NIGHTS

/** „20.11.2026“ от „2026-11-20“ */
export const dmy = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`

/**
 * Дели престоя по календарни години (нощта 31.12 е в старата година, 01.01 — в новата).
 * Сумата се дели по броя нощи; последната част взима остатъка, така сборът е точно общата сума.
 */
export function yearSplit(checkIn, checkOut, total) {
  const n = nightsOf(checkIn, checkOut)
  const sum = total === '' || total == null || !Number.isFinite(Number(total)) ? null : Number(total)
  const parts = []
  let cur = checkIn
  while (n > 0 && cur < checkOut) {
    const year = Number(cur.slice(0, 4))
    const nextJan = `${year + 1}-01-01`
    const end = nextJan < checkOut ? nextJan : checkOut
    const nights = nightsOf(cur, end)
    parts.push({ year, from: cur, to: end, nights, amount: sum == null ? null : round2((sum * nights) / n) })
    cur = end
  }
  if (sum != null && parts.length > 1) {
    const others = parts.slice(0, -1).reduce((s, p) => s + p.amount, 0)
    parts[parts.length - 1].amount = round2(sum - others)
  }
  return parts
}

/** ΑΦΜ: 9 цифри с контролна цифра (по-малко грешки при въвеждане). Приема и „EL123456789“, и интервали. */
export function cleanTaxId(v) {
  return String(v ?? '').replace(/\s|-/g, '').replace(/^EL/i, '')
}
export function isValidAfm(v) {
  const s = cleanTaxId(v)
  if (!/^\d{9}$/.test(s) || /^0{9}$/.test(s)) return false
  let sum = 0
  for (let i = 0; i < 8; i++) sum += Number(s[i]) * 2 ** (8 - i)
  return (sum % 11) % 10 === Number(s[8])
}
export const isValidPassport = (v) => /^[A-Za-z0-9<-]{4,30}$/.test(String(v ?? '').replace(/\s/g, ''))

export function effectivePayMethod(booking, decl) {
  return decl?.pay_method ?? (OTA_SOURCES.includes(booking?.source) ? 'platform' : null)
}

/** Какво още липсва в данните на госта за декларацията: country | tax_id | passport | doc_name | pay_method. */
export function missingData(booking, decl) {
  const missing = []
  const country = decl?.guest_country
  if (!country) missing.push('country')
  else if (country === 'GR') {
    if (!isValidAfm(decl?.guest_tax_id)) missing.push('tax_id')
  } else {
    if (!isValidPassport(decl?.guest_passport)) missing.push('passport')
    if (String(decl?.guest_doc_name ?? '').trim().length < 2) missing.push('doc_name')
  }
  if (!effectivePayMethod(booking, decl)) missing.push('pay_method')
  return missing
}

/**
 * Състоянието на декларацията за една резервация.
 *  cancelled — отказана (декларира се само ако гостът е платил такса — това се отбелязва ръчно);
 *  long      — над 59 нощи: друга декларация, не се следи тук;
 *  submitted — отбелязана като подадена;
 *  upcoming  — гостът още не е напуснал; due — напуснал е, срокът тече; overdue — срокът е минал.
 */
export function declarationState(booking, decl, today) {
  if (booking.status === 'cancelled') return { state: 'cancelled' }
  const nights = nightsOf(booking.check_in, booking.check_out)
  if (isLongStay(nights)) return { state: 'long', nights }
  const deadline = declarationDeadline(booking.check_out)
  const split = yearSplit(booking.check_in, booking.check_out, booking.total_price)
  if (decl?.status === 'submitted') return { state: 'submitted', nights, deadline, daysLeft: null, missing: [], split }
  const daysLeft = daysBetween(today, deadline)
  const state = booking.check_out > today ? 'upcoming' : daysLeft < 0 ? 'overdue' : 'due'
  return { state, nights, deadline, daysLeft, missing: missingData(booking, decl), split }
}

/** Броячи за таблото „Чака вас“ — по редове от declarationState(). */
export function attentionCounts(rows) {
  let overdue = 0
  let due = 0
  let nextDeadline = null
  for (const r of rows) {
    if (r.state === 'overdue') overdue++
    if (r.state === 'due') {
      due++
      if (!nextDeadline || r.deadline < nextDeadline) nextDeadline = r.deadline
    }
  }
  return { overdue, due, nextDeadline }
}

export function registryLabel(kind, number) {
  const prefix = REGISTRY_PREFIX[kind] ?? 'AMA'
  return number ? `${prefix} ${number}` : prefix
}

export const isGreekProperty = (registry) => registry?.country === 'GR'

/** Центърът на Атина: ако градът е Атина, а имотът още няма AMA, напомняме за спрените нови регистрации. */
export function athensZoneWarning(city, address) {
  return /(атина|athens|αθήνα|αθηνα)/i.test(`${city ?? ''} ${address ?? ''}`)
}

/** Проверка на формата „Регистрация в Гърция“. Празният номер е позволен (чернова) — карта показва предупреждение. */
export function validateRegistry(v) {
  const check = (s) => s === '' || /^[A-Za-z0-9Ͱ-Ͽ/ -]{3,40}$/.test(s)
  const number = String(v.number ?? '').trim()
  const atak = String(v.atak ?? '').trim()
  if (!check(number)) return 'Номерът може да съдържа само букви, цифри, тире и наклонена черта (3–40 знака).'
  if (!check(atak)) return 'ATAK може да съдържа само букви, цифри, тире и наклонена черта (3–40 знака).'
  return null
}

/** Колоните на експорта (английски, за да ги чете и гръцки счетоводител). Една част = един ред; престой през Нова година → два реда. */
export const CSV_HEADERS = [
  'AMA', 'Property', 'Platform', 'Check-in', 'Check-out', 'Nights', 'Year', 'Amount EUR',
  'Payment method', 'Guest country', 'Guest AFM', 'Guest passport', 'Name as in passport', 'Deadline', 'Status',
]

const PLATFORM = { airbnb: 'Airbnb', booking: 'Booking.com', direct: 'Direct', manual: 'Direct' }

export function csvRows(items) {
  const rows = []
  for (const it of items) {
    if (it.state === 'cancelled' || it.state === 'long') continue
    const parts = it.split?.length ? it.split : [{ year: Number(it.booking.check_in.slice(0, 4)), from: it.booking.check_in, to: it.booking.check_out, nights: it.nights, amount: it.booking.total_price }]
    for (const p of parts) {
      const d = it.decl
      rows.push([
        it.registry?.number ?? '',
        it.propertyName ?? '',
        PLATFORM[it.booking.source] ?? it.booking.source,
        p.from,
        p.to,
        p.nights,
        p.year,
        p.amount == null ? '' : p.amount,
        effectivePayMethod(it.booking, d) ?? '',
        d?.guest_country ?? '',
        d?.guest_country === 'GR' ? cleanTaxId(d?.guest_tax_id) : '',
        d?.guest_country && d.guest_country !== 'GR' ? d?.guest_passport ?? '' : '',
        d?.guest_country && d.guest_country !== 'GR' ? d?.guest_doc_name ?? '' : '',
        it.deadline,
        it.state,
      ])
    }
  }
  return rows
}
