export const PROPERTY_TYPES = [
  { value: 'apartment', label: 'Апартамент' },
  { value: 'house', label: 'Къща' },
  { value: 'studio', label: 'Студио' },
  { value: 'villa', label: 'Вила' },
  { value: 'room', label: 'Стая' },
  { value: 'other', label: 'Друго' },
]

export function propertyTypeLabel(value) {
  return PROPERTY_TYPES.find((t) => t.value === value)?.label ?? value
}
