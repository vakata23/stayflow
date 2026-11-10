import { registerSW } from 'virtual:pwa-register'

/**
 * Service worker-ът пази приложението офлайн, но браузърът проверява за нова версия само при първа навигация
 * след 24 часа — който е отварял StayFlow вчера, дълго вижда старата версия (нови адреси като /demo го връщат към
 * входа). Затова проверяваме сами: при зареждане, на всеки половин час и когато разделът се върне на преден план.
 * registerType е autoUpdate: щом новата версия е готова, страницата се презарежда.
 */
export function setupPwa() {
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) return
  // Нова версия поема управлението (skipWaiting + clientsClaim) → презареждаме веднъж, за да се види тя.
  // Първото инсталиране (няма предишен контролер) не презарежда нищо.
  const hadController = Boolean(navigator.serviceWorker.controller)
  let reloaded = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return
    reloaded = true
    window.location.reload()
  })
  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const check = () => registration.update().catch(() => {})
      check()
      setInterval(check, 30 * 60 * 1000)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
    },
  })
}
