import { supabase } from './supabase'
import { toDraft, toPayload, samePackage } from './packageLogic'

/**
 * Достъп до пакетите и офертите за престой (миграция 015, върху 014). Докато миграцията не е пусната, таблицата я няма —
 * тогава картата не се показва (packagesAvailable() = false), а страницата за гости работи както преди.
 */

let availability = null

const isMissing = (error) =>
  error.code === 'PGRST205' || // PostgREST: таблицата я няма в кеша на схемата
  error.code === '42P01' || // Postgres: undefined_table
  (/stay_packages/.test(error.message ?? '') && /(schema cache|does not exist|could not find)/i.test(error.message ?? ''))

/** Има ли таблицата stay_packages (веднъж на зареждане на страницата). */
export function packagesAvailable() {
  availability ??= supabase
    .from('stay_packages')
    .select('id')
    .limit(1)
    .then(({ error }) => !(error && isMissing(error)))
    .catch(() => true) // мрежова грешка — не скриваме функцията; зареждането ще покаже истинската грешка
  return availability
}

/** Офертите на имот като чернови за формата. */
export async function loadPackages(propertyId) {
  const { data, error } = await supabase.from('stay_packages').select('*').eq('property_id', propertyId).order('created_at').order('id')
  if (error) throw error
  return (data ?? []).map(toDraft)
}

/** Сурови редове (за прегледа като гост на собственика). */
export async function loadPackageRows(propertyId) {
  if (!(await packagesAvailable())) return []
  const { data, error } = await supabase.from('stay_packages').select('*').eq('property_id', propertyId).eq('is_active', true).order('created_at').order('id')
  return error ? [] : (data ?? [])
}

/** Записва промените: изтритите се махат, променените се обновяват, новите се добавят. */
export async function savePackages(propertyId, drafts, original) {
  const keptIds = new Set(drafts.filter((d) => d.id).map((d) => d.id))
  const removed = original.filter((o) => !keptIds.has(o.id)).map((o) => o.id)
  if (removed.length) {
    const { error } = await supabase.from('stay_packages').delete().in('id', removed)
    if (error) throw error
  }
  const before = new Map(original.map((o) => [o.id, o]))
  for (const d of drafts.filter((x) => x.id && before.has(x.id) && !samePackage(x, before.get(x.id)))) {
    const { error } = await supabase.from('stay_packages').update(toPayload(d, propertyId)).eq('id', d.id)
    if (error) throw error
  }
  const fresh = drafts.filter((d) => !d.id)
  if (fresh.length) {
    const { error } = await supabase.from('stay_packages').insert(fresh.map((d) => toPayload(d, propertyId)))
    if (error) throw error
  }
  return loadPackages(propertyId)
}

/** Офертите на публикуван имот за страницата на госта (RPC public_packages); без миграцията или при грешка — празен списък. */
export async function loadPublicPackages(slug) {
  const { data, error } = await supabase.rpc('public_packages', { p_slug: slug })
  if (error) return []
  return data ?? []
}
