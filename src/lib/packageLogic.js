/**
 * Пакети и оферти за престой — чиста логика (без Supabase, тества се с node). Огледало на изчислението в quote_stay
 * (миграция 015): scripts/test-packages.mjs пази двете да дават същите числа.
 *
 * Видове: free_nights („6+1“), percent_off (отстъпка от N нощувки нагоре), fixed_price (точно N нощувки за обща цена),
 * early_bird (ранно записване), last_minute (последна минута). При няколко подходящи се прилага ЕДИН — най-изгодният за госта.
 */
import { formatDate } from './localeDates.js'

export const PACKAGE_KINDS = [
  { key: 'free_nights', label: 'Безплатни нощувки (напр. 6+1)' },
  { key: 'percent_off', label: 'Отстъпка за по-дълъг престой' },
  { key: 'fixed_price', label: 'Фиксирана цена за престой' },
  { key: 'early_bird', label: 'Ранно записване' },
  { key: 'last_minute', label: 'Последна минута' },
]

/** Бързи начала (бутоните над списъка). label е надписът на бутона. */
export const PACKAGE_PRESETS = [
  { key: 'six_plus_one', label: '6+1', kind: 'free_nights', name: '6+1', paid_nights: 6, free_nights: 1 },
  { key: 'week', label: 'Седмица −10%', kind: 'percent_off', name: 'Седмица', min_nights: 7, percent: 10 },
  { key: 'month', label: 'Месец −25%', kind: 'percent_off', name: 'Месец', min_nights: 30, percent: 25 },
  { key: 'early', label: 'Ранно записване −10%', kind: 'early_bird', name: 'Ранно записване', days_before: 30, percent: 10 },
  { key: 'last', label: 'Последна минута −15%', kind: 'last_minute', name: 'Последна минута', days_before: 3, percent: 15 },
]

const int = (v) => (v === '' || v == null ? NaN : Math.trunc(Number(v)))
const num = (v) => (v === '' || v == null ? NaN : Number(v))
const round2 = (n) => Math.round(n * 100 + Number.EPSILON) / 100

export const nightsWord = (n) => (n === 1 ? 'нощувка' : 'нощувки')
export const daysWord = (n) => (n === 1 ? 'ден' : 'дни')

/* ---------- чернова ↔ база ---------- */

export function emptyPackage(presetKey) {
  const p = PACKAGE_PRESETS.find((x) => x.key === presetKey)
  return {
    key: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2),
    id: null,
    kind: p?.kind ?? 'percent_off',
    name: p?.name ?? '',
    is_active: true,
    paid_nights: p?.paid_nights ?? 6,
    free_nights: p?.free_nights ?? 1,
    repeat_block: false,
    min_nights: p?.min_nights ?? 7,
    percent: p?.percent ?? 10,
    fixed_nights: 3,
    fixed_total: '',
    checkin_weekday: '',
    days_before: p?.days_before ?? 30,
    valid_from: '',
    valid_to: '',
    created_at: null,
  }
}

export function toDraft(row) {
  const or = (x, fallback) => (x == null ? fallback : String(Number(x))) // полетата на другите видове се пълнят с разумни стойности
  return {
    key: row.id,
    id: row.id,
    kind: row.kind,
    name: row.name ?? '',
    is_active: row.is_active !== false,
    paid_nights: or(row.paid_nights, '6'),
    free_nights: or(row.free_nights, '1'),
    repeat_block: Boolean(row.repeat_block),
    min_nights: or(row.min_nights, '7'),
    percent: or(row.percent, '10'),
    fixed_nights: or(row.fixed_nights, '3'),
    fixed_total: row.fixed_total == null ? '' : String(Number(row.fixed_total)),
    checkin_weekday: row.checkin_weekday == null ? '' : String(row.checkin_weekday),
    days_before: or(row.days_before, '30'),
    valid_from: row.valid_from ?? '',
    valid_to: row.valid_to ?? '',
    created_at: row.created_at ?? null,
  }
}

/** Само полетата на избрания вид, останалото — null (така базата не пази излишни стойности). */
export function toPayload(d, propertyId) {
  const base = {
    property_id: propertyId,
    kind: d.kind,
    name: d.name.trim() || null,
    is_active: Boolean(d.is_active),
    repeat_block: d.kind === 'free_nights' ? Boolean(d.repeat_block) : false,
    paid_nights: null,
    free_nights: null,
    min_nights: null,
    percent: null,
    fixed_nights: null,
    fixed_total: null,
    checkin_weekday: null,
    days_before: null,
    valid_from: d.valid_from || null,
    valid_to: d.valid_to || null,
  }
  if (d.kind === 'free_nights') return { ...base, paid_nights: int(d.paid_nights), free_nights: int(d.free_nights) }
  if (d.kind === 'percent_off') return { ...base, min_nights: int(d.min_nights), percent: num(d.percent) }
  if (d.kind === 'fixed_price') return { ...base, fixed_nights: int(d.fixed_nights), fixed_total: num(d.fixed_total), checkin_weekday: d.checkin_weekday === '' ? null : int(d.checkin_weekday) }
  if (d.kind === 'early_bird' || d.kind === 'last_minute') return { ...base, days_before: int(d.days_before), percent: num(d.percent) }
  return base
}

