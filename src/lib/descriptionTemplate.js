/**
 * Чернова на описание ОТ ШАБЛОН — без AI. Казва само това, което собственикът
 * е попълнил (тип, град, гости, стаи, удобства): без превъзходни степени, без
 * разстояния, без „близо до плажа“. Собственикът я редактира.
 */
import { AMENITIES } from './amenities.js'
import { transliterate } from './slug.js'

const TYPE_BG = { apartment: 'Апартамент', house: 'Къща', studio: 'Студио', villa: 'Вила', room: 'Стая', other: 'Имот' }
const TYPE_EN = { apartment: 'Apartment', house: 'House', studio: 'Studio', villa: 'Villa', room: 'Room', other: 'Property' }

const AMENITY_EN = {
  wifi: 'Wi-Fi',
  parking: 'parking',
  ac: 'air conditioning',
  heating: 'heating',
  kitchen: 'kitchen',
  fridge: 'fridge',
  washer: 'washing machine',
  balcony: 'terrace/balcony',
  tv: 'TV',
  pets: 'pets allowed',
  crib: 'baby cot',
  step_free: 'step-free access',
}

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

// „във“ пред в/ф, иначе „в“ (Варна → във Варна, Банско → в Банско).
const bgIn = (city) => (/^[вфВФ]/.test(city) ? 'във' : 'в')

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

function bgAmenity(key) {
  const label = AMENITIES.find((a) => a.key === key)?.label ?? key
  return label === 'WiFi' ? label : label.charAt(0).toLowerCase() + label.slice(1)
}

export function buildDescription(property, lang = 'bg') {
  const city = (property.city ?? '').trim()
  const guests = num(property.max_guests)
  const bedrooms = num(property.bedrooms)
  const beds = num(property.beds)
  const bathrooms = num(property.bathrooms)
  const area = num(property.area_m2)
  const amenities = (property.amenities ?? []).filter((k) => AMENITIES.some((a) => a.key === k))

  if (lang === 'en') {
    const type = TYPE_EN[property.property_type] ?? TYPE_EN.other
    const first = `${type}${city ? ` in ${transliterate(city)}` : ''}${guests ? ` for up to ${guests} ${guests === 1 ? 'guest' : 'guests'}` : ''}.`
    const rooms = [
      bedrooms && plural(bedrooms, 'bedroom', 'bedrooms'),
      beds && plural(beds, 'bed', 'beds'),
      bathrooms && plural(bathrooms, 'bathroom', 'bathrooms'),
      area && `${area} m²`,
    ].filter(Boolean)
    return [
      first,
      rooms.length && `${rooms.join(', ')}.`,
      amenities.length && `Amenities: ${amenities.map((k) => AMENITY_EN[k] ?? k).join(', ')}.`,
    ]
      .filter(Boolean)
      .join(' ')
  }

  const type = TYPE_BG[property.property_type] ?? TYPE_BG.other
  const first = `${type}${city ? ` ${bgIn(city)} ${city}` : ''}${guests ? ` за до ${guests} ${guests === 1 ? 'гост' : 'гости'}` : ''}.`
  const rooms = [
    bedrooms && plural(bedrooms, 'спалня', 'спални'),
    beds && plural(beds, 'легло', 'легла'),
    bathrooms && plural(bathrooms, 'баня', 'бани'),
    area && `${area} м²`,
  ].filter(Boolean)
  return [
    first,
    rooms.length && `${rooms.join(', ')}.`,
    amenities.length && `Удобства: ${amenities.map(bgAmenity).join(', ')}.`,
  ]
    .filter(Boolean)
    .join(' ')
}
