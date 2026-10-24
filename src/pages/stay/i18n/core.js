/**
 * Езици на публичната страница — чиста логика без React (за да се тества с node):
 * списък, избор на език, превод с множествено число, сръбска латиница, датите.
 * Само гостите виждат тези езици; приложението на собственика си остава на български.
 */
import bg from './bg.js'
import en from './en.js'
import mk from './mk.js'
import sr from './sr.js'
import el from './el.js'
import ro from './ro.js'
import { monthName, weekdayShort } from '../../../lib/localeDates.js'

export const DEFAULT_LANG = 'bg'

/** Редът е и редът в падащия списък. name е на самия език — гостът търси своя. */
export const LANGUAGES = [
  { code: 'bg', name: 'Български', locale: 'bg-BG', html: 'bg' },
  { code: 'en', name: 'English', locale: 'en-GB', html: 'en' },
  { code: 'mk', name: 'Македонски', locale: 'mk-MK', html: 'mk' },
  { code: 'sr', name: 'Српски', locale: 'sr-RS', html: 'sr' },
  { code: 'sr-latn', name: 'Srpski', locale: 'sr-Latn-RS', html: 'sr-Latn' },
  { code: 'el', name: 'Ελληνικά', locale: 'el-GR', html: 'el' },
  { code: 'ro', name: 'Română', locale: 'ro-RO', html: 'ro' },
]
export const LANG_BY_CODE = Object.fromEntries(LANGUAGES.map((l) => [l.code, l]))

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

function latinize(dict) {
  const out = {}
  for (const [key, value] of Object.entries(dict)) {
    out[key] =
      typeof value === 'string' ? toLatin(value) : Object.fromEntries(Object.entries(value).map(([cat, s]) => [cat, toLatin(s)]))
  }
  return out
}

export const DICTS = { bg, en, mk, sr, 'sr-latn': latinize(sr), el, ro }

/* ------------------------------------------------------------------ избор на език */

export const isLang = (code) => typeof code === 'string' && Object.prototype.hasOwnProperty.call(LANG_BY_CODE, code)

const normalize = (value) => (typeof value === 'string' ? value.trim().toLowerCase().replace(/_/g, '-') : '')

/** Езиков етикет на браузъра (напр. „ro-RO“, „sr-Latn-RS“) → наш код или null. */
export function fromBrowserTag(tag) {
  const t = normalize(tag)
  if (!t) return null
  const base = t.split('-')[0]
  if (base === 'sr') return t.includes('cyrl') ? 'sr' : 'sr-latn' // без указан шрифт — латиница, по-често в интернет
  return ['bg', 'en', 'mk', 'el', 'ro'].includes(base) ? base : null
}

/**
 * Редът: ?lang= в адреса (връзка, която собственикът е изпратил на гост) → последният избор на госта →
 * езикът на браузъра → английски (не български: чужденец, чийто език не поддържаме, трябва да разбере страницата).
 */
export function pickLang({ param, stored, browser = [] } = {}) {
  const fromParam = normalize(param)
  if (isLang(fromParam)) return fromParam
  const fromStored = normalize(stored)
  if (isLang(fromStored)) return fromStored
  for (const tag of browser) {
    const hit = fromBrowserTag(tag)
    if (hit) return hit
  }
  return 'en'
}

/* ------------------------------------------------------------------ превод */

const pluralRules = {}
function pluralCategory(locale, n) {
  pluralRules[locale] ??= new Intl.PluralRules(locale)
  return pluralRules[locale].select(Number(n))
}

/**
 * t(ключ, { имена }) → текст. Обект { one, few, other } се избира по {n} според правилата на езика.
 * Липсващ ключ пада към английски, после български, накрая връща самия ключ — страницата не остава празна.
 */
export function translate(code, key, vars = {}) {
  const lang = LANG_BY_CODE[code] ?? LANG_BY_CODE[DEFAULT_LANG]
  const entry = DICTS[lang.code][key] ?? DICTS.en[key] ?? DICTS.bg[key]
  if (entry == null) return key
  const text = typeof entry === 'string' ? entry : (entry[pluralCategory(lang.locale, vars.n)] ?? entry.other)
  return text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''))
}

/**
 * Съобщенията, които /api/booking-request връща (български текст от сървъра), → ключове за превод.
 * Функцията не се пипа; непознато съобщение става общо „Неуспешно изпращане“ — гостът не вижда чужд език.
 * scripts/test-stay-i18n.mjs проверява, че всяко съобщение от сървъра е тук.
 */
export const SERVER_ERRORS = {
  'Сървърът не е конфигуриран.': 'srv.generic',
  'Невалидни данни.': 'errSend',
  'Невалиден имот.': 'srv.noProperty',
  'Имотът не е намерен.': 'srv.noProperty',
  'Невалидни дати.': 'srv.dates',
  'Този период не е наличен (датата може да е в миналото).': 'srv.dates',
  'Невалиден брой гости.': 'srv.guests',
  'Твърде много гости за този имот.': 'srv.guests',
  'Името е задължително.': 'errName',
  'Въведете телефон или имейл за връзка.': 'errContact',
  'Невалиден имейл адрес.': 'errEmail',
  'Невалиден телефонен номер (само цифри, интервали и +, поне 8 цифри).': 'errPhone',
  'Твърде много заявки. Опитайте отново по-късно.': 'srv.rate',
  'Временен проблем. Опитайте отново.': 'errSend',
  'Неуспешно записване. Опитайте отново.': 'errSend',
  'Тези дати вече не са свободни.': 'quoteTaken',
  'Цената за тези дати не е зададена — свържете се със собственика директно.': 'quoteNoPrice',
}

export const serverErrorKey = (message) => SERVER_ERRORS[message] ?? 'errSend'

/* ------------------------------------------------------------------ дати */

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

/** Дните от седмицата, от понеделник: „Пн Вт …“ / „Mon Tue …“ / „Δευ Τρί …“ — без точка накрая. */
export function weekdayLabels(locale) {
  return Array.from({ length: 7 }, (_, i) => cap(weekdayShort(locale, i)))
}

/** „Октомври 2026“ — месецът в именителен падеж (отделно от датата), с главна буква във всеки език. */
export function monthTitle(locale, year, month) {
  // monthName взема месеца от формата „месец + година“ (само той е в именителен падеж на всеки език), годината я слагаме сами
  return `${cap(monthName(locale, month, 'long'))} ${year}`
}
