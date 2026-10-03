/**
 * По един адаптер на канал — добавяне на канал е нов адаптер тук, не промяна
 * на outboxProcessor.js или схемата. И двата адаптера хвърлят Error с ясно
 * съобщение при грешка/липсваща конфигурация — processQueuedOutbox() го
 * хваща и го записва в outbox.last_error.
 */

export async function sendTelegram({ token, chatId, text }) {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN не е конфигуриран.')

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.ok) {
    throw new Error(`Telegram грешка: ${data?.description || res.status}`)
  }
}

export async function sendEmail({ apiKey, from, to, subject, html }) {
  if (!apiKey) throw new Error('RESEND_API_KEY не е конфигуриран.')
  if (!from) throw new Error('RESEND_FROM_EMAIL не е конфигуриран.')

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(`Имейл грешка: ${data?.message || res.status}`)
  }
}

/** Текст на известието по събитие + payload от outbox реда. */
export function formatNotification(event, payload, appUrl) {
  if (event === 'test') {
    return {
      subject: 'StayFlow — тестово известие',
      text: 'Тестово известие от StayFlow. Ако виждате това, каналът работи правилно.',
    }
  }

  if (event === 'new_booking_request') {
    const nights = Math.round(
      (new Date(payload.check_out) - new Date(payload.check_in)) / 86400000
    )
    const total = payload.quoted_total != null ? `${Number(payload.quoted_total).toFixed(2)} €` : '—'
    const lines = [
      `Нова заявка за резервация — ${payload.property_name || 'имот'}`,
      '',
      `Гост: ${payload.guest_name}`,
      `Дати: ${payload.check_in} → ${payload.check_out} (${nights} нощувки)`,
      `Гости: ${payload.num_guests}`,
      `Сума: ${total}`,
      '',
      `Прегледайте и отговорете: ${appUrl}/booking-requests`,
    ]
    return { subject: `Нова заявка — ${payload.property_name || 'StayFlow'}`, text: lines.join('\n') }
  }

  return { subject: 'StayFlow — известие', text: JSON.stringify(payload) }
}
