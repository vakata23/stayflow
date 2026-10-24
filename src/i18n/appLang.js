import { useSyncExternalStore } from 'react'

/**
 * Езикът на приложението на собственика: български (основен), гръцки, македонски.
 * Пази се в браузъра; при първо отваряне следва езика на браузъра (гръцки/македонски), иначе е български.
 * Речниците за гръцки и македонски се зареждат само при нужда — българският вариант не тегли нищо допълнително.
 */

export const APP_LANGUAGES = [
  { code: 'bg', name: 'Български', locale: 'bg-BG', html: 'bg' },
  { code: 'el', name: 'Ελληνικά', locale: 'el-GR', html: 'el' },
  { code: 'mk', name: 'Македонски', locale: 'mk-MK', html: 'mk' },
]
export const DEFAULT_APP_LANG = 'bg'

const STORE_KEY = 'stayflow.appLang'
const loaders = {
  el: () => import('./el.js'),
  mk: () => import('./mk.js'),
}
const dictionaries = {}
const listeners = new Set()
let current = null

const isLang = (code) => APP_LANGUAGES.some((l) => l.code === code)

function detect() {
  try {
    const stored = localStorage.getItem(STORE_KEY)
    if (isLang(stored)) return stored
  } catch {
    /* без запис — вървим по езика на браузъра */
  }
  for (const tag of navigator.languages?.length ? navigator.languages : [navigator.language]) {
    const base = String(tag).toLowerCase().split('-')[0]
    if (base === 'el' || base === 'mk') return base
    if (base === 'bg') return 'bg'
  }
  return DEFAULT_APP_LANG
}

export function getAppLang() {
  current ??= detect()
  return current
}

/** Локалът за Intl (дати, месеци) на текущия език. */
export function appLocale() {
  return APP_LANGUAGES.find((l) => l.code === getAppLang())?.locale ?? 'bg-BG'
}

/** Речникът на езика (след loadDictionary); за български — null (няма превод, текстовете са си български). */
export const getDictionary = (code) => dictionaries[code] ?? null

/** Зарежда речника на езика (веднъж). Български няма речник. */
export async function loadDictionary(code) {
  if (!loaders[code]) return null
  dictionaries[code] ??= (await loaders[code]()).default
  return dictionaries[code]
}

/** Сменя езика: първо се зарежда речникът, после всичко се превежда наведнъж (без мигане на български). */
export async function setAppLang(code) {
  if (!isLang(code) || code === getAppLang()) return
  await loadDictionary(code)
  current = code
  try {
    localStorage.setItem(STORE_KEY, code)
  } catch {
    /* изборът важи, докато страницата е отворена */
  }
  listeners.forEach((l) => l(code))
}

export function subscribeAppLang(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** { lang, locale, setLang } — за компоненти, които трябва да се прерисуват при смяна на езика. */
export function useAppLang() {
  const lang = useSyncExternalStore(subscribeAppLang, getAppLang, () => DEFAULT_APP_LANG)
  return { lang, locale: APP_LANGUAGES.find((l) => l.code === lang)?.locale ?? 'bg-BG', setLang: setAppLang }
}
