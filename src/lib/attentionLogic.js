import { OTA_SOURCES } from './sources.js'
import { formatMoney } from './money.js'

/**
 * „Чака вас“ на таблото — какво изисква действие от собственика СЕГА.
 * Чиста логика (без заявки към базата), за да се тества в Node.
 */

/** Неплатен остатък се брои само за гости, които вече са пристигнали — и то от последните 60 дни,
 *  за да не се натрупва шум от стари резервации, на които никой не е записал плащане. */
export const UNPAID_LOOKBACK_DAYS = 60

/**
 * Резервации с неплатен остатък, за които таблото напомня.
 * Платформите (Airbnb/Booking) плащат сами на собственика — затова не се броят; отказаните — също.
 */
export function pickUnpaid(rows, today, lookbackFrom) {
  return (rows ?? []).filter(
    (r) =>
      r.status !== 'cancelled' &&
      !OTA_SOURCES.includes(r.source) &&
      r.check_in <= today &&
      r.check_in >= lookbackFrom &&
      Number(r.outstanding) > 0
  )
}

export function sumOutstanding(rows) {
  return rows.reduce((s, r) => s + Number(r.outstanding), 0)
}

/** Подрежда ги по спешност: гост чака отговор → пари → грешни приходи → почистване. */
export function buildAttentionItems({ pendingRequests = 0, unpaidCount = 0, unpaidTotal = 0, incompleteBookings = 0, overdueCleaning = 0 }) {
  const items = []
  if (pendingRequests > 0) {
    items.push({
      key: 'requests',
      to: '/booking-requests',
      tone: 'accent',
      count: pendingRequests,
      title: pendingRequests === 1 ? 'Нова заявка от гост' : `${pendingRequests} нови заявки от гости`,
      detail: 'Приемете или откажете — гостът чака отговор.',
    })
  }
  if (unpaidCount > 0) {
    items.push({
      key: 'unpaid',
      to: '/earnings',
      tone: 'warning',
      count: unpaidCount,
      title: unpaidCount === 1 ? 'Гост с неплатен остатък' : `${unpaidCount} гости с неплатен остатък`,
      detail: `Общо ${formatMoney(unpaidTotal)} — гостите вече са пристигнали.`,
    })
  }
  if (incompleteBookings > 0) {
    items.push({
      key: 'incomplete',
      to: '/bookings?incomplete=1',
      tone: 'warning',
      count: incompleteBookings,
      title: incompleteBookings === 1 ? 'Резервация от платформа без цена' : `${incompleteBookings} резервации от платформи без цена`,
      detail: 'Без цена и комисиона приходите се смятат грешно.',
    })
  }
  if (overdueCleaning > 0) {
    items.push({
      key: 'cleaning',
      to: '/cleaning-tasks',
      tone: 'warning',
      count: overdueCleaning,
      title: overdueCleaning === 1 ? 'Просрочено почистване' : `${overdueCleaning} просрочени почиствания`,
      detail: 'Срокът е минал, а задачата още не е отбелязана като готова.',
    })
  }
  return items
}
