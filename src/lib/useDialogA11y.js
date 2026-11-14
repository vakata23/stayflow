import { useEffect, useId, useRef } from 'react'

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/**
 * Достъпност за формите-прозорци: роля „диалог“ с име, фокус вътре и връщане към бутона, който го е отворил,
 * Tab/Shift+Tab не излизат навън, Esc затваря, страницата отзад не се скролира.
 * Ползване: const dlg = useDialogA11y(open, onClose); <div ref={dlg.ref} {...dlg.props}> … <h2 id={dlg.titleId}>
 */
export function useDialogA11y(open, onClose) {
  const ref = useRef(null)
  const titleId = useId()
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return undefined
    const opener = document.activeElement
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const panel = ref.current
    // Ако формата вече е сложила фокус на поле (autoFocus), не го пипаме; иначе — на самия прозорец.
    if (panel && !panel.contains(document.activeElement)) panel.focus({ preventScroll: true })

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeRef.current?.()
        return
      }
      if (e.key !== 'Tab' || !panel) return
      const items = [...panel.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null)
      if (!items.length) {
        e.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus({ preventScroll: true })
    }
  }, [open])

  return { ref, titleId, props: { role: 'dialog', 'aria-modal': true, 'aria-labelledby': titleId, tabIndex: -1 } }
}
