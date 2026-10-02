/**
 * Сървърна логика за приемане на заявки от гости (/api/booking-request).
 * Ползва се от два места, точно като icalServer.js:
 *   - Vite dev middleware (локална разработка)
 *   - Netlify функция (production), със SERVICE ROLE ключ
 *
 * Пише директно в booking_requests през PostgREST със service role —
 * таблицата няма insert policy за anon/authenticated нарочно (виж
 * миграция 006), затова това е ЕДИНСТВЕНИЯТ път за запис.
 */

const SLUG_RE = /^[a-z0-9-]{2,40}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_REQUESTS_PER_IP_PER_HOUR = 5

function clampStr(value, maxLen) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, maxLen)
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

async function supaFetch(path, { supabaseUrl, serviceKey, method = 'GET', body, extraHeaders }) {
  return fetch(`${supabaseUrl}${path}`, {
    method,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...(extraHeaders || {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}

/**
 * payload идва директно от гост формата (ненадежден вход — валидира се
 * всичко). ip е клиентският адрес (за rate-limit), може да липсва.
 */
export async function handleBookingRequest({ payload, ip, supabaseUrl, serviceKey }) {
  if (!supabaseUrl || !serviceKey) {
    return { status: 500, body: { ok: false, error: 'Сървърът не е конфигуриран.' } }
  }
  if (!payload || typeof payload !== 'object') {
    return { status: 400, body: { ok: false, error: 'Невалидни данни.' } }
  }

  // Honeypot: скрито поле, което истински посетител никога не попълва.
  // Бот го попълва — преструваме се на успех, без да пишем нищо.
  if (clampStr(payload.company, 100)) {
    return { status: 200, body: { ok: true } }
  }

  const slug = slugifyInput(payload.slug)
  const checkIn = payload.check_in
  const checkOut = payload.check_out
  const numGuests = Number(payload.num_guests)
  const guestName = clampStr(payload.guest_name, 200)
  const guestPhone = clampStr(payload.guest_phone, 50)
  const guestEmail = clampStr(payload.guest_email, 200)
  const message = clampStr(payload.message, 2000)

  if (!slug || !SLUG_RE.test(slug)) {
    return { status: 400, body: { ok: false, error: 'Невалиден имот.' } }
  }
  if (!DATE_RE.test(checkIn) || !DATE_RE.test(checkOut) || checkOut <= checkIn) {
    return { status: 400, body: { ok: false, error: 'Невалидни дати.' } }
  }
  if (!Number.isFinite(numGuests) || numGuests < 1 || numGuests > 50) {
    return { status: 400, body: { ok: false, error: 'Невалиден брой гости.' } }
  }
  if (!guestName) {
    return { status: 400, body: { ok: false, error: 'Името е задължително.' } }
  }
  if (!guestPhone && !guestEmail) {
    return { status: 400, body: { ok: false, error: 'Въведете телефон или имейл за връзка.' } }
  }
  if (guestEmail && !isValidEmail(guestEmail)) {
    return { status: 400, body: { ok: false, error: 'Невалиден имейл адрес.' } }
  }

  // Лимит на заявките — най-много няколко на час от един и същ адрес.
  if (ip) {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const rateRes = await supaFetch(
      `/rest/v1/booking_requests?ip_address=eq.${encodeURIComponent(ip)}&created_at=gte.${encodeURIComponent(since)}&select=id`,
      { supabaseUrl, serviceKey }
    )
    if (rateRes.ok) {
      const rows = await rateRes.json()
      if (rows.length >= MAX_REQUESTS_PER_IP_PER_HOUR) {
        return { status: 429, body: { ok: false, error: 'Твърде много заявки. Опитайте отново по-късно.' } }
      }
    }
  }

  // Имотът трябва да съществува и да е публикуван — service role виждa
  // id-то директно (RLS е без значение тук), но то НИКОГА не се връща.
  const propRes = await supaFetch(
    `/rest/v1/properties?slug=eq.${encodeURIComponent(slug)}&is_listed=eq.true&select=id`,
    { supabaseUrl, serviceKey }
  )
  if (!propRes.ok) return { status: 502, body: { ok: false, error: 'Временен проблем. Опитайте отново.' } }
  const props = await propRes.json()
  const propertyId = props[0]?.id
  if (!propertyId) {
    return { status: 404, body: { ok: false, error: 'Имотът не е намерен.' } }
  }

  // Цена и наличност — проверени НАНОВО на сървъра. Никога не се доверяваме
  // на цена, изпратена от клиента.
  const quoteRes = await supaFetch('/rest/v1/rpc/quote_stay', {
    supabaseUrl,
    serviceKey,
    method: 'POST',
    body: { p_slug: slug, p_check_in: checkIn, p_check_out: checkOut, p_guests: numGuests },
  })
  if (!quoteRes.ok) return { status: 502, body: { ok: false, error: 'Временен проблем. Опитайте отново.' } }
  const quotes = await quoteRes.json()
  const quote = quotes[0]

  if (!quote) {
    return { status: 400, body: { ok: false, error: 'Този период не е наличен (датата може да е в миналото).' } }
  }
  if (!quote.is_available) {
    return { status: 409, body: { ok: false, error: 'Тези дати вече не са свободни.' } }
  }
  if (!quote.fits_guests) {
    return { status: 400, body: { ok: false, error: 'Твърде много гости за този имот.' } }
  }
  if (quote.nights < quote.min_nights) {
    return {
      status: 400,
      body: { ok: false, error: `Минималният престой за тези дати е ${quote.min_nights} нощувки.` },
    }
  }

  const insertRes = await supaFetch('/rest/v1/booking_requests', {
    supabaseUrl,
    serviceKey,
    method: 'POST',
    extraHeaders: { Prefer: 'return=minimal' },
    body: {
      property_id: propertyId,
      check_in: checkIn,
      check_out: checkOut,
      num_guests: numGuests,
      guest_name: guestName,
      guest_phone: guestPhone,
      guest_email: guestEmail,
      message,
      quoted_total: quote.total,
      quoted_deposit: quote.deposit,
      ip_address: ip || null,
    },
  })
  if (!insertRes.ok) {
    return { status: 502, body: { ok: false, error: 'Неуспешно записване. Опитайте отново.' } }
  }

  return { status: 200, body: { ok: true } }
}

function slugifyInput(value) {
  return clampStr(value, 40)?.toLowerCase() ?? null
}
