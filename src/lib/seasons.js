import { supabase } from './supabase'
import { toDraft, toPayload, sameSeason } from './seasonLogic'

/**
 * Достъп до сезонните цени (миграция 014). Докато миграцията не е пусната в базата, таблицата я няма —
 * тогава сезоните просто не се показват (seasonsAvailable() = false), останалото работи както преди.
 */

let availability = null

const isMissing = (error) =>
  error.code === 'PGRST205' || // PostgREST: таблицата я няма в кеша на схемата
  error.code === '42P01' || // Postgres: undefined_table
  (/price_seasons/.test(error.message ?? '') && /(schema cache|does not exist|could not find)/i.test(error.message ?? ''))

/** Има ли таблицата price_seasons (веднъж на зареждане на страницата). */
export function seasonsAvailable() {
  availability ??= supabase
    .from('price_seasons')
    .select('id')
    .limit(1)
    .then(({ error }) => !(error && isMissing(error)))
    .catch(() => true) // мрежова грешка — не скриваме функцията; зареждането ще покаже истинската грешка
  return availability
}

/** Сезоните на имот като чернови за формата. */
export async function loadSeasons(propertyId) {
  const { data, error } = await supabase
    .from('price_seasons')
    .select('*')
    .eq('property_id', propertyId)
    .order('start_month')
    .order('start_day')
    .order('created_at')
  if (error) throw error
  return (data ?? []).map(toDraft)
}

/** Сезоните на имот като сурови редове (за календара и прегледа — те не ползват формата). */
export async function loadSeasonRows(propertyIds) {
  if (!(await seasonsAvailable())) return []
  let query = supabase.from('price_seasons').select('*')
  if (propertyIds) query = query.in('property_id', propertyIds)
  const { data, error } = await query
  if (error) return []
  return data ?? []
}

/** Нови сезони за току-що създаден имот (екранът „Нов имот“). */
export async function insertSeasons(propertyId, drafts) {
  if (!drafts.length) return
  const { error } = await supabase.from('price_seasons').insert(drafts.map((d) => toPayload(d, propertyId)))
  if (error) throw error
}

/**
 * Записва промените на сезоните на имота: изтритите се махат, променените се обновяват, новите се добавят.
 * original — какво е било заредено (за да се види кое е изтрито).
 */
export async function saveSeasons(propertyId, drafts, original) {
  const keptIds = new Set(drafts.filter((d) => d.id).map((d) => d.id))
  const removed = original.filter((o) => !keptIds.has(o.id)).map((o) => o.id)

  if (removed.length) {
    const { error } = await supabase.from('price_seasons').delete().in('id', removed)
    if (error) throw error
  }
  const before = new Map(original.map((o) => [o.id, o]))
  for (const d of drafts.filter((x) => x.id && before.has(x.id) && !sameSeason(x, before.get(x.id)))) {
    const { error } = await supabase.from('price_seasons').update(toPayload(d, propertyId)).eq('id', d.id)
    if (error) throw error
  }
  await insertSeasons(propertyId, drafts.filter((d) => !d.id))
  return loadSeasons(propertyId)
}

/** Сезоните на публикуван имот за страницата на госта (RPC public_seasons); без миграцията или при грешка — празен списък. */
export async function loadPublicSeasons(slug) {
  const { data, error } = await supabase.rpc('public_seasons', { p_slug: slug })
  if (error) return []
  return data ?? []
}
