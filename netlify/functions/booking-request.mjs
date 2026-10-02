import { handleBookingRequest } from '../../src/lib/bookingRequestServer.js'

export default async (request, context) => {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let payload
  try {
    payload = await request.json()
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Невалидни данни.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const result = await handleBookingRequest({
    payload,
    ip: context.ip,
    supabaseUrl: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  })

  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const config = { path: '/api/booking-request' }
