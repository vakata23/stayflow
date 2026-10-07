/**
 * Фиксиран списък удобства (иконите идват от lucide-react в компонентите,
 * тук само ключ+етикет — пази се като jsonb масив от ключове в
 * properties.amenities). Редът тук е и редът на показване.
 */
export const AMENITIES = [
  { key: 'wifi', label: 'WiFi' },
  { key: 'parking', label: 'Паркинг' },
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

export const CANCELLATION_POLICIES = [
  { value: 'flexible', label: 'Гъвкава', hint: 'Пълно възстановяване до 24ч преди настаняване.' },
  { value: 'moderate', label: 'Умерена', hint: 'Пълно възстановяване до 5 дни преди настаняване.' },
  { value: 'strict', label: 'Строга', hint: 'Частично възстановяване, според близостта до датата.' },
]

export function cancellationLabel(value) {
  return CANCELLATION_POLICIES.find((p) => p.value === value)?.label ?? value
}
