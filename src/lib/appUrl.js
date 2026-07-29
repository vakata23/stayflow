/**
 * Публичен адрес на приложението.
 *
 * В УЕБ билда `VITE_PUBLIC_URL` е празно и ползваме текущия origin —
 * гост линковете и iCal адресите сочат към същия домейн (Netlify).
 *
 * В НАТИВНИЯ (Capacitor) билд приложението се зарежда от
 * `capacitor://localhost`, който не е достъпен отвън. Затова задаваме
 * `VITE_PUBLIC_URL=https://вашия-домейн` при билда — така гост картите,
 * iCal експортът и reset паролата продължават да сочат към реалния
 * публичен уеб адрес.
 */
const configured = (import.meta.env.VITE_PUBLIC_URL || '').replace(/\/$/, '')

/** Базов публичен адрес за линкове, които трети страни отварят. */
export function appOrigin() {
  return configured || window.location.origin
}

/**
 * Базов адрес за /api заявки (iCal proxy).
 * Уеб: празно → относителен път към Netlify функцията на същия домейн.
 * Нативно: пълен URL към публичния домейн.
 */
export function apiBase() {
  return configured
}
