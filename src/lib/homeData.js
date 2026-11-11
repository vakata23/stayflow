import { supabase } from './supabase'
import { incompleteBookingsFilter } from './bookings'
import { addDays, toISODate } from './dates'
import { pickUnpaid, sumOutstanding, UNPAID_LOOKBACK_DAYS } from './attentionLogic'

/** Колко неща чакат собственика — четири леки заявки (само броене), нищо не се пише. */
export async function fetchAttentionFacts(today) {
  const lookbackFrom = toISODate(addDays(new Date(`${today}T12:00:00`), -UNPAID_LOOKBACK_DAYS))
  const [requests, incomplete, balances, cleaning] = await Promise.all([
    supabase.from('booking_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    incompleteBookingsFilter(supabase.from('bookings').select('id', { count: 'exact', head: true })),
    supabase
      .from('booking_balances')
      .select('booking_id, status, source, check_in, outstanding')
      .gt('outstanding', 0)
      .lte('check_in', today)
      .gte('check_in', lookbackFrom),
    supabase.from('cleaning_tasks').select('id', { count: 'exact', head: true }).neq('status', 'done').lt('due_date', today),
  ])

  const unpaid = pickUnpaid(balances.data, today, lookbackFrom)
  return {
    pendingRequests: requests.count ?? 0,
    incompleteBookings: incomplete.count ?? 0,
    unpaidCount: unpaid.length,
    unpaidTotal: sumOutstanding(unpaid),
    overdueCleaning: cleaning.count ?? 0,
  }
}

/** Данните за „Първи стъпки“. Грешка в някоя заявка (напр. липсваща таблица) просто брои като „не е направено“. */
export async function fetchChecklistFacts() {
  const [props, photos, seasons, bookings, notify] = await Promise.all([
    supabase.from('properties').select('id, name, base_price, is_listed, ical_url').order('created_at'),
    supabase.from('property_photos').select('property_id'),
    supabase.from('price_seasons').select('property_id'),
    supabase.from('bookings').select('id', { count: 'exact', head: true }),
    supabase.from('notification_targets').select('id', { count: 'exact', head: true }),
  ])
  return {
    properties: props.data ?? [],
    photoPropertyIds: (photos.data ?? []).map((r) => r.property_id),
    seasonPropertyIds: (seasons.data ?? []).map((r) => r.property_id),
    bookingCount: bookings.count ?? 0,
    notificationCount: notify.count ?? 0,
  }
}
