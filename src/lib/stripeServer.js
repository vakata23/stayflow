/**
 * Плащане с карта през Stripe Checkout — само сървърна част (Netlify функции), без пакета „stripe“: говори с REST API-то му.
 *   • createPaymentLink — собственикът иска линк за капаро/остатък; сумата се смята ТУК от базата, не идва от браузъра;
 *   • handleStripeWebhook — Stripe съобщава „платено“; проверяваме подписа и записваме плащане по резервацията.
 * Картата се въвежда само на страницата на Stripe — StayFlow не вижда и не пази картови данни; парите отиват в сметката на собственика.
 * Без STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET функциите отговарят 501 „не е свързан“ и приложението работи както преди.
 * Тества се в scripts/test-stripe.mjs (подменен fetch, без мрежа).
 */
import crypto from 'node:crypto'
import { verifyOwnerProfile } from './outboxProcessor.js'
import { paidTotal } from './guestConfirm.js'

export const MIN_CENTS = 50 // под това Stripe не приема плащане в евро
export const LINK_HOURS = 23 // Checkout сесията живее най-много 24 часа
const PLATFORMS = new Set(['airbnb', 'booking']) // гостът им плаща на платформата, не на собственика
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const cents = (v) => Math.round(Number(v) * 100)
const money = (c) => Math.round(c) / 100
const reply = (status, body) => ({ status, body })

/** Само таен ключ (sk_/rk_) — публичният pk_ ключ по грешка не върши работа и не бива да се приема. */
export const isSecretKey = (k) => /^(sk|rk)_(test|live)_[A-Za-z0-9]{10,}$/.test(String(k ?? ''))
/** „id1, id2“ → [id1, id2] (само валидни идентификатори). */
export const parseProfileIds = (v) => String(v ?? '').split(',').map((x) => x.trim().toLowerCase()).filter((x) => UUID_RE.test(x))
export const keyMode = (k) => (/^(sk|rk)_test_/.test(String(k ?? '')) ? 'test' : 'live')

/**
 * Каква сума да поиска линкът. booking: { total_price, tourist_tax, source, status }, depositPct: % капаро от имота (по подразбиране 30),
 * payments: [{ kind, amount }]. Връща { ok, kind, cents } или { ok:false, reason }.
 */
export function planPayment({ booking, depositPct, payments = [], kind }) {
  if (kind !== 'deposit' && kind !== 'balance') return { ok: false, reason: 'kind' }
  if (!booking) return { ok: false, reason: 'missing' }
  if (booking.status === 'cancelled') return { ok: false, reason: 'cancelled' }
  if (PLATFORMS.has(booking.source)) return { ok: false, reason: 'platform' }
  if (booking.total_price == null || booking.total_price === '') return { ok: false, reason: 'no_price' }
  const total = cents(booking.total_price) + cents(booking.tourist_tax ?? 0)
  const paid = cents(paidTotal(payments))
  const left = Math.max(0, total - paid)
  let want = left
  if (kind === 'deposit') {
    const pct = Number.isFinite(Number(depositPct)) && Number(depositPct) > 0 ? Math.min(100, Number(depositPct)) : 30
    want = Math.min(left, Math.max(0, Math.round((total * pct) / 100) - paid))
  }
  if (want < MIN_CENTS) return { ok: false, reason: 'nothing_due' }
  return { ok: true, kind, cents: want }
}

const REASONS = {
  kind: 'Невалиден вид плащане.',
  missing: 'Резервацията не е намерена.',
  cancelled: 'Резервацията е отказана — няма какво да се плаща.',
  platform: 'Гостът плаща през Airbnb/Booking.com, не при вас.',
  no_price: 'Резервацията няма въведена цена.',
  nothing_due: 'Няма дължима сума за този вид плащане (вече е платено или е под 0,50 €).',
}

async function rest(path, { supabaseUrl, serviceKey, method = 'GET', body, headers }) {
  return fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method,
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', ...(headers ?? {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
}

