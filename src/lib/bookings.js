import { supabase } from './supabase'

export const BOOKING_SOURCES = [
  { value: 'manual', label: 'Ръчно въведена' },
  { value: 'airbnb', label: 'Airbnb' },
  { value: 'booking', label: 'Booking.com' },
  { value: 'direct', label: 'Директна' },
]

export const BOOKING_STATUSES = [
  { value: 'confirmed', label: 'Потвърдена' },
  { value: 'pending', label: 'Чакаща' },
  { value: 'cancelled', label: 'Отказана' },
]

/** Цветове по източник — ползват се в календара и в списъка. */
export const SOURCE_STYLES = {
  manual: { chip: 'bg-sunken text-ink', bar: 'bg-ink-muted', dot: 'bg-ink-muted', ring: 'ring-ink-muted', edge: 'border-ink-muted' },
  airbnb: { chip: 'bg-accent-soft text-accent-ink', bar: 'bg-src-airbnb', dot: 'bg-src-airbnb', ring: 'ring-src-airbnb', edge: 'border-src-airbnb' },
  booking: { chip: 'bg-info-soft text-info-ink', bar: 'bg-src-booking', dot: 'bg-src-booking', ring: 'ring-src-booking', edge: 'border-src-booking' },
  direct: { chip: 'bg-success-soft text-success-ink', bar: 'bg-src-direct', dot: 'bg-src-direct', ring: 'ring-src-direct', edge: 'border-src-direct' },
}

export const STATUS_STYLES = {
  confirmed: 'bg-success-soft text-success-ink',
  pending: 'bg-warning-soft text-warning-ink',
  cancelled: 'bg-sunken text-ink-soft',
}

export function sourceLabel(v) {
  return BOOKING_SOURCES.find((s) => s.value === v)?.label ?? v
}

export function statusLabel(v) {
  return BOOKING_STATUSES.find((s) => s.value === v)?.label ?? v
}

// Платформи, които удържат комисиона — всичко друго е директна резервация.
export const OTA_SOURCES = ['airbnb', 'booking']
export function isOtaSource(source) {
  return OTA_SOURCES.includes(source)
}

/**
 * Резервации от платформа без попълнена цена или комисиона (напр. донесени
 * през iCal, където Airbnb/Booking не дават финансова информация) — иначе
 * таблото „Приходи“ смята грешно за тях. Споделена между списъка с
 * резервации и таблото, за да няма две различни дефиниции за „непълна“.
 */
export function incompleteBookingsFilter(query) {
  return query.in('source', OTA_SOURCES).neq('status', 'cancelled').or('total_price.is.null,commission.eq.0')
}

export const PAYMENT_KINDS = [
  { value: 'deposit', label: 'Капаро' },
  { value: 'balance', label: 'Остатък' },
  { value: 'refund', label: 'Връщане' },
]

export const PAYMENT_METHODS = [
  { value: 'bank', label: 'Банков превод' },
  { value: 'card', label: 'Карта' },
  { value: 'cash', label: 'В брой' },
  { value: 'revolut', label: 'Revolut' },
  { value: 'stripe', label: 'Stripe' },
  { value: 'other', label: 'Друго' },
]

export function paymentKindLabel(v) {
  return PAYMENT_KINDS.find((k) => k.value === v)?.label ?? v
}

export function paymentMethodLabel(v) {
  return PAYMENT_METHODS.find((m) => m.value === v)?.label ?? v
}

/** Предложена комисиона = обща цена × ставката на имота (закръглена до стотинка). */
export function suggestCommission(totalPrice, otaCommissionPct) {
  const price = Number(totalPrice)
  if (!Number.isFinite(price) || price <= 0) return 0
  return Math.round(price * (Number(otaCommissionPct) || 0)) / 100
}

/** Предложен туристически данък = гости × нощувки × ставка на имота. */
export function suggestTouristTax(numGuests, nights, touristTaxRate) {
  const guests = Number(numGuests)
  const rate = Number(touristTaxRate)
  if (!Number.isFinite(guests) || guests <= 0 || !Number.isFinite(rate) || rate <= 0 || nights <= 0) {
    return 0
  }
  return Math.round(guests * nights * rate * 100) / 100
}

/**
 * Проверява дали периодът се застъпва със съществуваща резервация.
 * Това е първата от двете защити срещу двойно резервиране — втората е
 * exclusion constraint-ът в базата, който хваща и състезателни заявки
 * (двама потребители, записващи едновременно).
 *
 * Връща конфликтната резервация или null.
 */
export async function findConflictingBooking({ propertyId, checkIn, checkOut, excludeId }) {
  let query = supabase
    .from('bookings')
    .select('id, guest_name, check_in, check_out')
    .eq('property_id', propertyId)
    .neq('status', 'cancelled')
    // Застъпване на [checkIn, checkOut) със [check_in, check_out):
    // съществуващата започва преди новия край И свършва след новото начало.
    .lt('check_in', checkOut)
    .gt('check_out', checkIn)

  if (excludeId) query = query.neq('id', excludeId)

  const { data, error } = await query.limit(1)
  if (error) throw error
  return data?.[0] ?? null
}

/** Превежда грешките от базата в разбираеми за потребителя съобщения. */
export function translateBookingError(error) {
  // 23P01 = exclusion_violation (нашият constraint bookings_no_overlap)
  if (error.code === '23P01') {
    return 'Периодът се застъпва със съществуваща резервация за този имот.'
  }
  if (error.code === '23514') {
    return 'Датата на напускане трябва да е след датата на настаняване.'
  }
  if (error.code === '23505') {
    return 'Тази резервация вече съществува.'
  }
  return error.message
}
