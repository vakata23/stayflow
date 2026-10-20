// Видове паркинг: логиката около списъка с удобства (без база, без мрежа).
// Пуска се с: node scripts/test-amenities.mjs
import { AMENITIES, PARKING_KEYS, GENERAL_AMENITIES, parkingOptions, listedAmenities, amenityLabel } from '../src/lib/amenities.js'
import { buildDescription } from '../src/lib/descriptionTemplate.js'
import { VISIBLE_AMENITY_KEYS } from '../src/lib/photoAnalysis.js'

let pass = 0
let fail = 0
const ok = (name, cond) => {
  if (cond) pass++
  else {
    fail++
    console.log('  ПРОВАЛ:', name)
  }
}

const keys = AMENITIES.map((a) => a.key)
ok('ключовете са уникални', new Set(keys).size === keys.length)
ok('петте вида паркинг са налични', ['parking_free', 'parking_paid', 'parking_street', 'garage', 'ev_charger'].every((k) => PARKING_KEYS.includes(k)))
ok('старият общ „parking“ не е в списъка с видове', !PARKING_KEYS.includes('parking'))
ok('старият ключ остава познат (етикет „Паркинг“)', amenityLabel('parking') === 'Паркинг')
ok('общите удобства нямат паркинг', GENERAL_AMENITIES.every((a) => a.group !== 'parking') && GENERAL_AMENITIES.some((a) => a.key === 'wifi'))

// Редактор: старият запис се вижда само ако е отметнат.
ok('редакторът показва 5 вида, без стария', parkingOptions([]).length === 5 && !parkingOptions([]).some((a) => a.key === 'parking'))
ok('редакторът показва стария запис, когато е отметнат', parkingOptions(['parking']).some((a) => a.key === 'parking') && parkingOptions(['parking']).length === 6)

// Публична страница: общият „Паркинг“ се скрива при точен вид, иначе остава.
const only = (list) => listedAmenities(list).map((a) => a.key)
ok('само старият запис → „Паркинг“ се показва', only(['wifi', 'parking']).join() === 'wifi,parking')
ok('точен вид скрива общия „Паркинг“', only(['parking', 'garage']).join() === 'garage')
ok('няколко вида се показват в реда на списъка', only(['ev_charger', 'garage', 'parking_free', 'wifi']).join() === 'wifi,parking_free,garage,ev_charger')
ok('непознати ключове и дубликати се пренебрегват', only(['nope', 'wifi', 'wifi']).join() === 'wifi')
ok('липсващ или невалиден масив не гърми', only(undefined).length === 0 && only(null).length === 0 && only('wifi').length === 0)

// Описание от шаблон: на български и английски, без двойно „Паркинг“.
const base = { property_type: 'apartment', city: 'Варна', max_guests: 4, amenities: ['wifi', 'parking', 'parking_free', 'ev_charger'] }
const bg = buildDescription(base, 'bg')
const en = buildDescription(base, 'en')
ok('BG описание: видовете са изброени', bg.includes('безплатен паркинг на място') && bg.includes('зарядна станция за електромобили'))
ok('BG описание: няма отделно общо „паркинг,“', !/удобства:[^.]*(^|, )паркинг(,|\.)/i.test(bg))
ok('EN описание: видовете са изброени', en.includes('free on-site parking') && en.includes('EV charging station'))
ok('EN описание: няма общо „parking,“ при точен вид', !/Amenities:[^.]*(^|, )parking(,|\.)/.test(en))
ok('BG описание със стария запис остава „паркинг“', buildDescription({ ...base, amenities: ['parking'] }, 'bg').includes('паркинг'))

// Снимките не могат да докажат вида паркинг → AI не го предлага.
ok('AI не предлага паркинг по снимка', !VISIBLE_AMENITY_KEYS.includes('parking') && VISIBLE_AMENITY_KEYS.every((k) => !PARKING_KEYS.includes(k)))

console.log(`test-amenities: ${pass} успешни, ${fail} провалени`)
process.exit(fail ? 1 : 0)
