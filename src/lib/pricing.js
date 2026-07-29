import { supabase } from './supabase'

/**
 * Връща активното ценово правило за даден ден (или null).
 * При застъпващи се правила печели последно създаденото — така по-новото
 * правило „замазва“ старото за същия период без нужда от изтриване.
 */
export function priceForDay(rules, dayISO) {
  const matching = rules.filter((r) => r.start_date <= dayISO && dayISO <= r.end_date)
  if (matching.length === 0) return null
  return matching.reduce((latest, r) => (r.created_at > latest.created_at ? r : latest))
}

/** Проверка за застъпване с вече съществуващо правило (за предупреждение, не за блокиране). */
export async function findOverlappingRule({ propertyId, startDate, endDate, excludeId }) {
  let query = supabase
    .from('pricing_rules')
    .select('id, start_date, end_date, price_per_night')
    .eq('property_id', propertyId)
    .lte('start_date', endDate)
    .gte('end_date', startDate)

  if (excludeId) query = query.neq('id', excludeId)

  const { data } = await query.limit(1)
  return data?.[0] ?? null
}

export function formatPrice(value) {
  return `${Number(value).toFixed(2)} лв.`
}
