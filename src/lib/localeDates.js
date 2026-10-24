/**
 * Дати и месеци на езика на страницата. Браузърите обикновено знаят македонски, но не всички (някои сборки на Chrome
 * нямат данните за „mk“ и тихо падат към български) — затова за македонски, ако Intl го няма, ползваме собствени имена.
 * За останалите езици (български, английски, гръцки, сръбски, румънски) е чист Intl.
 */

const MK = {
  months: ['јануари', 'февруари', 'март', 'април', 'мај', 'јуни', 'јули', 'август', 'септември', 'октомври', 'ноември', 'декември'],
  monthsShort: ['јан', 'фев', 'мар', 'апр', 'мај', 'јун', 'јул', 'авг', 'сеп', 'окт', 'ное', 'дек'],
  weekdays: ['недела', 'понеделник', 'вторник', 'среда', 'четврток', 'петок', 'сабота'], // от неделя (getDay)
  weekdaysShort: ['нед', 'пон', 'вто', 'сре', 'чет', 'пет', 'саб'],
}

const support = new Map()
const hasIntl = (locale) => {
  if (!support.has(locale)) support.set(locale, Intl.DateTimeFormat.supportedLocalesOf([locale]).length > 0)
  return support.get(locale)
}

/** Дали за този локал ползваме собствените имена (македонски без данни в Intl). */
export const usesOwnNames = (locale) => /^mk\b/i.test(locale) && !hasIntl(locale)

/**
 * Като new Intl.DateTimeFormat(locale, opts).format(date) за комбинациите, които ползва приложението:
 * weekday (long/short), day, month (long/short), year. timeZone: 'UTC' чете полетата като UTC.
 */
export function formatDate(locale, date, opts = {}) {
  if (!usesOwnNames(locale)) return new Intl.DateTimeFormat(locale, opts).format(date)
  const utc = opts.timeZone === 'UTC'
  const wd = utc ? date.getUTCDay() : date.getDay()
  const d = utc ? date.getUTCDate() : date.getDate()
  const m = utc ? date.getUTCMonth() : date.getMonth()
  const y = utc ? date.getUTCFullYear() : date.getFullYear()
  const parts = []
  if (opts.weekday) parts.push((opts.weekday === 'long' ? MK.weekdays : MK.weekdaysShort)[wd])
  const datePart = [opts.day && String(d), opts.month && (opts.month === 'long' ? MK.months : MK.monthsShort)[m], opts.year && String(y)].filter(Boolean).join(' ')
  if (datePart) parts.push(datePart)
  return parts.join(', ')
}

/** Името на месеца (0–11) в именителен падеж: „октомври“; short — „окт“ (без точка). */
export function monthName(locale, monthIndex, form = 'long') {
  if (usesOwnNames(locale)) return (form === 'long' ? MK.months : MK.monthsShort)[monthIndex]
  // месецът от формата „месец + година“ — само той е в именителен падеж на всеки език (самостоятелно гръцкото е родителен)
  const parts = new Intl.DateTimeFormat(locale, { month: form, year: 'numeric', timeZone: 'UTC' }).formatToParts(new Date(Date.UTC(2000, monthIndex, 1)))
  return (parts.find((p) => p.type === 'month')?.value ?? String(monthIndex + 1)).replace(/\.$/, '')
}

/** Кратко име на ден от седмицата; index 0 = понеделник … 6 = неделя; без точка накрая. */
export function weekdayShort(locale, index) {
  const date = new Date(Date.UTC(2024, 0, 1 + index)) // 1 януари 2024 е понеделник
  return formatDate(locale, date, { weekday: 'short', timeZone: 'UTC' }).replace(/\.$/, '')
}
