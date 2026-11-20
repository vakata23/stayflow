import { supabase } from './supabase'
import { slugify } from './slug'
import { roomSlug } from './hotelLogic'

/**
 * Достъп до стаите на хотел (миграция 019). Докато миграцията не е пусната, колоната parent_id я няма —
 * тогава хотелската част не се вижда (hotelsAvailable() = false), а всичко останало работи както преди.
 */

let availability = null

const isMissing = (error) =>
  error.code === '42703' ||
  error.code === 'PGRST204' ||
  (/(parent_id|room_type|public_hotel_types|hotel_availability)/.test(error.message ?? '') && /(does not exist|schema cache|could not find)/i.test(error.message ?? ''))

/** Има ли колоната parent_id (веднъж на зареждане на страницата). */
export function hotelsAvailable() {
  availability ??= supabase
    .from('properties')
    .select('id, parent_id')
    .limit(1)
    .then(({ error }) => !(error && isMissing(error)))
    .catch(() => true)
  return availability
}

/** Стаите на един хотел, по ред на създаване. */
export async function loadRooms(hotelId) {
  const { data, error } = await supabase
    .from('properties')
    .select('id, name, room_type, max_guests, slug, is_listed, created_at')
    .eq('parent_id', hotelId)
    .order('created_at')
  if (error) throw error
  return data ?? []
}

/** Основната цена на стаите като карта id → цена (за списъка със стаи). */
export async function loadRoomPrices(roomIds) {
  if (!roomIds.length) return {}
  const { data } = await supabase.from('property_settings').select('property_id, base_price').in('property_id', roomIds)
  return Object.fromEntries((data ?? []).map((r) => [r.property_id, Number(r.base_price) || 0]))
}

/** Колко стаи има всеки хотел — за списъка с имоти: карта hotel_id → брой. */
export async function loadRoomCounts() {
  const { data, error } = await supabase.from('properties').select('parent_id').not('parent_id', 'is', null)
  if (error) return {}
  const counts = {}
  for (const r of data ?? []) counts[r.parent_id] = (counts[r.parent_id] ?? 0) + 1
  return counts
}

/** Идентификаторите на имотите, които са хотели със стаи (в тях не се записват резервации — те са по стаите). */
export async function loadHotelParentIds() {
  if (!(await hotelsAvailable())) return new Set()
  const { data } = await supabase.from('properties').select('parent_id').not('parent_id', 'is', null)
  return new Set((data ?? []).map((r) => r.parent_id))
}

/**
 * Създава стаите: един имот на стая (публикуван, със свой адрес за заявки) и основна цена.
 * Ако адрес се окаже зает, опитва пак със случаен край — не губи нищо от вече записаното.
 */
export async function createRooms(hotel, plan, ownerId) {
  const make = (salt) =>
    plan.rows.map((r, i) => ({
      owner_id: ownerId,
      parent_id: hotel.id,
      name: r.name,
      room_type: r.room_type,
      max_guests: r.max_guests,
      city: hotel.city ?? '',
      address: hotel.address ?? '',
      property_type: 'room',
      slug: roomSlug(hotel.slug || 'hotel', r.name, slugify, salt ? `${salt}${i}`.slice(0, 6) : ''),
      is_listed: true,
    }))
  let rows
  let error
  for (let attempt = 0; attempt < 4; attempt++) {
    const salt = attempt === 0 ? '' : crypto.randomUUID().replace(/-/g, '').slice(0, 3)
    ;({ data: rows, error } = await supabase.from('properties').insert(make(salt)).select('id'))
    if (!error) break
    if (error.code !== '23505') throw error
  }
  if (error) throw error
  if (plan.price != null) {
    const { error: e2 } = await supabase
      .from('property_settings')
      .upsert(rows.map((r) => ({ property_id: r.id, base_price: plan.price })), { onConflict: 'property_id' })
    if (e2) throw e2
  }
  return rows
}

/* ---------- публична страница ---------- */

/** Какви стаи предлага хотелът (празно → не е хотел или миграцията още не е пусната). */
export async function loadPublicHotelTypes(slug) {
  const { data, error } = await supabase.rpc('public_hotel_types', { p_slug: slug })
  if (error) return []
  return data ?? []
}

/** Свободни стаи по вид за дати. */
export async function searchHotelRooms(slug, checkIn, checkOut, guests) {
  const { data, error } = await supabase.rpc('hotel_availability', {
    p_slug: slug,
    p_check_in: checkIn,
    p_check_out: checkOut,
    p_guests: Number(guests),
  })
  if (error) throw error
  return data ?? []
}

/** Видовете имот за избор: „Хотел“ се предлага само ако хотелската част е включена в базата. */
export function propertyTypesFor(types, hotelsOn) {
  return hotelsOn ? types : types.filter((t) => t.value !== 'hotel')
}
