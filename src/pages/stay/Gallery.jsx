import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { prefersReducedMotion, Reveal } from './useStayEffects'

const pad = (n) => String(n).padStart(2, '0')

/**
 * „Филмова лента“: хоризонтална лента от кадри (3:2) със scroll-snap. Първата
 * снимка е в hero-то, затова лентата започва от втората. Всички кадри са lazy,
 * с размери и srcset (миниатюра за телефон, пълен файл за по-голям екран);
 * брояч „02 / 08“ показва къде си. items = [{ url, thumb }].
 */
export default function Gallery({ items, alt, onOpen }) {
  const scroller = useRef(null)
  const [active, setActive] = useState(0)
  const frames = items.slice(1)

  const stepOf = () => {
    const el = scroller.current
    const first = el?.firstElementChild
    if (!el || !first) return 0
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0
    return first.getBoundingClientRect().width + gap
  }

  const onScroll = useCallback(() => {
    const el = scroller.current
    const step = stepOf()
    if (!el || !step) return
    const max = frames.length - 1
    // На края на лентата последният кадр е „активен“ дори да не се подравнява по средата.
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4
    setActive(atEnd ? max : Math.min(max, Math.max(0, Math.round(el.scrollLeft / step))))
  }, [frames.length])

  useEffect(() => {
    const el = scroller.current
    if (!el) return undefined
    let raf = 0
    const handler = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(onScroll)
    }
    el.addEventListener('scroll', handler, { passive: true })
    return () => {
      el.removeEventListener('scroll', handler)
      cancelAnimationFrame(raf)
    }
  }, [onScroll])

  if (frames.length === 0) return null

  const go = (dir) =>
    scroller.current?.scrollBy({ left: dir * stepOf(), behavior: prefersReducedMotion() ? 'auto' : 'smooth' })

  return (
    <Reveal as="section" className="stay-strip-wrap" aria-label="Снимки на имота">
      <div className="stay-strip-head">
        <h2 className="stay-h2">
          <span className="stay-kicker">Кадри</span>
        </h2>
        <div className="stay-strip-tools">
          <p className="stay-counter" aria-live="polite">
            {pad(active + 2)} <span>/ {pad(items.length)}</span>
          </p>
          {frames.length > 1 && (
            <div className="stay-strip-nav">
              <button type="button" onClick={() => go(-1)} aria-label="Предишна снимка" disabled={active === 0}>
                <ChevronLeft className="h-5 w-5" strokeWidth={1.6} />
              </button>
              <button type="button" onClick={() => go(1)} aria-label="Следваща снимка" disabled={active >= frames.length - 1}>
                <ChevronRight className="h-5 w-5" strokeWidth={1.6} />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="stay-strip-stage">
        <ul ref={scroller} className="stay-strip">
          {frames.map((p, i) => {
            const small = p.thumb && p.thumb !== p.url
            return (
              <li key={p.url} className="stay-frame">
                <button type="button" onClick={() => onOpen(i + 1)} aria-label={`Отвори снимка ${i + 2} от ${items.length}`}>
                  <img
                    src={small ? p.thumb : p.url}
                    srcSet={small ? `${p.thumb} 768w, ${p.url} 1600w` : undefined}
                    sizes="(min-width: 640px) 560px, 78vw"
                    width="768"
                    height="512"
                    loading="lazy"
                    decoding="async"
                    alt={`${alt} — снимка ${i + 2}`}
                  />
                  <span className="stay-frame__no" aria-hidden="true">
                    {pad(i + 2)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </Reveal>
  )
}
