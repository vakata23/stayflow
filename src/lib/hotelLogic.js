// Хотели: чиста логика без достъп до базата — подредба на стаите, планиране на нови стаи, шахматна таблица.
// Стаята е обикновен имот с родител (properties.parent_id = хотелът, миграция 019).

export const MAX_ROOMS_AT_ONCE = 60
export const MAX_ROOMS_PER_HOTEL = 300

/** Хотелът е имот от вид „Хотел“, към който има (или ще има) стаи. */
export const isHotel = (property) => property?.property_type === 'hotel'
export const isRoom = (property) => !!property?.parent_id

/** Групира стаите по вид (в реда на първата стая от вида). Стая без вид е сама за себе си. */
export function groupRooms(rooms) {
  const groups = []
  const byType = new Map()
  for (const room of [...(rooms ?? [])].sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')) || a.name.localeCompare(b.name, 'bg', { numeric: true }))) {
    const type = (room.room_type || room.name).trim()
    if (!byType.has(type)) {
      const g = { type, rooms: [] }
      byType.set(type, g)
      groups.push(g)
    }
    byType.get(type).rooms.push(room)
  }
  return groups
}

/** Име на стая: „Стая 101“. Празна представка → само номерът. */
export const roomName = (prefix, number) => [String(prefix ?? '').trim(), number].filter((x) => x !== '').join(' ')

/** Какво да се създаде: { type, count, startNumber, prefix, maxGuests, price } → редове или грешка. */
export function planRooms(input, existingNames = [], existingCount = 0) {
  const type = String(input.type ?? '').trim()
  const count = Number(input.count)
  const start = Number(input.startNumber)
  const guests = Number(input.maxGuests)
  const price = input.price === '' || input.price == null ? null : Number(input.price)
  if (!type) return { error: 'Напишете вида на стаите, например „Двойна стая“.' }
  if (type.length > 60) return { error: 'Видът на стаята е твърде дълъг (до 60 знака).' }
  if (!Number.isInteger(count) || count < 1) return { error: 'Броят стаи трябва да е поне 1.' }
  if (count > MAX_ROOMS_AT_ONCE) return { error: `Наведнъж може да добавите до ${MAX_ROOMS_AT_ONCE} стаи.` }
  if (existingCount + count > MAX_ROOMS_PER_HOTEL) return { error: `Един хотел може да има до ${MAX_ROOMS_PER_HOTEL} стаи.` }
  if (!Number.isInteger(start) || start < 0 || start > 99999) return { error: 'Началният номер трябва да е цяло число.' }
  if (!Number.isInteger(guests) || guests < 1 || guests > 50) return { error: 'Гостите на стая са от 1 до 50.' }
  if (price != null && !(price > 0)) return { error: 'Цената трябва да е положително число.' }
  const taken = new Set(existingNames.map((n) => String(n).trim().toLowerCase()))
  const rows = []
  for (let i = 0; i < count; i++) {
    const name = roomName(input.prefix, start + i)
    if (taken.has(name.toLowerCase())) return { error: `Вече има стая „${name}“. Сменете началния номер.` }
    taken.add(name.toLowerCase())
    rows.push({ name, room_type: type, max_guests: guests })
  }
  return { rows, price }
}

/** Адрес на страницата на стаята: хотел + име, до 40 знака, само a-z, 0-9 и тире. */
export function roomSlug(hotelSlug, name, slugify, salt = '') {
  const base = slugify(`${hotelSlug} ${name}`) || 'staya'
  const suffix = salt ? `-${salt}` : ''
  return (base.slice(0, 40 - suffix.length) + suffix).replace(/-+$/, '').replace(/^-+/, '')
}

/** Колко стаи са заети през даден ден: резервация заема стаята от check_in до деня ПРЕДИ check_out. */
export const coversNight = (b, iso) => b.status !== 'cancelled' && b.check_in <= iso && iso < b.check_out

export function dayStats(rooms, bookings, iso) {
  const busyRooms = new Set()
  let arrivals = 0
  let departures = 0
  for (const b of bookings) {
    if (b.status === 'cancelled') continue
    if (coversNight(b, iso)) busyRooms.add(b.property_id)
    if (b.check_in === iso) arrivals++
    if (b.check_out === iso) departures++
  }
  const total = rooms.length
  const occupied = rooms.filter((r) => busyRooms.has(r.id)).length
  return { total, occupied, free: total - occupied, arrivals, departures, percent: total ? Math.round((occupied / total) * 100) : 0 }
}

const addDaysISO = (iso, n) => {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Колони на шахматната таблица: n дни от дадена дата. */
export const timelineDays = (startISO, n) => Array.from({ length: n }, (_, i) => addDaysISO(startISO, i))

/** Къде е резервацията в реда: от кой ден (0…n-1) и колко дни, отрязана до показаното. Извън → null. */
export function bookingSpan(b, days) {
  if (b.status === 'cancelled' || !days.length) return null
  const first = days[0]
  const endExclusive = addDaysISO(days[days.length - 1], 1)
  if (b.check_out <= first || b.check_in >= endExclusive) return null
  const from = b.check_in < first ? first : b.check_in
  const to = b.check_out > endExclusive ? endExclusive : b.check_out
  const start = days.indexOf(from)
  const length = days.indexOf(to) === -1 ? days.length - start : days.indexOf(to) - start
  return { start, length: Math.max(1, length), cutLeft: b.check_in < first, cutRight: b.check_out > endExclusive }
}

/** Свободните стаи по дни — за реда най-долу в таблицата. */
export const freePerDay = (rooms, bookings, days) => days.map((iso) => dayStats(rooms, bookings, iso).free)

/** Ред от публичния отговор hotel_availability → може ли гостът да поиска този вид стая. */
export function canRequestType(row, nightsCount) {
  return !!row && row.rooms_free > 0 && !!row.room_slug && row.fits_guests !== false && Number(row.total) > 0 && nightsCount >= (row.min_nights ?? 1)
}
