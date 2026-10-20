/**
 * Фиксиран списък удобства (иконите идват от lucide-react в компонентите,
 * тук само ключ+етикет — пази се като jsonb масив от ключове в
 * properties.amenities). Редът тук е и редът на показване.
 */
export const AMENITIES = [
  { key: 'wifi', label: 'WiFi' },
  // Паркингът е с видове (group: 'parking'). Старият общ ключ „parking“ остава, за да не се
  // загубят вече записани имоти — в редакторите се вижда само ако е отметнат, а на публичната
  // страница се скрива, щом има поне един точен вид.
  { key: 'parking', label: 'Паркинг', legacy: true, group: 'parking' },
  { key: 'parking_free', label: 'Безплатен паркинг на място', group: 'parking' },
  { key: 'parking_paid', label: 'Платен паркинг', group: 'parking' },
  { key: 'parking_street', label: 'Паркинг на улицата', group: 'parking' },
  { key: 'garage', label: 'Гараж', group: 'parking' },
  { key: 'ev_charger', label: 'Зарядна станция за електромобили', group: 'parking' },
  { key: 'ac', label: 'Климатик' },
  { key: 'heating', label: 'Отопление' },
  { key: 'kitchen', label: 'Кухня' },
  { key: 'fridge', label: 'Хладилник' },
  { key: 'washer', label: 'Пералня' },
  { key: 'balcony', label: 'Тераса/балкон' },
  { key: 'tv', label: 'Телевизор' },
  { key: 'pets', label: 'Домашни любимци' },
  { key: 'crib', label: 'Детско креватче' },
  { key: 'step_free', label: 'Достъп без стъпала' },
]

export function amenityLabel(key) {
  return AMENITIES.find((a) => a.key === key)?.label ?? key
}

/** Ключовете на видовете паркинг (без стария общ „parking“). */
export const PARKING_KEYS = AMENITIES.filter((a) => a.group === 'parking' && !a.legacy).map((a) => a.key)

/** Общите удобства за редактора — всичко освен групата „Паркинг“. */
export const GENERAL_AMENITIES = AMENITIES.filter((a) => a.group !== 'parking')

/** Видовете паркинг за редактора; старият общ запис се показва само ако вече е отметнат. */
export function parkingOptions(selected = []) {
  return AMENITIES.filter((a) => a.group === 'parking' && (!a.legacy || selected.includes(a.key)))
}

/**
 * Удобствата за показване на гост: в реда на AMENITIES, само познати ключове, без
 * дубликати; общият „Паркинг“ се скрива, когато е избран поне един точен вид.
 */
export function listedAmenities(keys) {
  const set = new Set(Array.isArray(keys) ? keys : [])
  const specific = PARKING_KEYS.some((k) => set.has(k))
  return AMENITIES.filter((a) => set.has(a.key) && !(a.legacy && specific))
}

export const CANCELLATION_POLICIES = [
  { value: 'flexible', label: 'Гъвкава', hint: 'Пълно възстановяване до 24ч преди настаняване.' },
  { value: 'moderate', label: 'Умерена', hint: 'Пълно възстановяване до 5 дни преди настаняване.' },
  { value: 'strict', label: 'Строга', hint: 'Частично възстановяване, според близостта до датата.' },
]

export function cancellationLabel(value) {
  return CANCELLATION_POLICIES.find((p) => p.value === value)?.label ?? value
}
