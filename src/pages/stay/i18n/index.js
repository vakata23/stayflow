import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { DEFAULT_LANG, LANG_BY_CODE, isLang, pickLang, translate } from './core.js'

export { LANGUAGES, serverErrorKey, weekdayLabels, monthTitle } from './core.js'

const STORE_KEY = 'stayflow.stayLang'

let current = null
const listeners = new Set()

const readStored = () => {
  try {
    return localStorage.getItem(STORE_KEY)
  } catch {
    return null
  }
}

function currentLang() {
  if (current) return current
  const browser = navigator.languages?.length ? navigator.languages : [navigator.language]
  current = pickLang({ param: new URLSearchParams(window.location.search).get('lang'), stored: readStored(), browser })
  return current
}

/** Избор на госта: пази се в браузъра и в адреса (?lang=…), та връзката, която сподели, да е на същия език. */
export function setStayLang(code) {
  if (!isLang(code) || code === current) return
  current = code
  try {
    localStorage.setItem(STORE_KEY, code)
  } catch {
    /* без запис — изборът важи, докато страницата е отворена */
  }
  try {
    const url = new URL(window.location.href)
    url.searchParams.set('lang', code)
    window.history.replaceState(window.history.state, '', url)
  } catch {
    /* няма значение за работата на страницата */
  }
  listeners.forEach((l) => l())
}

const subscribe = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** { lang, locale, t, setLang } — един общ език за цялата публична страница, без Provider. */
export function useStayLang() {
  const lang = useSyncExternalStore(subscribe, currentLang, () => DEFAULT_LANG)
  return useMemo(
    () => ({
      lang,
      locale: LANG_BY_CODE[lang].locale,
      htmlLang: LANG_BY_CODE[lang].html,
      t: (key, vars) => translate(lang, key, vars),
      setLang: setStayLang,
    }),
    [lang]
  )
}

/** <html lang> следва езика на страницата (екранни четци, правилните форми на буквите, превод от браузъра). */
export function useDocumentLang() {
  const { htmlLang } = useStayLang()
  const original = useRef(null)
  useEffect(() => {
    original.current ??= document.documentElement.lang
    document.documentElement.lang = htmlLang
  }, [htmlLang])
  useEffect(
    () => () => {
      if (original.current != null) document.documentElement.lang = original.current
    },
    []
  )
}
