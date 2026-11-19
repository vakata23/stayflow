import { supabase } from './supabase'
import { registryAvailable } from './registry'
import { summarize, attentionFromSummaries } from './safetyLogic'

/**
 * Документи за безопасност (миграция 018). Докато миграцията не е пусната, таблицата я няма —
 * тогава картата „Безопасност“ не се показва (safetyAvailable() = false), останалото работи както преди.
 */
let availability = null

const isMissing = (error) =>
  error.code === 'PGRST205' ||
  error.code === '42P01' ||
  (/property_safety_items/.test(error.message ?? '') && /(schema cache|does not exist|could not find)/i.test(error.message ?? ''))

export function safetyAvailable() {
  availability ??= supabase
    .from('property_safety_items')
    .select('property_id')
    .limit(1)
    .then(({ error }) => !(error && isMissing(error)))
    .catch(() => true)
  return availability
}

export async function loadSafety(propertyId) {
  if (!(await safetyAvailable())) return []
  const { data } = await supabase.from('property_safety_items').select('*').eq('property_id', propertyId)
  return data ?? []
}

export async function saveSafetyItems(propertyId, items) {
  const payload = items.map((i) => ({
    property_id: propertyId,
    item_key: i.item_key,
    done: Boolean(i.done),
    expires_on: i.expires_on || null,
    note: i.note?.trim() || null,
    updated_at: new Date().toISOString(),
  }))
  const { error } = await supabase.from('property_safety_items').upsert(payload, { onConflict: 'property_id,item_key' })
  if (error) throw error
}

/** За таблото: изтекли и скоро изтичащи документи на имотите в Гърция (празно, ако няма такива или няма миграция). */
export async function fetchSafetyFacts(today) {
  if (!(await safetyAvailable()) || !(await registryAvailable())) return {}
  const { data: regs } = await supabase.from('property_registry').select('property_id').eq('country', 'GR')
  const ids = (regs ?? []).map((r) => r.property_id)
  if (!ids.length) return {}
  const [{ data: rows }, { data: props }] = await Promise.all([
    supabase.from('property_safety_items').select('*').in('property_id', ids),
    supabase.from('properties').select('id, house_rules').in('id', ids),
  ])
  const summaries = ids.map((id) =>
    summarize(
      (rows ?? []).filter((r) => r.property_id === id),
      today,
      (props ?? []).find((p) => p.id === id)?.house_rules ?? ''
    )
  )
  return attentionFromSummaries(summaries)
}
