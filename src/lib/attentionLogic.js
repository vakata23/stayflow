import { OTA_SOURCES } from './sources.js'
import { formatMoney } from './money.js'
import { dmy } from './declarationLogic.js'

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
export function buildAttentionItems({
  pendingRequests = 0,
  unpaidCount = 0,
  unpaidTotal = 0,
  incompleteBookings = 0,
  overdueCleaning = 0,
  declarationsOverdue = 0,
  declarationsDue = 0,
  declarationsNextDeadline = null,
  arrivalsTomorrow = 0,
  arrivalsTomorrowId = null,
  declarationsDataSoon = 0,
  declarationsDataSoonId = null,
  safetyExpired = 0,
  safetyExpiring = 0,
}) {
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
  // Гърция: срокът за декларация е законов — просрочената е пред парите, чакащата е след тях.
  if (declarationsOverdue > 0) {
    items.push({
      key: 'declarations-overdue',
      to: '/declarations',
      tone: 'warning',
      count: declarationsOverdue,
      title: declarationsOverdue === 1 ? 'Просрочена декларация за престой' : `${declarationsOverdue} просрочени декларации за престой`,
      detail: 'Срокът до 20-о число е минал. Подайте я в myAADE и я отбележете като подадена.',
    })
  }
  if (arrivalsTomorrow > 0) {
    items.push({
      key: 'arrivals-tomorrow',
      to: `/messages?kind=before_arrival${arrivalsTomorrowId ? `&booking=${arrivalsTomorrowId}` : ''}`,
      tone: 'accent',
      count: arrivalsTomorrow,
      title: arrivalsTomorrow === 1 ? 'Утре пристига гост' : `${arrivalsTomorrow} гости пристигат утре`,
      detail: 'Пратете „Преди пристигане“ с кода за входа.',
    })
  }
  if (declarationsDataSoon > 0) {
    items.push({
      key: 'declarations-data',
      to: `/messages?kind=declaration_data${declarationsDataSoonId ? `&booking=${declarationsDataSoonId}` : ''}`,
      tone: 'warning',
      count: declarationsDataSoon,
      title: declarationsDataSoon === 1 ? 'Гост пристига скоро без данни за декларацията' : `${declarationsDataSoon} гости пристигат скоро без данни за декларацията`,
      detail: 'Поискайте паспорт или ΑΦΜ, преди да пристигнат.',
    })
  }
  if (safetyExpired + safetyExpiring > 0) {
    const n = safetyExpired + safetyExpiring
    items.push({
      key: 'safety',
      to: '/properties',
      tone: 'warning',
      count: n,
      title: n === 1 ? 'Документ за безопасност изтича или е изтекъл' : `${n} документа за безопасност изтичат или са изтекли`,
      detail: 'Подновете го и обновете срока в картата „Безопасност“ на имота.',
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
  if (declarationsDue > 0) {
    items.push({
      key: 'declarations-due',
      to: '/declarations',
      tone: 'warning',
      count: declarationsDue,
      title: declarationsDue === 1 ? 'Декларация за престой чака подаване' : `${declarationsDue} декларации за престой чакат подаване`,
      detail: declarationsNextDeadline ? `Най-близкият срок е ${dmy(declarationsNextDeadline)}.` : 'Подават се в myAADE до 20-о число на следващия месец.',
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
