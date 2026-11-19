/**
 * Шаблони за съобщения към гостите — чиста логика (без база, без мрежа), за да се тества в Node.
 * Тук са САМО текстовете към госта (български, гръцки, английски) и попълването на етикетите; екранът е в pages/Messages.jsx.
 * Файлът не се превежда като екран: това са документи към госта (като guestConfirm.js).
 */

export const KINDS = ['confirm', 'before_arrival', 'declaration_data', 'payment_reminder', 'after_stay']
export const LANGS = ['bg', 'el', 'en']

/** Етикетите, които шаблонът разбира: {name} → първото име на госта, и т.н. */
export const TAG_KEYS = ['name', 'property', 'checkin', 'checkout', 'nights', 'code', 'wifi', 'wifi_password', 'address', 'amount', 'link', 'owner']

export const DEFAULT_TEMPLATES = {
  confirm: {
    bg: 'Здравейте, {name}! Потвърждавам резервацията ви за {property}: пристигане {checkin}, напускане {checkout} ({nights}). Адрес: {address}. Очаквам ви! {owner}',
    el: 'Γεια σας {name}! Επιβεβαιώνω την κράτησή σας για {property}: άφιξη {checkin}, αναχώρηση {checkout} ({nights}). Διεύθυνση: {address}. Σας περιμένουμε! {owner}',
    en: 'Hello {name}! I confirm your booking at {property}: check-in {checkin}, check-out {checkout} ({nights}). Address: {address}. Looking forward to hosting you! {owner}',
  },
  before_arrival: {
    bg: 'Здравейте, {name}! Очакваме ви на {checkin} в {property}. Адрес: {address}. Кодът за входа е {code}, Wi-Fi: {wifi} (парола {wifi_password}). Всички подробности: {link}. До скоро! {owner}',
    el: 'Γεια σας {name}! Σας περιμένουμε στις {checkin} στο {property}. Διεύθυνση: {address}. Ο κωδικός της πόρτας είναι {code}, Wi-Fi: {wifi} (κωδικός {wifi_password}). Όλες οι πληροφορίες: {link}. Τα λέμε σύντομα! {owner}',
    en: 'Hello {name}! We look forward to welcoming you on {checkin} at {property}. Address: {address}. The door code is {code}, Wi-Fi: {wifi} (password {wifi_password}). All the details: {link}. See you soon! {owner}',
  },
  declaration_data: {
    bg: 'Здравейте, {name}! Преди пристигането ви в {property} ми трябват данни за регистрацията на престоя (изисква се по закон в Гърция): номер на паспорт и име както е в паспорта (за гръцки граждани — ΑΦΜ). Можете да ми ги изпратите в този чат. Благодаря! {owner}',
    el: 'Γεια σας {name}! Πριν την άφιξή σας στο {property} χρειάζομαι στοιχεία για την καταχώριση της διαμονής (απαιτείται από τον νόμο στην Ελλάδα): αριθμό διαβατηρίου και ονοματεπώνυμο όπως στο διαβατήριο (για Έλληνες πολίτες — ΑΦΜ). Μπορείτε να τα στείλετε σε αυτή τη συνομιλία. Ευχαριστώ! {owner}',
    en: 'Hello {name}! Before you arrive at {property} I need some details to register your stay (required by law in Greece): your passport number and your name as in the passport (Greek citizens: AFM tax number). You can send them in this chat. Thank you! {owner}',
  },
  payment_reminder: {
    bg: 'Здравейте, {name}! Напомням, че остатъкът за престоя в {property} е {amount}. Може да се плати по банков път или на място при пристигане. Ако вече е платено, игнорирайте съобщението. Благодаря! {owner}',
    el: 'Γεια σας {name}! Σας υπενθυμίζω ότι το υπόλοιπο για τη διαμονή στο {property} είναι {amount}. Μπορεί να καταβληθεί με τραπεζική κατάθεση ή στο κατάλυμα κατά την άφιξη. Αν έχει ήδη πληρωθεί, αγνοήστε το μήνυμα. Ευχαριστώ! {owner}',
    en: 'Hello {name}! A friendly reminder that the remaining balance for your stay at {property} is {amount}. It can be paid by bank transfer or on arrival. If you have already paid, please ignore this message. Thank you! {owner}',
  },
  after_stay: {
    bg: 'Здравейте, {name}! Благодаря, че избрахте {property}! Надявам се да сте останали доволни. Ще се радвам да ви приема отново. {owner}',
    el: 'Γεια σας {name}! Ευχαριστώ που επιλέξατε το {property}! Ελπίζω να μείνατε ευχαριστημένοι. Θα χαρώ να σας φιλοξενήσω ξανά. {owner}',
    en: 'Hello {name}! Thank you for choosing {property}! I hope you enjoyed your stay and would be happy to host you again. {owner}',
  },
}