/** { token, bookingId, kind } → { status, body: { ok, url, amount, kind, mode } } */
export async function createPaymentLink({ token, bookingId, kind, supabaseUrl, serviceKey, stripeKey, appUrl, allowedProfiles, now = Date.now() }) {
  if (!stripeKey) return reply(501, { ok: false, configured: false, error: 'Плащането с карта още не е свързано (липсва ключ на Stripe).' })
  if (!isSecretKey(stripeKey)) return reply(501, { ok: false, configured: false, error: 'Ключът на Stripe не е верен — трябва да започва със sk_test_ или sk_live_.' })
  if (!supabaseUrl || !serviceKey) return reply(500, { ok: false, error: 'Сървърът не е конфигуриран.' })
  if (!UUID_RE.test(String(bookingId ?? ''))) return reply(400, { ok: false, error: 'Невалидна резервация.' })

  const profileId = await verifyOwnerProfile({ token, supabaseUrl, serviceKey })
  if (!profileId) return reply(401, { ok: false, error: 'Влезте отново в профила си.' })
  // Ключът на Stripe е един за целия сайт и парите отиват в НЕГОВАТА сметка — затова линк могат да правят само профилите,
  // чийто собственик е свързал ключа (STRIPE_PROFILE_IDS). Празен/липсващ списък = никой, не „всички“.
  if (!parseProfileIds(allowedProfiles).includes(profileId)) return reply(403, { ok: false, error: 'Плащането с карта не е включено за вашия профил.' })

  const ctx = { supabaseUrl, serviceKey }
  const bRes = await rest(`bookings?id=eq.${bookingId}&select=id,property_id,guest_email,check_in,check_out,total_price,tourist_tax,source,status`, ctx)
  const booking = bRes.ok ? (await bRes.json())[0] : null
  const pRes = booking ? await rest(`properties?id=eq.${booking.property_id}&select=id,owner_id,name`, ctx) : null
  const property = pRes?.ok ? (await pRes.json())[0] : null
  // чужда или несъществуваща резервация — един и същ отговор, да не се издава коя съществува
  if (!booking || !property || property.owner_id !== profileId) return reply(404, { ok: false, error: REASONS.missing })

  const [sRes, payRes] = await Promise.all([
    rest(`property_settings?property_id=eq.${property.id}&select=deposit_pct`, ctx),
    rest(`payments?booking_id=eq.${booking.id}&select=kind,amount`, ctx),
  ])
  if (!payRes.ok) return reply(500, { ok: false, error: 'Неуспешно четене на плащанията.' })
  const settings = sRes.ok ? (await sRes.json())[0] : null
  const plan = planPayment({ booking, depositPct: settings?.deposit_pct, payments: await payRes.json(), kind })
  if (!plan.ok) return reply(422, { ok: false, error: REASONS[plan.reason], reason: plan.reason })

  const title = `${kind === 'deposit' ? 'Капаро' : 'Плащане'} — ${property.name}, ${booking.check_in} – ${booking.check_out}`
  const form = new URLSearchParams({
    mode: 'payment',
    locale: 'auto',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'eur',
    'line_items[0][price_data][unit_amount]': String(plan.cents),
    'line_items[0][price_data][product_data][name]': title.slice(0, 250),
    'metadata[booking_id]': booking.id,
    'metadata[kind]': kind,
    'payment_intent_data[metadata][booking_id]': booking.id,
    'payment_intent_data[metadata][kind]': kind,
    'payment_intent_data[description]': title.slice(0, 250),
    client_reference_id: booking.id,
    success_url: `${appUrl}/guest/${property.id}?paid=1`,
    cancel_url: `${appUrl}/guest/${property.id}`,
    expires_at: String(Math.floor(now / 1000) + LINK_HOURS * 3600),
  })
  if (booking.guest_email) form.set('customer_email', booking.guest_email)

  let res
  try {
    res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    })
  } catch {
    return reply(502, { ok: false, error: 'Няма връзка със Stripe. Опитайте пак.' })
  }
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.url) return reply(502, { ok: false, error: `Stripe отказа: ${String(data?.error?.message ?? res.status).slice(0, 200)}` })
  return reply(200, { ok: true, url: data.url, amount: money(plan.cents), kind, mode: keyMode(stripeKey), expires_hours: LINK_HOURS })
}

