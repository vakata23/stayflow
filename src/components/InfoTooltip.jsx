import { useState, useRef, useEffect } from 'react'
import { Info } from 'lucide-react'

/**
 * Малка (i) икона, която при клик показва обяснение. Нарочно на клик, не
 * само на hover — на телефон няма hover, а метриките трябва да се разчитат
 * еднакво добре и там.
 */
export default function InfoTooltip({ text }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function onOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [open])

  return (
    <span className="relative inline-flex" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-full text-ink-muted hover:text-ink-soft"
        aria-label="Обяснение"
        aria-expanded={open}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute bottom-full left-1/2 z-10 mb-2 w-48 -translate-x-1/2 rounded-lg bg-ink px-3 py-2 text-xs leading-relaxed text-white shadow-lg">
          {text}
          <span className="absolute left-1/2 top-full -ml-1 h-2 w-2 -translate-y-1 rotate-45 bg-ink" />
        </div>
      )}
    </span>
  )
}
