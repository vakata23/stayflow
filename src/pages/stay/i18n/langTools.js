/**
 * Малки езикови помощници БЕЗ речници — ползват се и от основния пакет (банер за бисквитки), и от публичната
 * страница. Речниците на /stay са големи; те не бива да влизат в пакета, който се зарежда при всяко отваряне.
 */

/* ------------------------------------------------------------------ сръбска латиница */

const CYR_TO_LAT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ђ: 'đ', е: 'e', ж: 'ž', з: 'z', и: 'i', ј: 'j', к: 'k', л: 'l', љ: 'lj', м: 'm',
  н: 'n', њ: 'nj', о: 'o', п: 'p', р: 'r', с: 's', т: 't', ћ: 'ć', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'č', џ: 'dž', ш: 'š',
}

/** Сръбска кирилица → латиница (едно към едно). Латинските букви, цифрите и {заместителите} не се пипат. */
export function toLatin(text) {
  let out = ''
  for (const ch of text) {
    const lower = ch.toLowerCase()
    const lat = CYR_TO_LAT[lower]
    if (!lat) {
      out += ch
    } else if (lower === ch) {
      out += lat
    } else {
      out += lat.charAt(0).toUpperCase() + lat.slice(1) // Љ → Lj, Њ → Nj, Џ → Dž
    }
  }
  return out
}

export const normalize = (value) => (typeof value === 'string' ? value.trim().toLowerCase().replace(/_/g, '-') : '')

/** Езиков етикет на браузъра (напр. „ro-RO“, „sr-Latn-RS“) → наш код или null. */
export function fromBrowserTag(tag) {
  const t = normalize(tag)
  if (!t) return null
  const base = t.split('-')[0]
  if (base === 'sr') return t.includes('cyrl') ? 'sr' : 'sr-latn' // без указан шрифт — латиница, по-често в интернет
  return ['bg', 'en', 'mk', 'el', 'ro'].includes(base) ? base : null
}
