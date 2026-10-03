/**
 * Telegram не казва на собственика кой е техният chat_id сам. Вместо трета
 * страна (напр. @userinfobot), ботът на StayFlow си отговаря сам: собственикът
 * пише му каквото и да е, ботът връща Chat ID-то, което да постави в
 * /notifications. Без състояние — не пише в базата.
 *
 * secret_token пази адреса от чужди/фалшиви POST-ове, представящи се за
 * Telegram — Telegram го връща непроменен в заглавката при всяка истинска
 * доставка (https://core.telegram.org/bots/api#setwebhook).
 *
 * Еднократна настройка след деплой (от собственика/студиото):
 *   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<сайта>/api/telegram-webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>"
 */
export default async (request) => {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET
  const gotSecret = request.headers.get('x-telegram-bot-api-secret-token')
  if (expectedSecret && gotSecret !== expectedSecret) {
    return new Response('Unauthorized', { status: 401 })
  }

  let update
  try {
    update = await request.json()
  } catch {
    return new Response('ok')
  }

  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = update?.message?.chat?.id
  if (token && chatId) {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `Вашето Chat ID: ${chatId}\n\nПоставете го в StayFlow → Известия → Telegram.`,
      }),
    }).catch(() => {})
  }

  return new Response('ok')
}

export const config = { path: '/api/telegram-webhook' }
