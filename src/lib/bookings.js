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
  manual: { chip: 'bg-slate-100 text-slate-700', bar: 'bg-slate-400', dot: 'bg-slate-400' },
  airbnb: { chip: 'bg-rose-100 text-rose-700', bar: 'bg-rose-400', dot: 'bg-rose-400' },
  booking: { chip: 'bg-blue-100 text-blue-700', bar: 'bg-blue-400', dot: 'bg-blue-400' },
  direct: { chip: 'bg-emerald-100 text-emerald-700', bar: 'bg-emerald-400', dot: 'bg-emerald-400' },
}

export const STATUS_STYLES = {
  confirmed: 'bg-emerald-100 text-emerald-700',
  pending: 'bg-amber-100 text-amber-700',
  cancelled: 'bg-slate-100 text-slate-500',
}

export function sourceLabel(v) {
  return BOOKING_SOURCES.find((s) => s.value === v)?.label ?? v
}

export function statusLabel(v) {
  return BOOKING_STATUSES.find((s) => s.value === v)?.label ?? v
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