/** Едно и също ли е съдържанието на две чернови/реда (без ключ и дата на създаване) — за да се записва само променено. */
export function samePackage(a, b) {
  const pa = toPayload(a, 'x')
  const pb = toPayload(b, 'x')
  return Object.keys(pa).every((k) => pa[k] === pb[k] || (Number.isNaN(pa[k]) && Number.isNaN(pb[k])))
}

/** Съобщение за грешка или null. */
export function validatePackage(d) {
  if (!PACKAGE_KINDS.some((k) => k.key === d.kind)) return 'Изберете вид на офертата.'
  if (d.name && d.name.trim().length > 60) return 'Името е до 60 знака.'
  const inRange = (v, lo, hi) => Number.isInteger(int(v)) && int(v) >= lo && int(v) <= hi
  if (d.kind === 'free_nights') {
    if (!inRange(d.paid_nights, 1, 365)) return 'Платените нощувки са поне 1.'
    if (!inRange(d.free_nights, 1, 365)) return 'Безплатните нощувки са поне 1.'
  }
  if (d.kind === 'percent_off') {
    if (!inRange(d.min_nights, 1, 365)) return 'Минималният престой е поне 1 нощувка.'
  }
  if (d.kind === 'fixed_price') {
    if (!inRange(d.fixed_nights, 1, 365)) return 'Нощувките са поне 1.'
    if (!(num(d.fixed_total) > 0)) return 'Въведете обща цена за престоя (положително число).'
  }
  if (d.kind === 'early_bird' && !inRange(d.days_before, 1, 730)) return 'Резервацията трябва да е поне 1 ден по-рано.'
  if (d.kind === 'last_minute' && !inRange(d.days_before, 0, 730)) return 'Дните са число от 0 нагоре.'
  if (['percent_off', 'early_bird', 'last_minute'].includes(d.kind)) {
    const p = num(d.percent)
    if (!(p > 0 && p <= 90)) return 'Отстъпката е между 0 и 90%.'
  }
  if (d.valid_from && d.valid_to && d.valid_to < d.valid_from) return 'Краят на периода не може да е преди началото.'
  return null
}

/* ---------- дати (UTC, без часови зони) ---------- */

const dayNumber = (iso) => Math.floor(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000)
export const daysBetween = (fromISO, toISO) => dayNumber(toISO) - dayNumber(fromISO)
export function addDaysISO(iso, n) {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + n))
  return d.toISOString().slice(0, 10)
}
/** ISO ден от седмицата: 1 = понеделник … 7 = неделя. */
export const isoWeekday = (iso) => {
  const w = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))).getUTCDay()
  return w === 0 ? 7 : w
}

/* ---------- изчисление (огледало на quote_stay) ---------- */

/** Важи ли офертата за настаняване на тази дата (активна и в периода). */
export function appliesOnDate(pkg, checkIn) {
  if (pkg.is_active === false) return false
  if (pkg.valid_from && checkIn < pkg.valid_from) return false
  if (pkg.valid_to && checkIn > pkg.valid_to) return false
  return true
}

/**
 * Отстъпката от една оферта. ctx = { prices: [цена на всяка нощувка], checkIn: 'YYYY-MM-DD', today: 'YYYY-MM-DD' }.
 * Връща 0, ако не е подходяща. Безплатните нощувки са най-евтините.
 */
