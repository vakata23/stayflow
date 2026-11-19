/** Страните на гостите — кодът е ISO 3166-1 alpha-2, името идва от браузъра на езика на приложението (без ръчен превод). */
export const GUEST_COUNTRIES = [
  'GR', 'BG', 'RO', 'RS', 'MK', 'AL', 'TR', 'CY', 'DE', 'AT', 'CH', 'GB', 'IE', 'FR', 'IT', 'ES', 'PT', 'NL', 'BE', 'LU',
  'PL', 'CZ', 'SK', 'HU', 'SI', 'HR', 'BA', 'ME', 'XK', 'UA', 'MD', 'LT', 'LV', 'EE', 'FI', 'SE', 'NO', 'DK', 'US', 'CA',
  'AU', 'IL', 'RU', 'GE', 'AM', 'AZ', 'CN', 'JP', 'KR', 'IN', 'AE', 'EG', 'BR',
]

/** [{ code, name }] — първо Гърция, после останалите по азбучен ред на името в езика на потребителя. */
export function countryOptions(locale = 'bg') {
  let names = null
  try {
    names = new Intl.DisplayNames([locale], { type: 'region' })
  } catch {
    names = null
  }
  const nameOf = (code) => {
    try {
      return names?.of(code) || code
    } catch {
      return code
    }
  }
  const list = GUEST_COUNTRIES.map((code) => ({ code, name: nameOf(code) }))
  const [first, ...rest] = list
  rest.sort((a, b) => a.name.localeCompare(b.name, locale))
  return [first, ...rest]
}

export function countryName(code, locale = 'bg') {
  if (!code) return ''
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) || code
  } catch {
    return code
  }
}
