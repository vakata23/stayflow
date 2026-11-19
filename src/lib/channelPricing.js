/**
 * Цени по канал — справка за собственика: колко да бъде цената в Airbnb и Booking, за да остане същото след комисионата,
 * както при директна резервация. StayFlow не праща цени към платформите (с iCal се обменят само дати).
 */

/** Надбавка, която връща същата сума след комисиона: 15% комисиона → +17,6% (100 € → 117,6 € → след 15% пак 100 €). */
export function markupFromCommission(commissionPct) {
  const c = Number(commissionPct)
  if (!Number.isFinite(c) || c <= 0 || c >= 100) return 0
  return Math.round((c / (100 - c)) * 1000) / 10
}

/** Цената за канала, закръглена до цяло евро. */
export function priceWithMarkup(price, markupPct) {
  const p = Number(price)
  if (!Number.isFinite(p) || p <= 0) return 0
  return Math.round(p * (1 + (Number(markupPct) || 0) / 100))
}

/** Колко остава на собственика от цената в канала след комисионата (за проверка на надбавката). */
export function netAfterCommission(channelPrice, commissionPct) {
  return Math.round(Number(channelPrice) * (1 - (Number(commissionPct) || 0) / 100) * 100) / 100
}

export const validMarkup = (v) => v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 100

/**
 * Редовете на таблицата: всеки сезон (по име/период) и „останалите дати“ с основната цена.
 * seasons: [{ name, label, price_per_night }] — етикетът на периода идва от извикващия (seasonLogic).
 */
export function channelRows({ basePrice, seasons = [], airbnbPct = 0, bookingPct = 0 }) {
  const rows = seasons.map((s) => ({ key: s.key ?? s.label, label: s.label, name: s.name || null, direct: Number(s.price_per_night) }))
  if (Number(basePrice) > 0) rows.push({ key: 'base', label: null, name: null, direct: Number(basePrice), base: true })
  return rows.map((r) => ({ ...r, airbnb: priceWithMarkup(r.direct, airbnbPct), booking: priceWithMarkup(r.direct, bookingPct) }))
}
