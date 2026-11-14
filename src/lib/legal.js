/**
 * Правна информация на StayFlow — чиста логика (без React, без браузър), за да се тества с Node.
 *
 * COMPANY е ЕДИНСТВЕНОТО място, където се пишат данните на администратора. Те се показват в Политиката за
 * поверителност, в Условията за ползване и в долния ред на екраните. Нищо не се измисля: докато поле е празно,
 * текстът показва видим знак „[да се попълни]“, а scripts/check-legal-ready.mjs отказва да се качва на живо.
 */
export const COMPANY = {
  name: null, // напр. „Име на фирмата ЕООД“ (или трите имена на ЕТ)
  address: null, // седалище и адрес на управление
  eik: null, // ЕИК / БУЛСТАТ
  email: null, // имейл за въпроси за личните данни и за права по GDPR
  phone: null, // по желание
}

/** Дата на последната промяна на двата документа (показва се в тях). Сменя се при всяка смислена редакция. */
export const LEGAL_UPDATED = '2026-11-12'

/** Задължителните полета за администратор по GDPR (чл. 13): кой е и как се свързваме с него. */
export const REQUIRED_COMPANY_FIELDS = ['name', 'address', 'eik', 'email']

const filled = (v) => typeof v === 'string' && v.trim() !== ''

export function missingCompanyFields(company = COMPANY) {
  return REQUIRED_COMPANY_FIELDS.filter((k) => !filled(company[k]))
}

export const legalReady = (company = COMPANY) => missingCompanyFields(company).length === 0

/** Редове за показване: само попълнените, в постоянен ред. */
export function companyLines(company = COMPANY) {
  const labels = [
    ['name', 'Фирма'],
    ['eik', 'ЕИК'],
    ['address', 'Адрес'],
    ['email', 'Имейл'],
    ['phone', 'Телефон'],
  ]
  return labels.filter(([k]) => filled(company[k])).map(([k, label]) => ({ key: k, label, value: company[k].trim() }))
}

/** Кратък ред за долната част на екраните: „Име · ЕИК 123456789“ (празен, ако няма име). */
export function companyShort(company = COMPANY) {
  if (!filled(company.name)) return ''
  return filled(company.eik) ? `${company.name.trim()} · ЕИК ${company.eik.trim()}` : company.name.trim()
}

/* ------------------------------------------------------------------ избор за бисквитки */

export const CONSENT_KEY = 'stayflow.consent'
export const CONSENT_VERSION = 1

/**
 * Изборът се пази като { v, choice, at }.
 *   'all'       — разрешено е външно съдържание (сега: картата от OpenStreetMap)
 *   'necessary' — само необходимото (вход, език); външното съдържание не се зарежда
 * Всичко друго (липсва, повредено, друга версия) = още няма избор → банерът се показва.
 */
export function parseConsent(raw) {
  if (!raw) return null
  try {
    const data = JSON.parse(raw)
    if (data && data.v === CONSENT_VERSION && (data.choice === 'all' || data.choice === 'necessary')) return data.choice
  } catch {
    /* повреден запис = няма избор */
  }
  return null
}

export function serializeConsent(choice, now = new Date()) {
  if (choice !== 'all' && choice !== 'necessary') throw new Error(`Непознат избор: ${choice}`)
  return JSON.stringify({ v: CONSENT_VERSION, choice, at: now.toISOString() })
}

/** „12 ноември 2026 г.“ — за реда „Последна промяна“. */
export function formatLegalDate(iso = LEGAL_UPDATED) {
  const [y, m, d] = iso.split('-').map(Number)
  const months = ['януари', 'февруари', 'март', 'април', 'май', 'юни', 'юли', 'август', 'септември', 'октомври', 'ноември', 'декември']
  return `${d} ${months[m - 1]} ${y} г.`
}
