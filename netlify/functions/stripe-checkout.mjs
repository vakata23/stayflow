import { createPaymentLink } from '../../src/lib/stripeServer.js'

/**
 * „Линк за плащане с карта“ — вика се от „Прати на госта“. Изисква JWT на влезлия собственик; сумата се смята на сървъра.
 * Нужни са STRIPE_SECRET_KEY и STRIPE_PROFILE_IDS (кои профили получават парите в тази сметка) в Netlify; без него отговаря 501 и приложението показва как да се свърже.
 */
export default async (request) => {
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  if (request.method !== 'POST') return json(405, { ok: false, error: 'Method not allowed' })

  let payload
  try {
    payload = await request.json()
  } catch {
    return json(400, { ok: false, error: 'Невалидни данни.' })
  }

  const result = await createPaymentLink({
    token: (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''),
    bookingId: payload?.booking_id,
    kind: payload?.kind,
    supabaseUrl: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    stripeKey: process.env.STRIPE_SECRET_KEY,
    allowedProfiles: process.env.STRIPE_PROFILE_IDS,
    appUrl: process.env.URL || 'http://localhost:5173',
  })
  return json(result.status, result.body)
}

export const config = { path: '/api/stripe-checkout' }
