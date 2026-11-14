/**
 * Търсене на гост в „Резервации“: по име, телефон или имейл.
 *  - думите са независими и всички трябва да се срещат („иван петров“ намира „Петров, Иван“);
 *  - без значение главни/малки букви и без значение интервали в телефона: „0888 12 34 56“ = „+359 888 123456“;
 *  - „888123“ (поне 3 цифри) се търси в цифрите на телефона; „0888…“ и „+359 888…“ са един и същ номер.
 * Чиста логика без браузър и без база (тества се в scripts/test-usability.mjs).
 */

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Само цифрите на номера; водещо 359 (код на България) става 0, за да съвпадат двата записа. */
export function phoneDigits(value) {
  const raw = String(value ?? '').trim()
  let d = raw.replace(/\D/g, '')
  if (/^\+\s*359/.test(raw)) d = '0' + d.slice(3)
  if (d.startsWith('00359')) d = '0' + d.slice(5)
  else if (d.startsWith('359') && d.length > 9) d = '0' + d.slice(3)
  return d
}

/** Разбива заявката на думи. */
export function searchTokens(query) {
  return norm(query).split(/\s+/).filter(Boolean)
}

const isNumeric = (t) => /^[\d+()\-.]+$/.test(t)

export function matchesBooking(booking, tokens) {
  if (!tokens.length) return true
  const text = norm(`${booking.guest_name ?? ''} ${booking.guest_email ?? ''}`)
  const digits = phoneDigits(booking.guest_phone)
  // Съседни числа („888 123“, „55 44“) се слепват в един номер, иначе интервалите в телефона пречат.
  const groups = []
  for (const t of tokens) {
    const last = groups[groups.length - 1]
    if (isNumeric(t) && last && last.numeric) {
      last.parts.push(t)
    } else {
      groups.push({ numeric: isNumeric(t), parts: [t] })
    }
  }
  return groups.every((g) => {
    if (!g.numeric) return text.includes(g.parts[0])
    if (g.parts.every((t) => text.includes(t))) return true
    const joined = g.parts.join('')
    // „+359“/„00359“ докато още се пише: всеки български номер (записан като +359… или 0…) го съдържа
    if (/^(\+|00)359$/.test(joined)) return digits.startsWith('0')
    const q = phoneDigits(joined)
    return q.length >= 3 && digits.includes(q)
  })
}

export function searchBookings(bookings, query) {
  const tokens = searchTokens(query)
  if (!tokens.length) return bookings
  return bookings.filter((b) => matchesBooking(b, tokens))
}
