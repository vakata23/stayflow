// Обтекаема система за транслитерация (Закон за транслитерацията, 2009).
const BG = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u',
  ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sht', ъ: 'a', ь: 'y', ю: 'yu', я: 'ya',
}

export const SLUG_RE = /^[a-z0-9-]{2,40}$/

/** Кирилица → латиница със запазени главни букви и интервали (Варна → Varna). */
export function transliterate(value) {
  return String(value ?? '')
    .split('')
    .map((ch) => {
      const mapped = BG[ch.toLowerCase()]
      if (mapped === undefined) return ch
      return ch !== ch.toLowerCase() ? mapped.charAt(0).toUpperCase() + mapped.slice(1) : mapped
    })
    .join('')
}

export function slugify(value) {
  return String(value ?? '')
    .toLowerCase()
    .split('')
    .map((ch) => BG[ch] ?? ch)
    .join('')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
    .replace(/-$/, '')
}
