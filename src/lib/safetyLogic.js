/**
 * Гърция, закон 5170/2025 (от 1 октомври 2025): документи и оборудване за безопасност на имота — чиста логика.
 * Списъкът е по търговски източници и се потвърждава със счетоводител/юрист.
 */
import { hasEmergencyInfo } from './messageTemplates.js'

export const SAFETY_ITEMS = [
  { key: 'insurance', label: 'Застраховка гражданска отговорност', expiry: true },
  { key: 'electrician', label: 'Удостоверение от електротехник', expiry: false },
  { key: 'fire', label: 'Пожарогасител (проверка)', expiry: true },
  { key: 'pest', label: 'Сертификат за дератизация', expiry: true },
  { key: 'first_aid', label: 'Аптечка', expiry: false },
  { key: 'emergency', label: 'Телефони за спешни случаи за гостите', expiry: false },
]
export const EXPIRING_SOON_DAYS = 30

const utc = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))
export const daysUntil = (iso, today) => Math.round((utc(iso) - utc(today)) / 86400000)

/**
 * Състояние на един документ: ok | expiring (до 30 дни) | expired | missing.
 * „Телефони за спешни случаи“ е готов и когато правилата за гостите вече съдържат 112.
 */
export function itemState(def, row, today, rules = '') {
  if (def.key === 'emergency' && hasEmergencyInfo(rules)) return 'ok'
  if (!row?.done) return 'missing'
  if (def.expiry && row.expires_on) {
    const d = daysUntil(row.expires_on, today)
    if (d < 0) return 'expired'
    if (d <= EXPIRING_SOON_DAYS) return 'expiring'
  }
  return 'ok'
}

export function summarize(rows = [], today, rules = '') {
  const byKey = Object.fromEntries(rows.map((r) => [r.item_key, r]))
  const items = SAFETY_ITEMS.map((def) => ({ def, row: byKey[def.key] ?? null, state: itemState(def, byKey[def.key], today, rules), days: byKey[def.key]?.expires_on ? daysUntil(byKey[def.key].expires_on, today) : null }))
  return {
    items,
    total: items.length,
    ready: items.filter((i) => i.state === 'ok' || i.state === 'expiring').length,
    expired: items.filter((i) => i.state === 'expired').length,
    expiring: items.filter((i) => i.state === 'expiring').length,
    missing: items.filter((i) => i.state === 'missing').length,
  }
}

/** За таблото: колко документа са изтекли или изтичат скоро (само такива, които собственикът е отбелязал като налични). */
export function attentionFromSummaries(summaries) {
  let expired = 0
  let expiring = 0
  for (const s of summaries) {
    expired += s.expired
    expiring += s.expiring
  }
  return { safetyExpired: expired, safetyExpiring: expiring }
}
