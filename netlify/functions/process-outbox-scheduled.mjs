import { processQueuedOutbox } from '../../src/lib/outboxProcessor.js'
import { generateAutoEntriesForAll, isDailyAutoEntriesWindow } from '../../src/lib/autoEntriesServer.js'

/**
 * Предпазна мрежа — на всеки 5 мин доставя всичко, пропуснато от
 * "веднага" опита в bookingRequestServer.js (напр. временен мрежов проблем).
 * Веднъж дневно (04:00 по София) пуска и генератора на автоматични
 * разходи/приходи за всеки собственик поотделно (миграция 012).
 * Няма `path` нарочно: Netlify не позволява scheduled функция да се вика по
 * URL, затова тук не трябва никаква отделна auth проверка — само
 * вътрешният Netlify scheduler може да я задейства.
 */
export default async () => {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  const result = await processQueuedOutbox({
    supabaseUrl,
    serviceKey,
    telegramToken: process.env.TELEGRAM_BOT_TOKEN,
    resendApiKey: process.env.RESEND_API_KEY,
    resendFrom: process.env.RESEND_FROM_EMAIL,
    appUrl: process.env.URL || 'http://localhost:5173',
    limit: 50,
  })

  // Грешка в генератора не бива да чупи доставката на известия (и обратно).
  let auto = null
  if (isDailyAutoEntriesWindow()) {
    try {
      auto = await generateAutoEntriesForAll({ supabaseUrl, serviceKey })
      console.log('auto-entries', JSON.stringify(auto))
    } catch (err) {
      console.log('auto-entries failed', String(err.message || err))
    }
  }

  return new Response(JSON.stringify({ ...result, auto }), {
    status: result.error ? 500 : 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const config = { schedule: '*/5 * * * *' }
