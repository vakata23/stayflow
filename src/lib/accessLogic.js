/**
 * Платен достъп до StayFlow — чиста логика (без React и без база), тества се в scripts/test-access.mjs.
 * Цените и пакетите са взети от vkcompany.site/produkti (страница „Продукти“, 2026-11-15): месечен абонамент,
 * при плащане за година — 2 месеца безплатно; пилотна версия, пакетите се включват ръчно.
 */

export const PLANS = {
  start: { key: 'start', name: 'Старт', monthly: 9, properties: 3, users: 1, blurb: 'за няколко имота' },
  plus: { key: 'plus', name: 'Плюс', monthly: 19, properties: 10, users: 3, blurb: 'за растящ бизнес' },
  pro: { key: 'pro', name: 'Про', monthly: 39, properties: 30, users: 10, blurb: 'за много имоти и екип' },
}
export const PLAN_KEYS = ['start', 'plus', 'pro']
export const FREE_MONTHS_YEARLY = 2

/** При плащане за година: 12 месеца − 2 безплатни. */
export const yearlyPrice = (plan) => PLANS[plan].monthly * (12 - FREE_MONTHS_YEARLY)

/** Колко имота има собственикът → кой пакет му трябва (над 30 — по оферта, null). */
export const BANDS = [
  { key: '1-3', label: '1–3 имота', plan: 'start' },
  { key: '4-10', label: '4–10 имота', plan: 'plus' },
  { key: '11-30', label: '11–30 имота', plan: 'pro' },
  { key: '31+', label: 'Над 30 имота', plan: null },
]
export const planForBand = (band) => BANDS.find((b) => b.key === band)?.plan ?? null

/* ---------------------------------------------------------------- дати */

/** „Днес“ като YYYY-MM-DD по часовата зона на България. */
export function todayIso(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Sofia' }).format(now)
}

const parse = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return { y, m, d }
}
const pad = (n) => String(n).padStart(2, '0')
const utc = (iso) => {
  const { y, m, d } = parse(iso)
  return Date.UTC(y, m - 1, d)
}

export function addMonthsIso(iso, months) {
  const { y, m, d } = parse(iso)
  const total = y * 12 + (m - 1) + months
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate() // последният ден на месеца
  return `${ny}-${pad(nm)}-${pad(Math.min(d, last))}`
}

export function daysBetween(fromIso, toIso) {
  return Math.round((utc(toIso) - utc(fromIso)) / 86400000)
}

/** Удължаване: от по-късната дата — „активен до“ или днес (изтеклият достъп тръгва от днес). */
export function extendUntil(until, today, months = 1) {
  const base = until && until >= today ? until : today
  return addMonthsIso(base, months)
}

/* ---------------------------------------------------------------- състояние на достъпа */

export const WARN_DAYS = 7

/**
 * grant: { status, plan, active_until } или null/undefined (няма запис → съществуващ акаунт, пълен достъп).
 * → { state: 'active' | 'pending' | 'suspended' | 'expired', daysLeft: число | null, expiresSoon: boolean }
 */
export function accessState(grant, today = todayIso()) {
  if (!grant || !grant.status) return { state: 'active', daysLeft: null, expiresSoon: false }
  if (grant.status === 'suspended') return { state: 'suspended', daysLeft: null, expiresSoon: false }
  if (grant.status === 'pending') return { state: 'pending', daysLeft: null, expiresSoon: false }
  if (!grant.active_until) return { state: 'active', daysLeft: null, expiresSoon: false }
  const daysLeft = daysBetween(today, grant.active_until)
  if (daysLeft < 0) return { state: 'expired', daysLeft, expiresSoon: false }
  return { state: 'active', daysLeft, expiresSoon: daysLeft <= WARN_DAYS }
}

export const STATE_LABEL = {
  active: 'Активен',
  pending: 'Чака активиране',
  suspended: 'Спрян',
  expired: 'Изтекъл',
}

/* ---------------------------------------------------------------- заявка за достъп */

const PHONE_CHARS = /^[0-9+ ().-]+$/
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/

/** → { errors: { name?, contact?, phone?, email?, note?, consent? }, values } (празно → null; подрязано). */
export function validateAccessRequest(raw = {}) {
  const name = String(raw.name ?? '').replace(/\s+/g, ' ').trim()
  const phone = String(raw.phone ?? '').replace(/\s+/g, ' ').trim()
  const email = String(raw.email ?? '').trim().toLowerCase()
  const note = String(raw.note ?? '').trim()
  const errors = {}
  if (name.length < 2) errors.name = 'Въведете името си.'
  else if (name.length > 80) errors.name = 'Името е твърде дълго.'
  if (!phone && !email) errors.contact = 'Оставете телефон или имейл, за да се свържем с вас.'
  if (phone) {
    const digits = phone.replace(/\D/g, '')
    if (!PHONE_CHARS.test(phone) || digits.length < 6 || digits.length > 15) errors.phone = 'Въведете телефон с цифри, например +359 888 123 456.'
  }
  if (email && !EMAIL.test(email)) errors.email = 'Имейлът изглежда непълен.'
  if (note.length > 500) errors.note = 'Съобщението е твърде дълго (до 500 знака).'
  if (!raw.consent) errors.consent = 'Нужно е съгласие, за да можем да се свържем с вас.'
  return {
    errors,
    values: {
      name,
      phone: phone || null,
      email: email || null,
      band: BANDS.some((b) => b.key === raw.band) ? raw.band : null,
      plan: PLAN_KEYS.includes(raw.plan) ? raw.plan : null,
      note: note || null,
    },
  }
}

/** Съобщенията на сървъра (request_access) → текст за човек. */
export function requestErrorMessage(code) {
  const c = String(code ?? '')
  if (/too_many/.test(c)) return 'Вече получихме заявка от вас. Ще се свържем скоро — или ни пишете във Viber.'
  if (/consent_required/.test(c)) return 'Нужно е съгласие, за да можем да се свържем с вас.'
  if (/phone_invalid/.test(c)) return 'Телефонът изглежда неправилен.'
  if (/email_invalid/.test(c)) return 'Имейлът изглежда неправилен.'
  if (/contact_required/.test(c)) return 'Оставете телефон или имейл.'
  if (/name_invalid/.test(c)) return 'Въведете името си.'
  return 'Заявката не се изпрати. Опитайте пак или ни пишете във Viber.'
}

/* ---------------------------------------------------------------- калкулатор „колко комисиона плащате“ */

/**
 * Колко отива за платформите: нощувки × цена × комисия. Нищо не се записва; числата са на посетителя.
 * Връща null при невалиден вход.
 */
export function commissionCost({ nights, price, percent }) {
  const n = Number(nights)
  const p = Number(price)
  const c = Number(percent)
  if (![n, p, c].every(Number.isFinite)) return null
  if (n < 0 || n > 31 || p < 0 || p > 5000 || c < 0 || c > 40) return null
  return { month: Math.round((n * p * c) / 100), year: Math.round((n * p * c * 12) / 100) }
}

/** Дали годишната комисиона надвишава цената на абонамента за пакета (ориентир, не обещание). */
export function paysForItself(plan, yearlyCommission) {
  const cost = PLANS[plan]?.monthly * 12
  if (!cost || !yearlyCommission) return null
  return yearlyCommission >= cost
}
