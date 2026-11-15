import { LEGAL } from '../pages/stay/i18n/legalStrings.js'
import { toLatin, fromBrowserTag } from '../pages/stay/i18n/langTools.js'

/**
 * <html lang> → код на език за правните текстове. „sr“ е сръбска КИРИЛИЦА (така я пише публичната страница),
 * „sr-Latn“ — латиница; fromBrowserTag при „sr“ без шрифт би дал латиница и банерът би се разминал със страницата.
 */
export function docLangCode(tag) {
  const t = typeof tag === 'string' ? tag.trim().toLowerCase().replace(/_/g, '-') : ''
  if (t.split('-')[0] === 'sr') return t.includes('latn') ? 'sr-latn' : 'sr'
  return fromBrowserTag(t) ?? 'bg'
}

/**
 * Превод на правните текстове (банер, съгласия, връзки, карта) БЕЗ да се зареждат големите речници на /stay.
 * Липсващ ключ пада към английски, после български, накрая връща самия ключ — като translate() в core.js
 * (scripts/test-legal.mjs проверява, че двата дават еднакъв текст).
 * {име} се заменя от vars; непопълнено става празен низ — за връзки в текста подай { име: '{име}' }, вж. withLinks.
 */
export function legalText(code, key, vars = {}) {
  const base = code === 'sr-latn' ? 'sr' : code
  let text = LEGAL[base]?.[key] ?? LEGAL.en[key] ?? LEGAL.bg[key]
  if (text == null) return key
  if (code === 'sr-latn') text = toLatin(text)
  return text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''))
}
