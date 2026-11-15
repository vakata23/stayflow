import { COMPANY } from './legal'

/** Връзки за връзка с нас — от един източник (COMPANY в legal.js, взет от vkcompany.site). */
const digits = (v) => String(v ?? '').replace(/\D/g, '')

export const contactPhone = COMPANY.phone
export const contactEmail = COMPANY.email
/** Viber: viber://chat?number=%2B359899140113 (на телефон отваря Viber; на компютър — настолното приложение, ако го има). */
export const viberUrl = COMPANY.phone ? `viber://chat?number=%2B${digits(COMPANY.phone)}` : null
export const telUrl = COMPANY.phone ? `tel:+${digits(COMPANY.phone)}` : null
export const mailtoUrl = (subject) => (COMPANY.email ? `mailto:${COMPANY.email}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}` : null)
