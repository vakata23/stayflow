// Хотели: логика за стаите, планиране, шахматна таблица.
//   node scripts/test-hotel.mjs
import {
  isHotel, isRoom, groupRooms, roomName, planRooms, roomSlug, coversNight, dayStats, timelineDays, bookingSpan, freePerDay, canRequestType,
  MAX_ROOMS_AT_ONCE, MAX_ROOMS_PER_HOTEL,
} from '../src/lib/hotelLogic.js'
import { slugify, SLUG_RE } from '../src/lib/slug.js'

let pass = 0
let fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) pass++
  else {
    fail++
    console.log('  ПРОВАЛ:', name, extra)
  }
}

/* ---------- вид имот ---------- */
ok('хотел и стая се разпознават', isHotel({ property_type: 'hotel' }) && !isHotel({ property_type: 'house' }) && !isHotel(null) && isRoom({ parent_id: 'x' }) && !isRoom({ parent_id: null }) && !isRoom({}))

/* ---------- групиране ---------- */
const rooms = [
  { id: 'c', name: 'Стая 201', room_type: 'Семеен апартамент', created_at: '2027-01-01T10:03' },
  { id: 'a', name: 'Стая 101', room_type: 'Двойна стая', created_at: '2027-01-01T10:01' },
  { id: 'b', name: 'Стая 102', room_type: 'Двойна стая', created_at: '2027-01-01T10:02' },
  { id: 'd', name: 'Стая 9', room_type: null, created_at: '2027-01-01T10:04' },
]
const g = groupRooms(rooms)
ok('групиране: три групи в реда на първата стая от вида', g.length === 3 && g[0].type === 'Двойна стая' && g[1].type === 'Семеен апартамент' && g[2].type === 'Стая 9', JSON.stringify(g.map((x) => x.type)))
ok('групиране: двойните са 2 и по ред на номера', g[0].rooms.map((r) => r.id).join() === 'a,b')
ok('групиране: празен или липсващ списък', groupRooms([]).length === 0 && groupRooms(null).length === 0)
ok('групиране: числата в имената се подреждат по стойност (9 преди 10)', groupRooms([{ id: 'x', name: 'Стая 10', room_type: 'Т', created_at: 'a' }, { id: 'y', name: 'Стая 9', room_type: 'Т', created_at: 'a' }])[0].rooms[0].id === 'y')

/* ---------- имена ---------- */
ok('име: „Стая 101“, без представка само число', roomName('Стая', 101) === 'Стая 101' && roomName('', 7) === '7' && roomName('  Стая  ', 3) === 'Стая 3')

/* ---------- планиране ---------- */
const base = { type: 'Двойна стая', count: 3, startNumber: 101, prefix: 'Стая', maxGuests: 2, price: 80 }
let p = planRooms(base)
ok('план: 3 стаи с номера 101–103', p.rows?.length === 3 && p.rows.map((r) => r.name).join() === 'Стая 101,Стая 102,Стая 103' && p.price === 80)
ok('план: всяка стая носи вида и броя гости', p.rows.every((r) => r.room_type === 'Двойна стая' && r.max_guests === 2))
ok('план: цената е по избор', planRooms({ ...base, price: '' }).price === null && planRooms({ ...base, price: undefined }).price === null)
ok('план: празен вид се отхвърля', !!planRooms({ ...base, type: '  ' }).error)
ok('план: твърде дълъг вид се отхвърля', !!planRooms({ ...base, type: 'я'.repeat(61) }).error)
ok('план: брой 0, дробен и отрицателен се отхвърлят', [0, 1.5, -2, 'abc'].every((c) => !!planRooms({ ...base, count: c }).error))
ok(`план: над ${MAX_ROOMS_AT_ONCE} наведнъж се отхвърля`, !!planRooms({ ...base, count: MAX_ROOMS_AT_ONCE + 1 }).error && !planRooms({ ...base, count: MAX_ROOMS_AT_ONCE }).error)
ok(`план: над ${MAX_ROOMS_PER_HOTEL} стаи общо се отхвърля`, !!planRooms({ ...base, count: 10 }, [], MAX_ROOMS_PER_HOTEL - 5).error && !planRooms({ ...base, count: 5 }, [], MAX_ROOMS_PER_HOTEL - 5).error)
ok('план: невалиден начален номер', [-1, 1.2, 100000, 'x'].every((s) => !!planRooms({ ...base, startNumber: s }).error))
ok('план: гости 0 и 51 се отхвърлят', !!planRooms({ ...base, maxGuests: 0 }).error && !!planRooms({ ...base, maxGuests: 51 }).error && !planRooms({ ...base, maxGuests: 50 }).error)
ok('план: цена 0 и отрицателна се отхвърлят', !!planRooms({ ...base, price: 0 }).error && !!planRooms({ ...base, price: -5 }).error)
ok('план: вече съществуваща стая (без значение от регистъра) се отхвърля с името', planRooms(base, ['стая 102']).error?.includes('Стая 102'))
ok('план: същото име не пречи на други номера', !planRooms(base, ['Стая 201']).error)

