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

/** Плавно появяване при скрол — само opacity + transform (стилът е в stay.css). */
export function Reveal({ as: Tag = 'div', delay = 0, className = '', children, ...rest }) {
  const [ref, inView] = useInView({ rootMargin: '0px 0px -8% 0px', once: true })
  return (
    <Tag
      ref={ref}
      data-reveal
      className={`stay-reveal ${inView ? 'is-in' : ''} ${className}`}
      style={{ '--d': `${delay}ms` }}
      {...rest}
    >
      {children}
    </Tag>
  )
}

/** Зарежда шрифтовете на страницата (само тук, не за останалото приложение). */
const FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Manrope:wght@400;500;600;700&display=swap'

export function useStayFonts() {
  useEffect(() => {
    if (document.querySelector('link[data-stay-fonts]')) return undefined
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = FONTS_HREF
    link.setAttribute('data-stay-fonts', '')
    document.head.appendChild(link)
    return undefined // остава за целия сеанс — повторно зареждане не е нужно
  }, [])
}

/** Евро без излишни „.00“ за заглавната цена: 87 € или 87.50 €. */
export function shortPrice(value) {
  const n = Number(value) || 0
  return Number.isInteger(n) ? `${n} €` : `${n.toFixed(2)} €`
}
