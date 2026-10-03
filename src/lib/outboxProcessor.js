/**
 * Обработва "queued" редове от outbox — ползва се от два места, точно като
 * bookingRequestServer.js:
 *   - вика се веднага (best-effort, в процеса) след успешна заявка, за да
 *     стигне известието до собственика незабавно
 *   - Netlify scheduled функция (process-outbox-scheduled.mjs) го пуска на
 *     няколко минути като предпазна мрежа за всичко неуспешно от първия опит
 *   - Netlify функция с path (process-outbox.mjs), зад JWT auth — бутонът
 *     "Изпрати тестово" в /notifications
 *
 * Чете/пише през PostgREST със service role, както booking-request.
 */
import { sendTelegram, sendEmail, formatNotification } from './notificationAdapters.js'

const MAX_ATTEMPTS = 5

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

async function dispatch(row, { telegramToken, resendApiKey, resendFrom, appUrl }) {
  const { subject, text } = formatNotification(row.event, row.payload, appUrl)

  if (row.channel === 'telegram') {
    return sendTelegram({ token: telegramToken, chatId: row.recipient, text })
  }
  if (row.channel === 'email') {
    const html = text.split('\n').map((line) => (line ? `<p>${line}</p>` : '')).join('\n')
    return sendEmail({ apiKey: resendApiKey, from: resendFrom, to: row.recipient, subject, html })
  }
  throw new Error(`Няма адаптер за канал "${row.channel}" (все още).`)
}

/**
 * Проверява JWT-то на повикващия (Authorization: Bearer <access_token> от
 * supabase-js сесията) през Supabase Auth и връща profiles.id на собственика,
 * или null ако токенът липсва/е невалиден/няма профил. Ползва се от
 * /api/process-outbox (ръчното "Изпрати тестово"), за да не може анонимен
 * да задейства доставка или да пипа чужда опашка.
 */
export async function verifyOwnerProfile({ token, supabaseUrl, serviceKey }) {
  if (!token || !supabaseUrl || !serviceKey) return null

  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: serviceKey },
  })
  if (!userRes.ok) return null
  const user = await userRes.json()
  if (!user?.id) return null

  const profRes = await supaFetch(`/rest/v1/profiles?user_id=eq.${user.id}&select=id`, {
    supabaseUrl,
    serviceKey,
  })
  if (!profRes.ok) return null
  const profiles = await profRes.json()
  return profiles[0]?.id ?? null
}

/**
 * config: { supabaseUrl, serviceKey, telegramToken, resendApiKey, resendFrom,
 *           appUrl, limit?, profileId? }
 * profileId стеснява до редовете на един собственик — ползва се за "изпрати
 * веднага" след реална заявка/тест, без да пипа опашката на другите.
 */
export async function processQueuedOutbox(config) {
  const { supabaseUrl, serviceKey, limit = 20, profileId } = config
  if (!supabaseUrl || !serviceKey) {
    return { processed: 0, sent: 0, failed: 0, error: 'Сървърът не е конфигуриран.' }
  }

  let path = `/rest/v1/outbox?status=eq.queued&attempts=lt.${MAX_ATTEMPTS}&order=created_at.asc&limit=${limit}`
  if (profileId) path += `&profile_id=eq.${encodeURIComponent(profileId)}`

  const listRes = await supaFetch(path, { supabaseUrl, serviceKey })
  if (!listRes.ok) return { processed: 0, sent: 0, failed: 0, error: 'Неуспешно четене на опашката.' }
  const rows = await listRes.json()

  let sent = 0
  let failed = 0

  for (const row of rows) {
    try {
      await dispatch(row, config)
      await supaFetch(`/rest/v1/outbox?id=eq.${row.id}`, {
        supabaseUrl,
        serviceKey,
        method: 'PATCH',
        extraHeaders: { Prefer: 'return=minimal' },
        body: { status: 'sent', sent_at: new Date().toISOString(), attempts: row.attempts + 1 },
      })
      sent++
    } catch (err) {
      const attempts = row.attempts + 1
      await supaFetch(`/rest/v1/outbox?id=eq.${row.id}`, {
        supabaseUrl,
        serviceKey,
        method: 'PATCH',
        extraHeaders: { Prefer: 'return=minimal' },
        body: {
          attempts,
          status: attempts >= MAX_ATTEMPTS ? 'failed' : 'queued',
          last_error: String(err.message || err).slice(0, 500),
        },
      })
      failed++
    }
  }

  return { processed: rows.length, sent, failed }
}
