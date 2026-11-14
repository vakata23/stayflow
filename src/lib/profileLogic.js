/**
 * Профил на собственика: име, фирма, телефон. Те се показват на картата на госта и във фактурите.
 * Чиста логика (без база, без браузър) — тества се в scripts/test-usability.mjs.
 */

export const NAME_MAX = 80
export const COMPANY_MAX = 120

/** Телефон: цифри, интервали и + - ( ) . ; поне 6 и най-много 15 цифри (международен номер). */
export function validatePhone(value) {
  const v = String(value ?? '').trim()
  if (v === '') return null // незадължителен
  if (!/^\+?[\d\s().-]+$/.test(v) || v.replace(/\D/g, '').length < 6) return 'Въведете телефон с цифри, например +359 888 123 456.'
  if (v.replace(/\D/g, '').length > 15) return 'Телефонът е твърде дълъг.'
  return null
}

/** { errors, values } — values са готови за запис (празното става null, интервалите по краищата се махат). */
export function validateProfile({ full_name, company_name, phone }) {
  const errors = {}
  const name = String(full_name ?? '').trim().replace(/\s+/g, ' ')
  const company = String(company_name ?? '').trim().replace(/\s+/g, ' ')
  const tel = String(phone ?? '').trim().replace(/\s+/g, ' ')
  if (!name) errors.full_name = 'Въведете име.'
  else if (name.length > NAME_MAX) errors.full_name = `Името е твърде дълго (най-много ${NAME_MAX} знака).`
  if (company.length > COMPANY_MAX) errors.company_name = `Името на фирмата е твърде дълго (най-много ${COMPANY_MAX} знака).`
  const phoneError = validatePhone(tel)
  if (phoneError) errors.phone = phoneError
  return { errors, values: { full_name: name, company_name: company || null, phone: tel || null } }
}

/** Как профилът се вижда на гостите (както в SQL на картата на госта: фирма, иначе име). */
export function guestFacingContact(profile) {
  const name = (profile?.company_name ?? '').trim() || (profile?.full_name ?? '').trim()
  const phone = (profile?.phone ?? '').trim()
  return { name: name || null, phone: phone || null }
}

export const profileChanged = (profile, values) =>
  (profile?.full_name ?? '') !== values.full_name ||
  (profile?.company_name ?? null) !== values.company_name ||
  (profile?.phone ?? null) !== values.phone