/* ---------- адрес на стая ---------- */
const s1 = roomSlug('hotel-slance', 'Стая 101', slugify)
ok('адрес: латиница, до 40 знака, валиден', s1 === 'hotel-slance-staya-101' && SLUG_RE.test(s1), s1)
const long = roomSlug('a'.repeat(38), 'Стая 101', slugify)
ok('адрес: рязане до 40 без тире накрая', long.length <= 40 && SLUG_RE.test(long) && !long.endsWith('-'), long)
const salted = roomSlug('hotel-slance', 'Стая 101', slugify, 'ab1')
ok('адрес: със суфикс при заетост', salted.endsWith('-ab1') && SLUG_RE.test(salted), salted)
ok('адрес: дългото име със суфикс остава до 40', roomSlug('a'.repeat(60), 'Стая 5', slugify, 'xy9').length <= 40)
ok('адрес: празен хотел и име не дават празно', SLUG_RE.test(roomSlug('', '', slugify)))

/* ---------- заетост ---------- */
const R = [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }, { id: 'r4' }]
const B = [
  { id: '1', property_id: 'r1', check_in: '2027-08-10', check_out: '2027-08-13', status: 'confirmed' },
  { id: '2', property_id: 'r2', check_in: '2027-08-12', check_out: '2027-08-14', status: 'pending' },
  { id: '3', property_id: 'r3', check_in: '2027-08-10', check_out: '2027-08-20', status: 'cancelled' },
  { id: '4', property_id: 'r1', check_in: '2027-08-13', check_out: '2027-08-15', status: 'confirmed' },
]
ok('нощ: от check_in включително до check_out изключително', coversNight(B[0], '2027-08-10') && coversNight(B[0], '2027-08-12') && !coversNight(B[0], '2027-08-13') && !coversNight(B[0], '2027-08-09'))
ok('нощ: отказаната не заема', !coversNight(B[2], '2027-08-12'))
let st = dayStats(R, B, '2027-08-12')
ok('ден 12.08: заети r1 и r2, свободни 2, 50%', st.occupied === 2 && st.free === 2 && st.percent === 50 && st.total === 4, JSON.stringify(st))
st = dayStats(R, B, '2027-08-13')
ok('ден 13.08: r1 заминава и пак пристига (сменя се гостът) → 1 пристигане и 1 заминаване, r1 и r2 заети', st.arrivals === 1 && st.departures === 1 && st.occupied === 2, JSON.stringify(st))
ok('ден без нищо: 0%, всички свободни', dayStats(R, B, '2027-09-01').percent === 0 && dayStats(R, B, '2027-09-01').free === 4)
ok('хотел без стаи: без деление на нула', dayStats([], B, '2027-08-12').percent === 0)
ok('два записа за една стая през деня не броят стаята два пъти', dayStats([{ id: 'r1' }], [B[0], { ...B[0], id: 'dup' }], '2027-08-11').occupied === 1)

