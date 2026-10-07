/**
 * Ежедневно пускане на генератора за автоматични записи — от съществуващата
 * scheduled функция (process-outbox-scheduled.mjs), със service role.
 * Всеки собственик се обработва поотделно: generate_auto_entries() получава
 * само ЕДИН profile_id и пипа само неговите правила.
 */

// Scheduler-ът ни пуска на всеки 5 мин. „Веднъж дневно“ = само в 04:00–04:04
// по София; идемпотентността на генератора прави и повторно пускане безвредно.
export function isDailyAutoEntriesWindow(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Sofia',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const hour = Number(parts.find((p) => p.type === 'hour').value)
  const minute = Number(parts.find((p) => p.type === 'minute').value)
  return hour === 4 && minute < 5
}

async function supa(path, { supabaseUrl, serviceKey, method = 'GET', body }) {
  return fetch(`${supabaseUrl}${path}`, {
    method,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}

/** Връща { profiles, created, failed }. Грешка за един собственик не спира другите. */
export async function generateAutoEntriesForAll({ supabaseUrl, serviceKey }) {
  if (!supabaseUrl || !serviceKey) return { profiles: 0, created: 0, failed: 0, error: 'Сървърът не е конфигуриран.' }

  const listRes = await supa('/rest/v1/recurring_rules?active=eq.true&select=profile_id', { supabaseUrl, serviceKey })
  if (!listRes.ok) return { profiles: 0, created: 0, failed: 0, error: 'Неуспешно четене на правилата.' }
  const profileIds = [...new Set((await listRes.json()).map((r) => r.profile_id))]

  let created = 0
  let failed = 0
  for (const profileId of profileIds) {
    try {
      const res = await supa('/rest/v1/rpc/generate_auto_entries', {
        supabaseUrl,
        serviceKey,
        method: 'POST',
        body: { p_profile_id: profileId },
      })
      if (!res.ok) throw new Error(String(res.status))
      created += Number(await res.json()) || 0
    } catch {
      failed++
    }
  }
  return { profiles: profileIds.length, created, failed }
}