/** Текстът за спешни случаи, който собственикът слага в правилата за гостите (карта на госта). Международен, на три езика. */
export const EMERGENCY_TEXT = 'Спешни случаи / Emergency / Έκτακτη ανάγκη: 112 (единен европейски номер) · Police 100 · Ambulance 166 · Fire 199 · Tourist police 1571.'
export const hasEmergencyInfo = (rules) => /\b112\b/.test(rules ?? '')

/** На какъв език да е съобщението според гражданството на госта; без гражданство — български. */
export function guestLanguage(country) {
  if (!country) return 'bg'
  if (country === 'GR') return 'el'
  if (country === 'BG') return 'bg'
  return 'en'
}

const NIGHTS = {
  bg: (n) => (n === 1 ? '1 нощ' : `${n} нощи`),
  el: (n) => (n === 1 ? '1 διανυκτέρευση' : `${n} διανυκτερεύσεις`),
  en: (n) => (n === 1 ? '1 night' : `${n} nights`),
}
const dmy = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '')
const nightsOf = (a, b) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000)
const DASH = '—'

/** Стойностите на етикетите за една резервация на даден език. Липсващото се замества с „—“, а не остава празно. */
export function buildContext({ booking = {}, property = {}, owner = {}, balance = null, link = '', lang = 'bg' }) {
  const n = booking.check_in && booking.check_out ? nightsOf(booking.check_in, booking.check_out) : 0
  const fmtMoney = (v) => `${Number(v).toFixed(2)} €`
  return {
    name: (booking.guest_name ?? '').trim().split(/\s+/)[0] || DASH,
    property: property.name || DASH,
    checkin: dmy(booking.check_in) || DASH,
    checkout: dmy(booking.check_out) || DASH,
    nights: n > 0 ? (NIGHTS[lang] ?? NIGHTS.en)(n) : DASH,
    code: property.access_code || DASH,
    wifi: property.wifi_name || DASH,
    wifi_password: property.wifi_password || DASH,
    address: [property.address, property.city].filter(Boolean).join(', ') || DASH,
    amount: balance == null ? DASH : fmtMoney(balance),
    link: link || DASH,
    owner: owner.name || '',
  }
}

/** Попълва {етикетите}. Непознат етикет остава както е (за да се види грешката), няма „undefined“. */
export function renderTemplate(text, ctx) {
  return String(text ?? '')
    .replace(/\{(\w+)\}/g, (m, key) => (key in ctx ? ctx[key] : m))
    .replace(/[ \t]+$/gm, '')
    .trim()
}

/** Текстът на шаблона: собствената редакция, ако я има, иначе по подразбиране. */
export function templateText(kind, lang, overrides = {}) {
  return overrides?.[kind]?.[lang] ?? DEFAULT_TEMPLATES[kind]?.[lang] ?? ''
}

/** Непознатите етикети в текст (за предупреждение при редакция). */
export function unknownTags(text) {
  return [...new Set([...String(text ?? '').matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((k) => !TAG_KEYS.includes(k)))]
}

/** Има ли поне един запис в редакциите и валидни ли са (за четене от localStorage). */
export function cleanOverrides(raw) {
  const out = {}
  if (!raw || typeof raw !== 'object') return out
  for (const kind of KINDS) {
    for (const lang of LANGS) {
      const v = raw?.[kind]?.[lang]
      if (typeof v === 'string' && v.trim() && v.length <= 2000) (out[kind] ??= {})[lang] = v
    }
  }
  return out
}

export function setOverride(overrides, kind, lang, text) {
  const next = JSON.parse(JSON.stringify(overrides ?? {}))
  if (!text.trim() || text === DEFAULT_TEMPLATES[kind][lang]) {
    if (next[kind]) {
      delete next[kind][lang]
      if (!Object.keys(next[kind]).length) delete next[kind]
    }
  } else (next[kind] ??= {})[lang] = text
  return next
}
