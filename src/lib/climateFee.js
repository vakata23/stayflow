/**
 * Гърция: такса „Климатична устойчивост“ — на жилище за нощ (не на човек), с ставка по сезон и вид жилище.
 * Ставките са от вторични източници (април–октомври 8 €, ноември–март 2 €; къща над 80 м² — 15 € и 4 €) и се потвърждават
 * със счетоводител. Сумата в резервацията може да се редактира ръчно.
 */
export const CLIMATE_RATES = { standard: { peak: 8, off: 2 }, house: { peak: 15, off: 4 } }
export const PEAK_MONTHS = [4, 5, 6, 7, 8, 9, 10]

/** Къща над 80 м² се води „къща“ (по-високи ставки); всичко друго — обикновено жилище. */
export function dwellingType(property) {
  return property?.property_type === 'house' && Number(property?.area_m2) > 80 ? 'house' : 'standard'
}

/** Сума за престоя: всяка нощ е „сезон“ или „извън сезон“ по месеца на нощта. */
export function climateFee({ checkIn, checkOut, dwelling = 'standard', rates = CLIMATE_RATES }) {
  if (!checkIn || !checkOut || checkOut <= checkIn) return { total: 0, nights: 0, peakNights: 0, offNights: 0, peakRate: 0, offRate: 0 }
  const r = rates[dwelling] ?? rates.standard
  let peakNights = 0
  let offNights = 0
  const end = Date.UTC(+checkOut.slice(0, 4), +checkOut.slice(5, 7) - 1, +checkOut.slice(8, 10))
  for (let t = Date.UTC(+checkIn.slice(0, 4), +checkIn.slice(5, 7) - 1, +checkIn.slice(8, 10)); t < end; t += 86400000) {
    const month = new Date(t).getUTCMonth() + 1
    if (PEAK_MONTHS.includes(month)) peakNights++
    else offNights++
  }
  return { total: peakNights * r.peak + offNights * r.off, nights: peakNights + offNights, peakNights, offNights, peakRate: r.peak, offRate: r.off }
}
