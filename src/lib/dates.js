export const MONTHS_BG = [
  'Януари', 'Февруари', 'Март', 'Април', 'Май', 'Юни',
  'Юли', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември',
]

// Седмицата започва в понеделник (българска конвенция).
export const WEEKDAYS_BG = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд']

/** Дата → 'YYYY-MM-DD' в локална часова зона (без UTC отместване). */
export function toISODate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 'YYYY-MM-DD' → Date в локална полунощ (без часовия отместващ капан на new Date(str)). */
export function fromISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function todayISO() {
  return toISODate(new Date())
}

export function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

/** 'YYYY-MM-DD' → '05.08.2026' */
export function formatDateBG(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

export function nightsBetween(checkInISO, checkOutISO) {
  const a = fromISODate(checkInISO)
  const b = fromISODate(checkOutISO)
  return Math.round((b - a) / 86400000)
}

/**
 * Връща масив от 42 дни (6 седмици × 7), покриващ целия месец
 * плюс граничните дни от съседните месеци.
 */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1)
  // getDay(): 0=неделя … 6=събота. Преобразуваме към 0=понеделник.
  const offset = (first.getDay() + 6) % 7
  const start = addDays(first, -offset)

  return Array.from({ length: 42 }, (_, i) => {
    const date = addDays(start, i)
    return {
      date,
      iso: toISODate(date),
      inMonth: date.getMonth() === month,
    }
  })
}

/** Дали резервация [ci, co) покрива дадения ден. */
export function bookingCoversDay(booking, dayISO) {
  return booking.check_in <= dayISO && dayISO < booking.check_out
}

/** Дали два периода [aIn, aOut) и [bIn, bOut) се припокриват. */
export function periodsOverlap(aIn, aOut, bIn, bOut) {
  return aIn < bOut && bIn < aOut
}
