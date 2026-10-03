import { processQueuedOutbox, verifyOwnerProfile } from '../../src/lib/outboxProcessor.js'

/**
 * Ръчно задействане — бутонът "Изпрати тестово" в /notifications. Изисква
 * JWT-то на логнатия собственик (Authorization: Bearer <access_token>) и
 * доставя само неговата опашка, не на другите собственици.
 *
 * Отделна от process-outbox-scheduled.mjs нарочно: Netlify не позволява
 * scheduled функция да се вика по URL, затова бутонът не може да я ползва.
 */
export default async (request) => {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')

  const profileId = await verifyOwnerProfile({ token, supabaseUrl, serviceKey })
  if (!profileId) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const result = await processQueuedOutbox({
    supabaseUrl,
    serviceKey,
    telegramToken: process.env.TELEGRAM_BOT_TOKEN,
    resendApiKey: process.env.RESEND_API_KEY,
    resendFrom: process.env.RESEND_FROM_EMAIL,
    appUrl: process.env.URL || 'http://localhost:5173',
    profileId,
    limit: 20,
  })

  return new Response(JSON.stringify(result), {
    status: result.error ? 500 : 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const config = { path: '/api/process-outbox' }
