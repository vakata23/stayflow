import { useLayoutEffect, useRef, useState } from 'react'
import { Table2, BarChart3 } from 'lucide-react'
import { shortMonthLabel } from '../../lib/earnings'
import { formatMoney } from '../../lib/money'
import { useFirstTime } from '../../lib/motion'

// Цветовете идват от токените (chart-1 — директни, chart-2 — платформи), и двата ≥ 3:1 върху карта
// (проверява се в scripts/test-design.mjs). Стълбовете растат веднъж отдолу нагоре.

const GUTTER_L = 40
const PAD_R = 6
const PAD_T = 14
const LABEL_BAND = 24
const SEGMENT_GAP = 2

function niceMax(value) {
  if (value <= 0) return 100
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const steps = [1, 2, 2.5, 5, 10]
  for (const s of steps) {
    if (value <= s * magnitude) return s * magnitude
  }
  return 10 * magnitude
}

export default function EarningsChart({ rows }) {
  const [activeIndex, setActiveIndex] = useState(null)
  const [tableView, setTableView] = useState(false)
  const grow = useFirstTime('earnings-chart')

  // Графиката се рисува в реалния размер на контейнера (1 единица = 1 px) — шрифтът е 11 px на всеки екран.
  const wrapRef = useRef(null)
  const [width, setWidth] = useState(340)
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return undefined
    const measure = () => setWidth(Math.max(260, Math.round(el.clientWidth)))
    measure()
    if (typeof ResizeObserver !== 'function') return undefined
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const VB_W = width
  const VB_H = Math.round(Math.min(300, Math.max(210, width * 0.42)))
  const PLOT_W = VB_W - GUTTER_L - PAD_R
  const PLOT_H = VB_H - PAD_T - LABEL_BAND

  const data = rows.map((r) => ({
    month: r.month,
    direct: Number(r.direct_revenue ?? 0),
    ota: Number(r.ota_revenue ?? 0),
  }))

  const max = niceMax(Math.max(...data.map((d) => d.direct + d.ota), 1))
  const gridSteps = [0, 0.25, 0.5, 0.75, 1]

  const slotW = data.length ? PLOT_W / data.length : PLOT_W
  const BAR_W = Math.round(Math.min(32, Math.max(12, slotW * 0.5)))
  // На тесен екран подписваме през един месец (винаги и последния), за да не се слепват буквите.
  const labelStep = slotW < 30 ? 2 : 1
  const toY = (value) => PAD_T + PLOT_H * (1 - value / max)

  const active = activeIndex != null ? data[activeIndex] : null

  return (
    <div ref={wrapRef}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="text-[1.375rem] sm:text-[1.625rem]">Приходи по месеци</h2>
        <div className="flex items-center gap-4">
          {/* Легенда — извън SVG, за да остане шрифтът остър на всякакъв размер екран. */}
          <div className="flex flex-wrap items-center gap-4 text-[0.8125rem] text-ink-soft">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[3px] bg-chart-1" aria-hidden="true" />
              Директни
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[3px] bg-chart-2" aria-hidden="true" />
              Платформи
            </span>
          </div>
          <button type="button" onClick={() => setTableView((v) => !v)} className="btn btn-ghost btn-sm" aria-pressed={tableView}>
            {tableView ? <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" /> : <Table2 className="h-3.5 w-3.5" aria-hidden="true" />}
            {tableView ? 'Виж графика' : 'Виж като таблица'}
          </button>
        </div>
      </div>

      {tableView ? (
        <div className="table-wrap shadow-none ring-1 ring-line" tabIndex={0} role="region" aria-label="Приходи по месеци (таблица)">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Месец</th>
                <th scope="col" className="num">Директни</th>
                <th scope="col" className="num">Платформи</th>
                <th scope="col" className="num">Общо</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d, i) => (
                <tr key={i}>
                  <td>{shortMonthLabel(d.month)}</td>
                  <td className="num text-ink-soft">{formatMoney(d.direct)}</td>
                  <td className="num text-ink-soft">{formatMoney(d.ota)}</td>
                  <td className="num font-semibold">{formatMoney(d.direct + d.ota)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${VB_W} ${VB_H}`} width={VB_W} height={VB_H} className="block max-w-full" role="group" aria-label="Приходи по месеци, директни спрямо платформи">
            {/* Хоризонтални линии — тънки, рецесивни */}
            {gridSteps.map((g) => {
              const y = PAD_T + PLOT_H * (1 - g)
              return (
                <g key={g}>
                  <line x1={GUTTER_L} x2={VB_W - PAD_R} y1={y} y2={y} className="stroke-line" strokeWidth="1" />
                  <text x={GUTTER_L - 5} y={y + 4} textAnchor="end" fontSize="11" className="fill-ink-muted">
                    {Math.round(max * g)}
                  </text>
                </g>
              )
            })}

            {/* Стълбове */}
            {data.map((d, i) => {
              const x = GUTTER_L + i * slotW + (slotW - BAR_W) / 2
              const directH = (d.direct / max) * PLOT_H
              const otaH = (d.ota / max) * PLOT_H
              const baseline = PAD_T + PLOT_H
              const directY = baseline - directH
              const otaTopY = directH > 0 ? directY - SEGMENT_GAP - otaH : baseline - otaH
              const isActive = activeIndex === i
              const growProps = grow ? { className: 'grow-y', style: { animationDelay: `${Math.min(i, 11) * 20}ms`, transformBox: 'view-box', transformOrigin: `0 ${baseline}px` } } : {}

              return (
                <g key={i}>
                  {d.direct > 0 && (
                    <rect
                      x={x}
                      y={directY}
                      width={BAR_W}
                      height={Math.max(directH, 1)}
                      rx={d.ota > 0 ? 0 : 4}
                      className={`fill-chart-1 ${growProps.className ?? ''}`}
                      style={growProps.style}
                      opacity={isActive || activeIndex === null ? 1 : 0.45}
                    />
                  )}
                  {d.ota > 0 && (
                    <rect
                      x={x}
                      y={otaTopY}
                      width={BAR_W}
                      height={Math.max(otaH, 1)}
                      rx={4}
                      className={`fill-chart-2 ${growProps.className ?? ''}`}
                      style={growProps.style}
                      opacity={isActive || activeIndex === null ? 1 : 0.45}
                    />
                  )}
                  {(data.length - 1 - i) % labelStep === 0 && (
                    <text x={x + BAR_W / 2} y={VB_H - 7} textAnchor="middle" fontSize="11" className="fill-ink-muted">
                      {shortMonthLabel(d.month).split(' ')[0]}
                    </text>
                  )}

                  {/* Невидим hit target — целият слот, за да е удобно и на телефон. */}
                  <rect
                    x={GUTTER_L + i * slotW}
                    y={PAD_T}
                    width={slotW}
                    height={PLOT_H}
                    fill="transparent"
                    tabIndex={0}
                    role="button"
                    aria-label={`${shortMonthLabel(d.month)}: директни ${formatMoney(d.direct)}, платформи ${formatMoney(d.ota)}`}
                    onMouseEnter={() => setActiveIndex(i)}
                    onMouseLeave={() => setActiveIndex(null)}
                    onFocus={() => setActiveIndex(i)}
                    onBlur={() => setActiveIndex(null)}
                    onClick={() => setActiveIndex((cur) => (cur === i ? null : i))}
                    style={{ cursor: 'pointer', outline: 'none' }}
                  />
                </g>
              )
            })}
          </svg>

          {active && (
            <div
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-xl bg-ink px-3 py-2 text-xs text-card shadow-pop"
              style={{
                left: `${((GUTTER_L + activeIndex * slotW + slotW / 2) / VB_W) * 100}%`,
                top: `${(toY(active.direct + active.ota) / VB_H) * 100}%`,
              }}
            >
              <p className="font-semibold">{shortMonthLabel(active.month)}</p>
              <p>
                <span className="mr-1 inline-block h-1.5 w-3 rounded-full bg-chart-1 align-middle" />
                Директни: <strong>{formatMoney(active.direct)}</strong>
              </p>
              <p>
                <span className="mr-1 inline-block h-1.5 w-3 rounded-full bg-chart-2 align-middle" />
                Платформи: <strong>{formatMoney(active.ota)}</strong>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
