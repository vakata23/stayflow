import { Fragment, useMemo, useSyncExternalStore } from 'react'
import { legalText, docLangCode } from './legalText.js'

/**
 * Езикът на правните елементи (банер за бисквитки, отметки за съгласие, връзки в долния ред, карта) следва
 * <html lang>: на /stay го задава езикът на госта, в приложението — езикът на собственика. Текстовете са в
 * src/pages/stay/i18n/legalStrings.js (общи с публичната страница; без големите ѝ речници в основния пакет).
 * Самите документи (Политика, Условия) са на български.
 */
function subscribe(listener) {
  const observer = new MutationObserver(listener)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
  return () => observer.disconnect()
}
const getTag = () => document.documentElement.lang || 'bg'

export function useDocLang() {
  const tag = useSyncExternalStore(subscribe, getTag, () => 'bg')
  return docLangCode(tag)
}

/** { lang, t } — t(ключ, { имена }) като на публичната страница. */
export function useLegalT() {
  const lang = useDocLang()
  return useMemo(() => ({ lang, t: (key, vars) => legalText(lang, key, vars) }), [lang])
}

/**
 * „Прочетох и приемам {terms} и {privacy}.“ → текст с живи връзки на мястото на {terms} и {privacy}.
 * Шаблонът е преведеният текст, така че редът на думите е правилен във всеки език.
 */
export function withLinks(template, nodes) {
  return template.split(/(\{\w+\})/g).map((part, i) => {
    const m = /^\{(\w+)\}$/.exec(part)
    return <Fragment key={i}>{m && nodes[m[1]] ? nodes[m[1]] : part}</Fragment>
  })
}
