import { useState } from 'react'
import { Table2, BarChart3 } from 'lucide-react'
import { shortMonthLabel } from '../../lib/earnings'
import { formatMoney } from '../../lib/money'

// Валидирани през dataviz скила (validate_palette.js) категориални цветове —
// референтните "aqua" и "blue" слотове, не брандовия тюркоазен (твърде нисък
// chroma, пада на chroma-floor проверката). ΔE 24.0 (нормално зрение),
// ΔE 9.6–23.1 (CVD) — минава всички твърди прагове.
const DIRECT_COLOR = '#1baf7a'
const OTA_COLOR = '#2a78d6'

const VB_W = 400
const VB_H = 230
const GUTTER_L = 30
const PAD_R = 6
const PAD_T = 14
const LABEL_BAND = 22
const PLOT_W = VB_W - GUTTER_L - PAD_R
const PLOT_H = VB_H - PAD_T - LABEL_BAND
const BAR_W = 16
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

  const data = rows.map((r) => ({
    month: r.month,
    direct: Number(r.direct_revenue ?? 0),
    ota: Number(r.ota_revenue ?? 0),
  }))

  const max = niceMax(Math.max(...data.map((d) => d.direct + d.ota), 1))
  const gridSteps = [0, 0.25, 0.5, 0.75, 1]

  const slotW = data.length ? PLOT_W / data.length : PLOT_W
  const toY = (value) => PAD_T + PLOT_H * (1 - value / max)

  const active = activeIndex != null ? data[activeIndex] : null

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium text-slate-700">Приходи по месеци — директни и платформи</p>
        <button
          type="button"
          onClick={() => setTableView((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50"
        >
          {tableView ? <BarChart3 className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />}
          {tableView ? 'Виж графика' : 'Виж като таблица'}
        </button>
      </div>

      {tableView ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 font-semibold">Месец</th>
                <th className="px-4 py-2 font-semibold">Директни</th>
                <th className="px-4 py-2 font-semibold">Платформи</th>
                <th className="px-4 py-2 font-semibold">Общо</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {data.map((d, i) => (
                <tr key={i}>
                  <td className="px-4 py-2 text-slate-700">{shortMonthLabel(d.month)}</td>
                  <td className="px-4 py-2 text-slate-600">{formatMoney(d.direct)}</td>
                  <td className="px-4 py-2 text-slate-600">{formatMoney(d.ota)}</td>
                  <td className="px-4 py-2 font-medium text-slate-900">{formatMoney(d.direct + d.ota)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="w-full" role="img" aria-label="Приходи по месеци, директни спрямо платформи">
            {/* Хоризонтални gridlines — тънки, рецесивни, едно стъпало от повърхността. */}
            {gridSteps.map((g) => {
              const y = PAD_T + PLOT_H * (1 - g)
              return (
                <g key={g}>
                  <line x1={GUTTER_L} x2={VB_W - PAD_R} y1={y} y2={y} stroke="#e1e0d9" strokeWidth="1" />
                  <text x={GUTTER_L - 4} y={y + 3} textAnchor="end" fontSize="9" fill="#898781">
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

              return (
                <g key={i}>
                  {d.direct > 0 && (
                    <rect
                      x={x}
                      y={directY}
                      width={BAR_W}
                      height={Math.max(directH, 1)}
                      rx={d.ota > 0 ? 0 : 4}
                      fill={DIRECT_COLOR}
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
                      fill={OTA_COLOR}
                      opacity={isActive || activeIndex === null ? 1 : 0.45}
                    />
                  )}
                  <text
                    x={x + BAR_W / 2}
                    y={VB_H - 6}
                    textAnchor="middle"
                    fontSize="9"
                    fill="#898781"
                  >
                    {shortMonthLabel(d.month).split(' ')[0]}
                  </text>

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
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-lg bg-slate-800 px-3 py-2 text-xs text-white shadow-lg"
              style={{
                left: `${((GUTTER_L + activeIndex * slotW + slotW / 2) / VB_W) * 100}%`,
                top: `${(toY(active.direct + active.ota) / VB_H) * 100}%`,
              }}
            >
              <p className="font-semibold">{shortMonthLabel(active.month)}</p>
              <p>
                <span className="mr-1 inline-block h-1.5 w-3 rounded-full align-middle" style={{ background: DIRECT_COLOR }} />
                Директни: <strong>{formatMoney(active.direct)}</strong>
              </p>
              <p>
                <span className="mr-1 inline-block h-1.5 w-3 rounded-full align-middle" style={{ background: OTA_COLOR }} />
                Платформи: <strong>{formatMoney(active.ota)}</strong>
              </p>
            </div>
          )}
        </div>
      )}

      {/* Легенда — извън SVG, за да остане шрифтът остър на всякакъв размер екран. */}
      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: DIRECT_COLOR }} />
          Директни
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: OTA_COLOR }} />
          Платформи
        </span>
      </div>
    </div>
  )
}
