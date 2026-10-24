import { formatDate, monthName } from './localeDates.js'

/**
 * Сезонни цени — чиста логика (без Supabase, тества се с node). Сезонът е „от ден/месец до ден/месец“
 * и се повтаря всяка година; ако началото е след края (1 ноември → 31 март), минава през Нова година.
 * Огледало на SQL функцията season_covers (миграция 014) — scripts/test-seasons.mjs пази двете да казват същото.
 *
 * Ред на цената за нощ: правило за конкретни дати → сезон (при застъпване печели по-новият) → основна цена.
 */

/** Дните във всеки месец; февруари е 29 — 29.02 е позволен като дата на сезон (има го във високосна година). */
export const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/** Бързи начала за най-честите сезони (бутоните „+ Зима“, „+ Лято“). */
export const SEASON_PRESETS = [
  { key: 'winter', name: 'Зима', start_month: 11, start_day: 1, end_month: 3, end_day: 31 },
  { key: 'summer', name: 'Лято', start_month: 6, start_day: 1, end_month: 9, end_day: 30 },
]

const md = (month, day) => month * 100 + day
const int = (v) => (v === '' || v == null ? NaN : Math.trunc(Number(v)))

/** Празен сезон за формата; preset (по ключ) предварително попълва периода и името. */
export function emptySeason(presetKey) {
  const p = SEASON_PRESETS.find((x) => x.key === presetKey)
  return {
    key: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2),
    id: null,
    name: p?.name ?? '',
    start_month: p?.start_month ?? 1,
    start_day: p?.start_day ?? 1,
    end_month: p?.end_month ?? 12,
    end_day: p?.end_day ?? 31,
    price_per_night: '',
    min_nights: 1,
    created_at: null,
  }
}

/** Ред от базата → ред за формата (числата стават низове за полетата). */
export function toDraft(row) {
  return {
    key: row.id,
    id: row.id,
    name: row.name ?? '',
    start_month: row.start_month,
    start_day: row.start_day,
    end_month: row.end_month,
    end_day: row.end_day,
    price_per_night: row.price_per_night == null ? '' : String(Number(row.price_per_night)),
    min_nights: row.min_nights ?? 1,
    created_at: row.created_at ?? null,
  }
}

/** Ред от формата → какво се праща в базата. */
export function toPayload(draft, propertyId) {
  return {
    property_id: propertyId,
    name: draft.name.trim() || null,
    start_month: int(draft.start_month),
    start_day: int(draft.start_day),
    end_month: int(draft.end_month),
    end_day: int(draft.end_day),
    price_per_night: Number(draft.price_per_night),
    min_nights: int(draft.min_nights) || 1,
  }
}

/** Едно и също ли е съдържанието на два реда/чернови (без ключ и дата на създаване) — за да се записва само променено. */
export function sameSeason(a, b) {
  return (
    (a.name ?? '').trim() === (b.name ?? '').trim() &&
    int(a.start_month) === int(b.start_month) &&
    int(a.start_day) === int(b.start_day) &&
    int(a.end_month) === int(b.end_month) &&
    int(a.end_day) === int(b.end_day) &&
    Number(a.price_per_night) === Number(b.price_per_night) &&
    int(a.min_nights) === int(b.min_nights)
  )
}

/** Съобщение за грешка или null, ако сезонът е наред. */
export function validateSeason(s) {
  const sm = int(s.start_month)
  const sd = int(s.start_day)
  const em = int(s.end_month)
  const ed = int(s.end_day)
  if (![sm, em].every((m) => m >= 1 && m <= 12)) return 'Изберете месец.'
  if (![sd, ed].every((d) => d >= 1)) return 'Въведете ден от месеца.'
  if (sd > DAYS_IN_MONTH[sm - 1]) return `В този месец няма ${sd}-и ден (началото на сезона).`
  if (ed > DAYS_IN_MONTH[em - 1]) return `В този месец няма ${ed}-и ден (краят на сезона).`
  const price = Number(s.price_per_night)
  if (s.price_per_night === '' || !(price > 0)) return 'Въведете цена на нощувка (положително число).'
  if (!(int(s.min_nights) >= 1)) return 'Минималният престой е поне 1 нощувка.'
  if (s.name && s.name.trim().length > 60) return 'Името на сезона е до 60 знака.'
  return null
}

/** Покрива ли сезонът дадена дата ('YYYY-MM-DD') — само ден и месец, годината не се гледа. */
export function seasonCovers(s, iso) {
  const day = md(Number(iso.slice(5, 7)), Number(iso.slice(8, 10)))
  const start = md(int(s.start_month), int(s.start_day))
  const end = md(int(s.end_month), int(s.end_day))
  return start <= end ? day >= start && day <= end : day >= start || day <= end
}

/** Сезонът за дата: при застъпване печели по-новият (created_at; чернова без дата — по-късната в списъка). */
export function seasonForDay(seasons, iso) {
  let best = null
  let bestIdx = -1
  seasons.forEach((s, i) => {
    if (!seasonCovers(s, iso)) return
    const newer = best == null || (s.created_at ?? '9999') > (best.created_at ?? '9999') || ((s.created_at ?? '9999') === (best.created_at ?? '9999') && i > bestIdx)
    if (newer) {
      best = s
      bestIdx = i
    }
  })
  return best
}

/** Всички дни на годината (във високосна, 366), които сезонът покрива — като числа месец*100+ден. */
export function seasonDayKeys(s) {
  const keys = []
  for (let m = 1; m <= 12; m++) {
    for (let d = 1; d <= DAYS_IN_MONTH[m - 1]; d++) {
      const iso = `2000-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      if (seasonCovers(s, iso)) keys.push(md(m, d))
    }
  }
  return keys
}

/** Дали два сезона се застъпват в поне един ден. */
export function seasonsOverlap(a, b) {
  const set = new Set(seasonDayKeys(a))
  return seasonDayKeys(b).some((k) => set.has(k))
}

/** Колко дни от годината (от 366) не са покрити от никой сезон — за тях важи основната цена. */
export function uncoveredDays(seasons) {
  const covered = new Set()
  for (const s of seasons) for (const k of seasonDayKeys(s)) covered.add(k)
  return 366 - covered.size
}

/** Най-ниската положителна цена — за „от X €“ в заглавието на страницата за гости. */
export function lowestPrice(basePrice, seasons) {
  const prices = [Number(basePrice), ...seasons.map((s) => Number(s.price_per_night))].filter((p) => p > 0)
  return prices.length ? Math.min(...prices) : 0
}

/** Сезоните, с които даден сезон се застъпва (за предупреждение във формата). */
export function overlappingSeasons(season, all) {
  return all.filter((o) => o !== season && o.key !== season.key && seasonsOverlap(season, o))
}

/* ---------- показване ---------- */

/** „1 ноември“ на даден език (Intl; година 2000 е високосна, та 29 февруари да се показва). */
export function dayMonthLabel(month, day, locale = 'bg-BG') {
  return formatDate(locale, new Date(Date.UTC(2000, int(month) - 1, int(day))), { day: 'numeric', month: 'long', timeZone: 'UTC' })
}

/** „1 ноември – 31 март“. */
export function seasonRangeLabel(s, locale = 'bg-BG') {
  return `${dayMonthLabel(s.start_month, s.start_day, locale)} – ${dayMonthLabel(s.end_month, s.end_day, locale)}`
}

/** Името на месеца (за падащите списъци): „ноември“. */
export function monthLabel(month, locale = 'bg-BG') {
  return monthName(locale, month - 1, 'long')
}
