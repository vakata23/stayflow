import { processQueuedOutbox } from '../../src/lib/outboxProcessor.js'

/**
 * Предпазна мрежа — на всеки 5 мин доставя всичко, пропуснато от
 * "веднага" опита в bookingRequestServer.js (напр. временен мрежов проблем).
 * Няма `path` нарочно: Netlify не позволява scheduled функция да се вика по
 * URL, затова тук не трябва никаква отделна auth проверка — само
 * вътрешният Netlify scheduler може да я задейства.
 */
export default async () => {
  const result = await processQueuedOutbox({
    supabaseUrl: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    telegramToken: process.env.TELEGRAM_BOT_TOKEN,
    resendApiKey: process.env.RESEND_API_KEY,
    resendFrom: process.env.RESEND_FROM_EMAIL,
    appUrl: process.env.URL || 'http://localhost:5173',
    limit: 50,
  })

  return new Response(JSON.stringify(result), {
    status: result.error ? 500 : 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const config = { schedule: '*/5 * * * *' }
