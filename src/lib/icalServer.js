/**
 * Сървърна логика за iCal endpoint-а.
 * Ползва се от два места:
 *   - Vite dev middleware (локална разработка)
 *   - Netlify функция (production)
 * Затова тук няма нито браузър-, нито Netlify-специфичен код.
 */
import { buildIcs } from './ical.js'

const ALLOWED_IMPORT_PROTOCOLS = ['http:', 'https:']

/**
 * Публичен iCal експорт: връща заетите периоди за имот по таен токен.
 * Извиква security definer функцията bookings_for_ical, която НЕ връща
 * лични данни на гостите.
 */
async function handleFeed({ token, supabaseUrl, supabaseKey }) {
  if (!/^[0-9a-f-]{36}$/i.test(token)) {
    return { status: 400, contentType: 'text/plain; charset=utf-8', body: 'Невалиден токен.' }
  }

  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/bookings_for_ical`, {
    method: 'POST',
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_token: token }),
  })

  if (!res.ok) {
    return {
      status: 502,
      contentType: 'text/plain; charset=utf-8',
      body: 'Календарът е временно недостъпен.',
    }
  }

  const rows = await res.json()

  // Непознат токен → празен, но валиден календар (не издаваме дали съществува).
  const calendarName = rows[0]?.property_name || 'StayFlow'

  const ics = buildIcs({
    calendarName: `${calendarName} — StayFlow`,
    events: rows.map((r) => ({
      uid: `${r.booking_id}@stayflow`,
      start: r.check_in,
      end: r.check_out,
      summary: 'Заето',
    })),
  })

  return {
    status: 200,
    contentType: 'text/calendar; charset=utf-8',
    body: ics,
    headers: { 'Cache-Control': 'public, max-age=300' },
  }
}

/**
 * CORS прокси за импорт: браузърът не може да чете чужд .ics директно.
 * Връща суровия текст, а парсването става в клиента.
 */
async function handleImport({ url }) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return { status: 400, contentType: 'text/plain; charset=utf-8', body: 'Невалиден адрес.' }
  }

  if (!ALLOWED_IMPORT_PROTOCOLS.includes(parsed.protocol)) {
    return { status: 400, contentType: 'text/plain; charset=utf-8', body: 'Позволени са само http(s) адреси.' }
  }

  let res
  try {
    res = await fetch(parsed.toString(), {
      headers: { 'User-Agent': 'StayFlow-PMS/1.0' },
      redirect: 'follow',
    })
  } catch {
    return { status: 502, contentType: 'text/plain; charset=utf-8', body: 'Календарът не може да бъде изтеглен.' }
  }

  if (!res.ok) {
    return {
      status: 502,
      contentType: 'text/plain; charset=utf-8',
      body: `Външният календар върна грешка ${res.status}.`,
    }
  }

  const text = await res.text()

  if (!text.includes('BEGIN:VCALENDAR')) {
    return {
      status: 422,
      contentType: 'text/plain; charset=utf-8',
      body: 'Адресът не връща валиден iCal календар.',
    }
  }

  return { status: 200, contentType: 'text/plain; charset=utf-8', body: text }
}

/** Единна входна точка: ?token= прави експорт, ?url= прави импорт. */
export async function handleIcalRequest({ token, url, supabaseUrl, supabaseKey }) {
  if (token) return handleFeed({ token, supabaseUrl, supabaseKey })
  if (url) return handleImport({ url })
  return {
    status: 400,
    contentType: 'text/plain; charset=utf-8',
    body: 'Липсва параметър token или url.',
  }
}