export function packageSaving(pkg, ctx) {
  if (!appliesOnDate(pkg, ctx.checkIn)) return 0
  const prices = ctx.prices
  const nights = prices.length
  const total = prices.reduce((s, x) => s + x, 0)
  const ahead = daysBetween(ctx.today, ctx.checkIn)
  let saving = 0
  if (pkg.kind === 'free_nights') {
    const paid = int(pkg.paid_nights)
    const free = int(pkg.free_nights)
    if (nights >= paid + free) {
      const count = Math.min(pkg.repeat_block ? Math.floor(nights / (paid + free)) * free : free, nights)
      saving = [...prices].sort((a, b) => a - b).slice(0, count).reduce((s, x) => s + x, 0)
    }
  } else if (pkg.kind === 'percent_off') {
    if (nights >= int(pkg.min_nights)) saving = (total * num(pkg.percent)) / 100
  } else if (pkg.kind === 'fixed_price') {
    const wd = pkg.checkin_weekday === '' || pkg.checkin_weekday == null ? null : int(pkg.checkin_weekday)
    if (nights === int(pkg.fixed_nights) && (wd === null || isoWeekday(ctx.checkIn) === wd) && num(pkg.fixed_total) < total) saving = total - num(pkg.fixed_total)
  } else if (pkg.kind === 'early_bird') {
    if (ahead >= int(pkg.days_before)) saving = (total * num(pkg.percent)) / 100
  } else if (pkg.kind === 'last_minute') {
    if (ahead <= int(pkg.days_before)) saving = (total * num(pkg.percent)) / 100
  }
  return round2(Math.min(saving, total))
}

/** Най-изгодната оферта за госта: { pkg, saving } или null. При равенство — по-рано създадената (както в SQL). */
export function bestPackage(packages, ctx) {
  let best = null
  const ordered = [...packages].sort((a, b) => (a.created_at ?? '9999') < (b.created_at ?? '9999') ? -1 : (a.created_at ?? '9999') > (b.created_at ?? '9999') ? 1 : 0)
  for (const pkg of ordered) {
    const saving = packageSaving(pkg, ctx)
    if (saving > (best?.saving ?? 0)) best = { pkg, saving }
  }
  return best
}

/** Пример за собственика: при цена на нощувка price — колко се плаща с офертата и колко без нея. null без цена. */
export function examplePackage(pkg, price) {
  if (!(price > 0)) return null
  const nights =
    pkg.kind === 'free_nights' ? int(pkg.paid_nights) + int(pkg.free_nights)
      : pkg.kind === 'percent_off' ? int(pkg.min_nights)
        : pkg.kind === 'fixed_price' ? int(pkg.fixed_nights)
          : 7
  if (!(nights >= 1)) return null
  const today = '2001-01-01' // понеделник
  const wd = pkg.checkin_weekday === '' || pkg.checkin_weekday == null ? 0 : int(pkg.checkin_weekday) - 1
  const checkIn = addDaysISO(today, pkg.kind === 'early_bird' ? int(pkg.days_before) : pkg.kind === 'fixed_price' ? wd : 0)
  const open = { ...pkg, valid_from: '', valid_to: '', is_active: true } // примерът не гледа периода на важене
  const full = round2(price * nights)
  const saving = packageSaving(open, { prices: Array(nights).fill(price), checkIn, today })
  return saving > 0 ? { nights, full, pay: round2(full - saving), saving } : null
}

/* ---------- описание на български (за собственика; в приложението се превежда по речника) ---------- */

const pct = (v) => String(round2(num(v))).replace(/\.0+$/, '')

/** { main, extra } — главното изречение и (по избор) уточнение за периода/повторението. */
export function describePackage(pkg, locale = 'bg-BG') {
  let main = ''
  if (pkg.kind === 'free_nights') {
    const paid = int(pkg.paid_nights)
    const total = paid + int(pkg.free_nights)
    main = `Платете ${paid} ${nightsWord(paid)}, останете ${total} ${nightsWord(total)}`
  } else if (pkg.kind === 'percent_off') {
    const n = int(pkg.min_nights)
    main = `−${pct(pkg.percent)}% при престой от ${n} ${nightsWord(n)} нагоре`
  } else if (pkg.kind === 'fixed_price') {
    const n = int(pkg.fixed_nights)
    main = `${n} ${nightsWord(n)} за ${pct(pkg.fixed_total)} €`
  } else if (pkg.kind === 'early_bird') {
    const d = int(pkg.days_before)
    main = `−${pct(pkg.percent)}% при резервация поне ${d} ${daysWord(d)} по-рано`
  } else if (pkg.kind === 'last_minute') {
    const d = int(pkg.days_before)
    main = d === 0 ? `−${pct(pkg.percent)}% при настаняване днес` : `−${pct(pkg.percent)}% при настаняване до ${d} ${daysWord(d)} от днес`
  }
  const extra = []
  if (pkg.kind === 'free_nights' && pkg.repeat_block) extra.push('за всеки пълен блок')
  if (pkg.kind === 'fixed_price' && pkg.checkin_weekday !== '' && pkg.checkin_weekday != null) {
    const wd = formatDate(locale, new Date(Date.UTC(2001, 0, int(pkg.checkin_weekday))), { weekday: 'long', timeZone: 'UTC' })
    extra.push(`настаняване в ${wd}`)
  }
  return { main, extra }
}
