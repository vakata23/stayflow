import { supabase } from './supabase'

/**
 * Надбавки по канал (миграция 018: property_settings.airbnb_markup_pct и booking_markup_pct). Докато миграцията не е пусната,
 * колоните ги няма — тогава картата „Цени по канал“ не се показва (available = false).
 */
const isMissing = (error) =>
  error.code === '42703' ||
  error.code === 'PGRST204' ||
  (/(airbnb_markup_pct|booking_markup_pct)/.test(error.message ?? '') && /(does not exist|schema cache|could not find)/i.test(error.message ?? ''))

export async function loadMarkups(propertyId) {
  const { data, error } = await supabase.from('property_settings').select('airbnb_markup_pct, booking_markup_pct').eq('property_id', propertyId).maybeSingle()
  if (error) {
    if (isMissing(error)) return { available: false }
    throw error
  }
  return { available: true, airbnb: Number(data?.airbnb_markup_pct ?? 0), booking: Number(data?.booking_markup_pct ?? 0) }
}

export async function saveMarkups(propertyId, { airbnb, booking }) {
  const { error } = await supabase
    .from('property_settings')
    .upsert({ property_id: propertyId, airbnb_markup_pct: Number(airbnb), booking_markup_pct: Number(booking) }, { onConflict: 'property_id' })
  if (error) throw error
}
