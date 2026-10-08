import { useEffect, useRef } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * Лайтбокс на цял екран. Затваря се с Esc или клик извън снимката, стрелките
 * и плъзгането (пръст) сменят снимките, фокусът влиза в диалога и се връща
 * там, откъдето е отворен; страницата зад него не се скролира.
 */
export default function Lightbox({ photos, index, alt, onClose, onChange }) {
  const closeRef = useRef(null)
  const touchX = useRef(null)
  const count = photos.length
  const prev = () => onChange((index - 1 + count) % count)
  const next = () => onChange((index + 1) % count)

  useEffect(() => {
    const opener = document.activeElement
    const scrollY = window.scrollY
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    return () => {
      document.body.style.overflow = prevOverflow
      if (opener instanceof HTMLElement) opener.focus({ preventScroll: true })
      window.scrollTo({ top: scrollY })
    }
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') prev()
      else if (e.key === 'ArrowRight') next()
      else if (e.key === 'Tab') {
        // Фокусът остава в диалога.
        const focusable = [...document.querySelectorAll('[data-lightbox] button')]
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Зарежда съседните снимки предварително, за да няма празно при смяна.
  useEffect(() => {
    for (const i of [index - 1, index + 1]) {
      const p = photos[(i + count) % count]
      if (p) new Image().src = p.url
    }
  }, [index, count, photos])

  const photo = photos[index]

  return (
    <div
      data-lightbox
      role="dialog"
      aria-modal="true"
      aria-label={`${alt} — снимка ${index + 1} от ${count}`}
      className="stay-lightbox"
      onClick={onClose}
      onTouchStart={(e) => {
        touchX.current = e.touches[0].clientX
      }}
      onTouchEnd={(e) => {
        if (touchX.current == null || count < 2) return
        const dx = e.changedTouches[0].clientX - touchX.current
        touchX.current = null
        if (Math.abs(dx) > 50) (dx > 0 ? prev : next)()
      }}
    >
      <button ref={closeRef} type="button" onClick={onClose} className="stay-lightbox__btn stay-lightbox__close" aria-label="Затвори">
        <X className="h-5 w-5" strokeWidth={1.6} />
      </button>
      {count > 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            prev()
          }}
          className="stay-lightbox__btn stay-lightbox__prev"
          aria-label="Предишна снимка"
        >
          <ChevronLeft className="h-6 w-6" strokeWidth={1.6} />
        </button>
      )}
      <img
        key={photo.url}
        src={photo.url}
        alt={`${alt} — снимка ${index + 1}`}
        className="stay-lightbox__img"
        onClick={(e) => e.stopPropagation()}
      />
      {count > 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            next()
          }}
          className="stay-lightbox__btn stay-lightbox__next"
          aria-label="Следваща снимка"
        >
          <ChevronRight className="h-6 w-6" strokeWidth={1.6} />
        </button>
      )}
      <p className="stay-lightbox__count">
        {index + 1} / {count}
      </p>
    </div>
  )
}
