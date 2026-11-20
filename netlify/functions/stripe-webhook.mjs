import { handleStripeWebhook } from '../../src/lib/stripeServer.js'

/**
 * Stripe вика този адрес, когато гост е платил. Подписът (STRIPE_WEBHOOK_SECRET) се проверява върху суровото тяло,
 * затова тялото се чете като текст, не като JSON. Записва плащането в резервацията; повторна доставка не го удвоява.
 */
export default async (request) => {
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  if (request.method !== 'POST') return json(405, { ok: false, error: 'Method not allowed' })

  const result = await handleStripeWebhook({
    rawBody: await request.text(),
    signature: request.headers.get('stripe-signature'),
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    supabaseUrl: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  })
  return json(result.status, result.body)
}

export const config = { path: '/api/stripe-webhook' }
