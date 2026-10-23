import { useEffect, useRef, useState } from 'react'
import { LayoutGrid } from 'lucide-react'
import { useStayLang } from './i18n'

/**
 * Снимките на имота. Голям екран: мозайка — една голяма и до четири малки (оформлението зависи от броя
 * снимки); телефон: лента на цял екран с щракване (scroll-snap) и брояч „1 / 8“. Една и съща
 * разметка и за двата вида — извън първите пет снимки мозайката ги скрива, а скритите не се теглят
 * (lazy). Първата е най-ранният и най-стабилен елемент при зареждане (размери + приоритет).
 * Без снимки — спокоен градиент от акцентния цвят, не празен блок. items = [{ url, thumb }].
 */
export default function PhotoMosaic({ items, alt, onOpen }) {
  const { t } = useStayLang()
  const scroller = useRef(null)
  const [active, setActive] = useState(0)
  const count = items.length

  useEffect(() => {
    const el = scroller.current
    if (!el) return undefined
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const w = el.clientWidth || 1
        setActive(Math.min(count - 1, Math.max(0, Math.round(el.scrollLeft / w))))
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [count])

  if (count === 0) return <div className="stay-gallery stay-gallery--empty" aria-hidden="true" />

  return (
    <div className="stay-gallery" data-count={Math.min(count, 5)}>
      <ul ref={scroller} className="stay-photos">
        {items.map((p, i) => {
          const small = p.thumb && p.thumb !== p.url
          return (
            <li key={p.url} className="stay-photo">
              <button type="button" onClick={() => onOpen(i)} aria-label={t('photoOpen', { i: i + 1, n: count })}>
                <img
                  src={small ? p.thumb : p.url}
                  srcSet={small ? `${p.thumb} 768w, ${p.url} 1600w` : undefined}
                  sizes={i === 0 ? '(min-width: 744px) 560px, 100vw' : '(min-width: 744px) 280px, 100vw'}
                  width="1200"
                  height="800"
                  loading={i === 0 ? 'eager' : 'lazy'}
                  fetchpriority={i === 0 ? 'high' : undefined}
                  decoding="async"
                  alt={i === 0 ? alt : t('photoAlt', { name: alt, i: i + 1 })}
                />
              </button>
            </li>
          )
        })}
      </ul>
      {count > 1 && (
        <>
          <p className="stay-gallery__count" aria-hidden="true">
            {active + 1} / {count}
          </p>
          <button type="button" className="stay-gallery__all" onClick={() => onOpen(0)}>
            <LayoutGrid className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
            {t('photosAll', { n: count })}
          </button>
        </>
      )}
    </div>
  )
}
