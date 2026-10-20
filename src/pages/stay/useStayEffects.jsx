import { useEffect, useRef, useState } from 'react'

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)

/**
 * Следи дали елемент е във видимата област: null (още не е измерено), true или
 * false. Без IntersectionObserver (стар браузър) връща true — съдържанието
 * остава видимо, не скрито.
 */
export function useInView({ rootMargin = '0px', once = false, threshold = 0 } = {}) {
  const ref = useRef(null)
  const [inView, setInView] = useState(null)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return undefined
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          if (once) io.disconnect()
        } else if (!once) {
          setInView(false)
        }
      },
      { rootMargin, threshold }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [rootMargin, once, threshold])

  return [ref, inView]
}

/** Евро без излишни „.00“ за заглавната цена: 87 € или 87.50 €. */
export function shortPrice(value) {
  const n = Number(value) || 0
  return Number.isInteger(n) ? `${n} €` : `${n.toFixed(2)} €`
}
