import { useSyncExternalStore } from 'react'
import { CONSENT_KEY, parseConsent, serializeConsent } from './legal.js'

/**
 * Избор за бисквитки и външно съдържание. Един общ запис в браузъра (CONSENT_KEY), без Provider —
 * всеки компонент, който го чете, се прерисува при промяна, и в други раздели на браузъра също.
 *
 * Какво е „необходимо“ и не иска съгласие: сесията при вход, избраният език, интерфейсни предпочитания.
 * Какво иска съгласие: външно съдържание от трети страни (сега: картата от OpenStreetMap).
 * Нов вид външно съдържание → проверява се с useConsent().allowExternal.
 */
let choice = null
let reopened = false
let loaded = false
let version = 0
const listeners = new Set()

function load() {
  if (loaded) return
  loaded = true
  try {
    choice = parseConsent(localStorage.getItem(CONSENT_KEY))
  } catch {
    choice = null // частен режим / блокирано хранилище: питаме при всяко зареждане
  }
}

function emit() {
  version += 1
  listeners.forEach((l) => l())
}

export function setConsent(next) {
  load()
  choice = next
  reopened = false
  try {
    localStorage.setItem(CONSENT_KEY, serializeConsent(next))
  } catch {
    /* без запис — изборът важи, докато страницата е отворена */
  }
  emit()
}

/** „Настройки за бисквитки“ в долния ред — показва банера отново. */
export function openConsentSettings() {
  load()
  reopened = true
  emit()
}

const subscribe = (l) => {
  listeners.add(l)
  const onStorage = (e) => {
    if (e.key === CONSENT_KEY) {
      loaded = false
      emit()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(l)
    window.removeEventListener('storage', onStorage)
  }
}

const snapshot = () => {
  load()
  return `${version}|${choice ?? ''}|${reopened ? 1 : 0}`
}

export function useConsent() {
  const snap = useSyncExternalStore(subscribe, snapshot, () => '0||0')
  const [, c, r] = snap.split('|')
  return {
    choice: c || null,
    decided: Boolean(c),
    bannerOpen: !c || r === '1',
    allowExternal: c === 'all',
    accept: () => setConsent('all'),
    decline: () => setConsent('necessary'),
    reopen: openConsentSettings,
  }
}
