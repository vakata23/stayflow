import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'

/**
 * Лек помощник за движение в приложението (без библиотеки). Времената и кривите
 * са същите като в tokens.css (--duration-*, --ease-*); анимира се само
 * transform и opacity. При „намалено движение“ крайното състояние се показва веднага.
 */

export const DURATION = { fast: 120, base: 180, slow: 280 }
export const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)'
export const EASE_IN = 'cubic-bezier(0.4, 0, 1, 1)'

export function prefersReducedMotion() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// „Само веднъж“: ключовете, които вече са показани в тази сесия (до презареждане на страницата).
const seen = new Set()

/**
 * true само при първото показване на екрана в сесията. Ключът се отбелязва след
 * монтиране, така че всички елементи на екрана решават заедно (и StrictMode не го „изяжда“).
 */
export function useFirstTime(key) {
  const first = useMemo(() => !seen.has(key) && !prefersReducedMotion(), [key])
  useEffect(() => {
    seen.add(key)
  }, [key])
  return first
}

/**
 * „Входно“ появяване на екрана: true за кратко (700 ms) след като данните са готови и само при
 * първото показване в сесията. Презареждането на списък при смяна на филтър не го повтаря.
 */
export function useIntro(key, ready = true) {
  const first = useFirstTime(key)
  const until = useRef(0)
  if (first && ready && !until.current) until.current = performance.now() + 700
  return first && ready && performance.now() < until.current
}

/** Каскадно появяване само на първите ~8 елемента (стъпка 32 ms, виж .rise в components.css). */
export const STAGGER_MAX = 8
export const rise = (i, on = true) => (on && i < STAGGER_MAX ? { 'data-rise': i } : {})

/**
 * Брои число нагоре веднъж (≤ 600 ms, ease-out). Пише директно в елемента — без
 * презареждане на React на всеки кадър. Следващите промени на стойността са мигновени.
 * Връща ref за елемента, чийто текст се управлява.
 */
export function useCountUp(value, format, { id, duration = 600 } = {}) {
  const ref = useRef(null)
  const done = useRef(false)
  const animate = useFirstTime(id ?? 'count-' + (format?.name || 'n'))
  const fmt = useRef(format)
  fmt.current = format

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined
    if (value == null || !Number.isFinite(Number(value))) {
      el.textContent = ''
      return undefined
    }
    const target = Number(value)
    if (done.current || !animate) {
      el.textContent = fmt.current(target)
      done.current = true
      return undefined
    }
    done.current = true
    el.textContent = fmt.current(0)
    const t0 = performance.now()
    let raf = requestAnimationFrame(function tick(now) {
      const p = Math.min(1, (now - t0) / duration)
      el.textContent = fmt.current(target * (1 - (1 - p) ** 3))
      if (p < 1) raf = requestAnimationFrame(tick)
    })
    return () => {
      cancelAnimationFrame(raf)
      el.textContent = fmt.current(target)
    }
  }, [value, animate, duration])

  return ref
}

/**
 * Плъзгане на общ индикатор (FLIP): когато активният раздел се смени, „хапчето“ се
 * премества и сменя ширина само с transform. Вика се от layout ефект, след като DOM е
 * в крайно състояние. items — елементите, чиито позиции да се следят (иконите),
 * onlyMeasure — първо рисуване/преоразмеряване без анимация.
 */
export function slideIndicator(indicator, target, { animate = true } = {}) {
  if (!indicator || !target) return
  const host = indicator.offsetParent
  if (!host) return
  const hostRect = host.getBoundingClientRect()
  const to = target.getBoundingClientRect()
  const toX = to.left - hostRect.left
  const toY = to.top - hostRect.top
  // Текущото видимо положение (ако анимацията още върви, е между двете състояния).
  const from = indicator.getBoundingClientRect()
  const hadBox = indicator.dataset.ready === '1'
  indicator.style.left = '0'
  indicator.style.top = toY + 'px'
  indicator.style.width = to.width + 'px'
  indicator.style.height = to.height + 'px'
  indicator.style.transform = `translateX(${toX}px)`
  indicator.dataset.ready = '1'
  if (!animate || !hadBox || prefersReducedMotion() || typeof indicator.animate !== 'function') return
  const fromX = from.left - hostRect.left
  const sx = from.width / to.width || 1
  indicator.getAnimations().forEach((a) => a.cancel())
  indicator.animate(
    [
      { transform: `translateX(${fromX}px) scaleX(${sx})` },
      { transform: `translateX(${toX}px) scaleX(1)` },
    ],
    { duration: DURATION.base, easing: EASE_OUT }
  )
}

/**
 * Плавно преместване на елементи, на които мястото е сменено от оформлението (FLIP по X).
 * before — Map(елемент → left от предишното оформление). Връща Map с новите позиции
 * (мерят се преди анимацията, за да не включват нейния transform).
 */
export function flipX(elements, before, { duration = DURATION.base } = {}) {
  const els = elements.filter(Boolean)
  els.forEach((el) => el.getAnimations?.().forEach((a) => a.cancel()))
  const after = new Map(els.map((el) => [el, el.getBoundingClientRect().left]))
  if (!prefersReducedMotion()) {
    for (const el of els) {
      const prev = before.get(el)
      if (prev == null || typeof el.animate !== 'function') continue
      const dx = prev - after.get(el)
      if (Math.abs(dx) < 0.5) continue
      el.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], { duration, easing: EASE_OUT })
    }
  }
  return after
}
