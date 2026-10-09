import { useEffect, useLayoutEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Ellipsis } from 'lucide-react'
import { flipX, slideIndicator } from '../lib/motion'

/**
 * Плаваща долна лента на телефон: 5 места, светла, заоблена, малко над долния ръб
 * (място за жеста). Активният раздел е „хапче“ с икона и име в мек теракот, останалите
 * са само икони. Хапчето се плъзга и сменя ширина с transform (≤ 180 ms, без пружина);
 * при намалено движение се сменя веднага. Всеки бутон е ≥ 44 px и има aria-label с името.
 */
export default function BottomNav({ tabs, activeKey, pending = 0, moreOpen, onMore }) {
  const hostRef = useRef(null)
  const pillRef = useRef(null)
  const parts = useRef({})
  const before = useRef(new Map())
  const activeRef = useRef(activeKey)
  activeRef.current = activeKey
  const placed = useRef(false)

  const icons = () => Object.values(parts.current).map((p) => p.icon).filter(Boolean)

  useLayoutEffect(() => {
    slideIndicator(pillRef.current, parts.current[activeKey]?.tab, { animate: placed.current })
    before.current = flipX(icons(), before.current)
    placed.current = true
  }, [activeKey])

  // Преоразмеряване (завъртане на екрана, шрифтове): само нова позиция, без анимация.
  useEffect(() => {
    if (typeof ResizeObserver !== 'function') return undefined
    const ro = new ResizeObserver(() => {
      slideIndicator(pillRef.current, parts.current[activeRef.current]?.tab, { animate: false })
      before.current = new Map(icons().map((el) => [el, el.getBoundingClientRect().left]))
    })
    ro.observe(hostRef.current)
    return () => ro.disconnect()
  }, [])

  const all = [...tabs, { key: 'more', label: 'Още', icon: Ellipsis }]

  return (
    <nav className="dock" aria-label="Долна навигация">
      <div className="dock-inner" ref={hostRef}>
        <span className="dock-pill" ref={pillRef} aria-hidden="true" />
        {all.map(({ key, label, icon: Icon, to }) => {
          const active = key === activeKey
          const isMore = key === 'more'
          const name = isMore && pending > 0 ? `${label}, чакащи заявки: ${pending}` : label
          const body = (
            <>
              <span
                className={isMore && pending > 0 ? 'dock-icon dock-icon-badged' : 'dock-icon'}
                ref={(el) => {
                  parts.current[key] = { ...parts.current[key], icon: el }
                }}
              >
                <Icon className="h-[1.375rem] w-[1.375rem]" strokeWidth={active ? 2.1 : 1.8} aria-hidden="true" />
                {isMore && pending > 0 && (
                  <span className="dock-badge" aria-hidden="true" data-count={pending > 9 ? '9+' : String(pending)} />
                )}
              </span>
              {active && <span className="dock-label">{label}</span>}
            </>
          )
          const setTab = (el) => {
            parts.current[key] = { ...parts.current[key], tab: el }
          }
          return isMore ? (
            <button
              key={key}
              ref={setTab}
              type="button"
              className="dock-tab"
              aria-label={name}
              aria-haspopup="dialog"
              aria-expanded={!!moreOpen}
              aria-current={active ? 'page' : undefined}
              data-active={active ? '1' : undefined}
              onClick={onMore}
            >
              {body}
            </button>
          ) : (
            <Link key={key} ref={setTab} to={to} className="dock-tab" aria-label={name} aria-current={active ? 'page' : undefined} data-active={active ? '1' : undefined}>
              {body}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
