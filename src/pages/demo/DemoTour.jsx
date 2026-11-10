import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, LayoutDashboard, CalendarDays, ClipboardList, TrendingUp, House, Sparkles, FileText, Inbox, Languages } from 'lucide-react'
import { TOUR } from '../../lib/demoTour'
import useWide from './useWide'

const ICONS = { LayoutDashboard, CalendarDays, ClipboardList, TrendingUp, House, Sparkles, FileText, Inbox, Languages }
const prefetched = new Set()
function prefetch(key, wide) {
  for (const kind of wide ? ['desktop', 'phone'] : ['phone']) {
    const src = `/demo/tour/${kind}-${key}.webp`
    if (prefetched.has(src)) continue
    prefetched.add(src)
    new Image().src = src
  }
}

/**
 * „Какво има вътре“: табове по функции; всеки показва истинския екран на приложението (с примерни данни) и какво се прави на него.
 * Достъпни табове (стрелки, Home/End), снимките на неизбраните функции не се теглят, докато не се изберат (или не се посочат).
 */
export default function DemoTour() {
  const [active, setActive] = useState(0)
  const wide = useWide()
  const tabs = useRef([])
  const item = TOUR[active]

  const select = (i, focus = false) => {
    setActive(i)
    prefetch(TOUR[i].key, wide)
    if (focus) tabs.current[i]?.focus()
  }
  const onKeyDown = (e) => {
    const last = TOUR.length - 1
    const to = { ArrowRight: active === last ? 0 : active + 1, ArrowLeft: active === 0 ? last : active - 1, Home: 0, End: last }[e.key]
    if (to === undefined) return
    e.preventDefault()
    select(to, true)
  }
  // следващата снимка е готова, преди да е поискана
  useEffect(() => {
    prefetch(TOUR[(active + 1) % TOUR.length].key, wide)
  }, [active, wide])

  return (
    <section id="tour" className="demo-sec tour" aria-labelledby="tour-title">
      <div className="stay-wrap">
        <h2 id="tour-title">Какво има вътре</h2>
        <p className="demo-lead">Това са истинските екрани на приложението, с примерни данни. Изберете функция и вижте как изглежда.</p>

        <div className="tour-tabs" role="tablist" aria-label="Функции на StayFlow" onKeyDown={onKeyDown}>
          {TOUR.map((t, i) => {
            const Icon = ICONS[t.icon]
            return (
              <button
                key={t.key}
                ref={(el) => (tabs.current[i] = el)}
                id={`tour-tab-${t.key}`}
                role="tab"
                type="button"
                aria-selected={i === active}
                aria-controls="tour-panel"
                tabIndex={i === active ? 0 : -1}
                className="tour-tab"
                onClick={() => select(i)}
                onMouseEnter={() => prefetch(t.key, wide)}
                onFocus={() => prefetch(t.key, wide)}
              >
                <Icon className="h-4 w-4" aria-hidden="true" strokeWidth={1.8} />
                {t.tab}
              </button>
            )
          })}
        </div>

        <div key={item.key} id="tour-panel" role="tabpanel" aria-labelledby={`tour-tab-${item.key}`} className="tour-panel" tabIndex={0}>
          <div className="tour-text">
            <h3>{item.title}</h3>
            <p className="tour-lead">{item.lead}</p>
            <ul className="tour-points">
              {item.points.map((p) => (
                <li key={p}>
                  <CheckCircle2 className="h-5 w-5" aria-hidden="true" strokeWidth={1.6} />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="tour-shots">
            {wide && (
              <div className="tour-win">
                <div className="tour-win__bar" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </div>
                <img src={`/demo/tour/desktop-${item.key}.webp`} width="1440" height="900" alt={item.alt} decoding="async" />
              </div>
            )}
            <div className="tour-phone">
              <img src={`/demo/tour/phone-${item.key}.webp`} width="780" height="1688" alt={wide ? '' : `${item.alt} — на телефон`} decoding="async" />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