/* ---------- шахматна таблица ---------- */
const days = timelineDays('2027-08-10', 14)
ok('дни: 14 поредни от 10.08 до 23.08, и през границата на месеца', days.length === 14 && days[0] === '2027-08-10' && days[13] === '2027-08-23' && timelineDays('2027-08-30', 4).join() === '2027-08-30,2027-08-31,2027-09-01,2027-09-02')
ok('дни: през Нова година и 29.02', timelineDays('2027-12-30', 4).join() === '2027-12-30,2027-12-31,2028-01-01,2028-01-02' && timelineDays('2028-02-28', 3).join() === '2028-02-28,2028-02-29,2028-03-01')
ok('участък: цялата в рамките на дните', JSON.stringify(bookingSpan(B[0], days)) === JSON.stringify({ start: 0, length: 3, cutLeft: false, cutRight: false }))
ok('участък: започва по-рано → отрязана вляво', (() => { const s = bookingSpan({ ...B[0], check_in: '2027-08-05' }, days); return s.start === 0 && s.length === 3 && s.cutLeft })())
ok('участък: свършва след края → отрязана вдясно', (() => { const s = bookingSpan({ ...B[0], check_in: '2027-08-20', check_out: '2027-08-30' }, days); return s.start === 10 && s.length === 4 && s.cutRight && !s.cutLeft })())
ok('участък: извън дните и отказана → null', bookingSpan({ ...B[0], check_in: '2027-07-01', check_out: '2027-07-05' }, days) === null && bookingSpan({ ...B[0], check_in: '2027-09-01', check_out: '2027-09-05' }, days) === null && bookingSpan(B[2], days) === null && bookingSpan(B[0], []) === null)
ok('участък: свършва точно в първия ден → не се вижда (денят на напускане е свободен)', bookingSpan({ ...B[0], check_in: '2027-08-08', check_out: '2027-08-10' }, days) === null)
ok('участък: започва в деня след последния → не се вижда', bookingSpan({ ...B[0], check_in: '2027-08-24', check_out: '2027-08-26' }, days) === null)
ok('участък: покрива всичко (започва преди, свършва след)', (() => { const s = bookingSpan({ ...B[0], check_in: '2027-08-01', check_out: '2027-09-10' }, days); return s.start === 0 && s.length === 14 && s.cutLeft && s.cutRight })())
ok('участък: едно денонощие е с дължина 1', bookingSpan({ ...B[0], check_in: '2027-08-15', check_out: '2027-08-16' }, days).length === 1)
const free = freePerDay(R, B, days)
ok('свободни по дни: 10.08 → 3, 12.08 → 2, 13.08 → 2, 16.08 → 4', free[0] === 3 && free[2] === 2 && free[3] === 2 && free[6] === 4 && free.length === 14, JSON.stringify(free))

/* ---------- публична заявка ---------- */
const row = { rooms_free: 2, room_slug: 'x', fits_guests: true, total: '240.00', min_nights: 2 }
ok('заявка: може при свободна стая, цена и достатъчно нощи', canRequestType(row, 3) && canRequestType(row, 2))
ok('заявка: не при по-малко нощи от минимума', !canRequestType(row, 1))
ok('заявка: не без свободни стаи, без стая, без цена, без място за гостите', !canRequestType({ ...row, rooms_free: 0 }, 3) && !canRequestType({ ...row, room_slug: null }, 3) && !canRequestType({ ...row, total: null }, 3) && !canRequestType({ ...row, total: '0' }, 3) && !canRequestType({ ...row, fits_guests: false }, 3) && !canRequestType(null, 3))
ok('заявка: липсващ минимум значи 1 нощ', canRequestType({ ...row, min_nights: null }, 1))

console.log(`\n${pass} успешни, ${fail} провалени\n`)
process.exit(fail ? 1 : 0)