/** Stripe-Signature: „t=…,v1=…“. HMAC-SHA256 над „t.тяло“; отхвърля стар (над 5 мин) или подправен подпис. */
export function verifyStripeSignature(rawBody, header, secret, nowSec = Math.floor(Date.now() / 1000), toleranceSec = 300) {
  if (!rawBody || !header || !secret) return false
  const parts = String(header).split(',').map((p) => p.trim().split('='))
  const t = parts.find(([k]) => k === 't')?.[1]
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v)
  if (!t || !sigs.length || !Number.isFinite(Number(t)) || Math.abs(nowSec - Number(t)) > toleranceSec) return false
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex')
  const a = Buffer.from(expected)
  return sigs.some((s) => {
    const b = Buffer.from(String(s))
    return a.length === b.length && crypto.timingSafeEqual(a, b)
  })
}

const PAID_EVENTS = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded'])

/** Връща { status, body }. 200 и при „не за нас“ събития (иначе Stripe ги праща отново), 500 само при наша грешка при запис. */
export async function handleStripeWebhook({ rawBody, signature, webhookSecret, supabaseUrl, serviceKey, nowSec }) {
  if (!webhookSecret) return reply(501, { ok: false, configured: false, error: 'STRIPE_WEBHOOK_SECRET не е зададен.' })
  if (!verifyStripeSignature(rawBody, signature, webhookSecret, nowSec)) return reply(400, { ok: false, error: 'Невалиден подпис.' })
  if (!supabaseUrl || !serviceKey) return reply(500, { ok: false, error: 'Сървърът не е конфигуриран.' })

  let event
  try {
    event = JSON.parse(rawBody)
  } catch {
    return reply(400, { ok: false, error: 'Невалидни данни.' })
  }
  if (!PAID_EVENTS.has(event?.type)) return reply(200, { ok: true, ignored: event?.type ?? 'unknown' })

  const s = event.data?.object ?? {}
  const bookingId = s.metadata?.booking_id
  if (s.payment_status !== 'paid') return reply(200, { ok: true, ignored: 'not_paid' })
  if (!UUID_RE.test(String(bookingId ?? ''))) return reply(200, { ok: true, ignored: 'no_booking' })
  if (String(s.currency ?? '').toLowerCase() !== 'eur' || !Number.isInteger(s.amount_total) || s.amount_total <= 0) return reply(200, { ok: true, ignored: 'amount' })

  const ctx = { supabaseUrl, serviceKey }
  const bRes = await rest(`bookings?id=eq.${bookingId}&select=id`, ctx)
  if (!bRes.ok) return reply(500, { ok: false, error: 'Неуспешно четене на резервацията.' })
  if (!(await bRes.json()).length) return reply(200, { ok: true, ignored: 'booking_gone' })

  const ref = String(s.payment_intent || s.id)
  const exRes = await rest(`payments?external_ref=eq.${encodeURIComponent(ref)}&select=id`, ctx)
  if (!exRes.ok) return reply(500, { ok: false, error: 'Неуспешна проверка за повторение.' })
  if ((await exRes.json()).length) return reply(200, { ok: true, duplicate: true })

  const ins = await rest('payments', {
    ...ctx,
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: {
      booking_id: bookingId,
      kind: s.metadata?.kind === 'deposit' ? 'deposit' : 'balance',
      amount: money(s.amount_total),
      method: 'stripe',
      external_ref: ref,
      note: 'Платено с карта през Stripe',
    },
  })
  if (!ins.ok) return reply(500, { ok: false, error: 'Неуспешен запис на плащането.' })

  // две доставки на едно и също събитие едновременно: оставя се най-старото, останалите се махат
  const again = await rest(`payments?external_ref=eq.${encodeURIComponent(ref)}&select=id,paid_at&order=paid_at.asc,id.asc`, ctx)
  if (again.ok) {
    const rows = await again.json()
    for (const extra of rows.slice(1)) await rest(`payments?id=eq.${extra.id}`, { ...ctx, method: 'DELETE' })
  }
  return reply(200, { ok: true, recorded: true })
}
