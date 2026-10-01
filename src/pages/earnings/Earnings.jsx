import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  TrendingUp,
  PiggyBank,
  BedDouble,
  Receipt,
  Building2,
  AlertTriangle,
  Download,
  Sparkles,
  ClipboardList,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatDateBG, todayISO } from '../../lib/dates'
import { formatMoney } from '../../lib/money'
import { incompleteBookingsFilter } from '../../lib/bookings'
import { PERIODS, getPeriodRange, getChartRange, aggregateEarningsRows, downloadCsv } from '../../lib/earnings'
import { PageHeader, Card, Select, Input, Button, Alert, Spinner, EmptyState } from '../../components/ui'
import InfoTooltip from '../../components/InfoTooltip'
import EarningsChart from './EarningsChart'

const METRIC_INFO = {
  revenue: 'Цена на престоя за нощувките, попадащи в избрания период (без туристически данък). Отменени резервации не се броят.',
  net: 'Приходи минус комисионата, задържана от Airbnb/Booking за същия период.',
  occupancy: 'Продадени нощувки спрямо наличните нощувки (брой имоти × дни в периода).',
  adr: 'Средна цена на нощувка (ADR) = приходи ÷ продадени нощувки.',
  direct_share: 'Какъв дял от прихода идва от директни гости (не през платформа) спрямо платформите.',
  saved: 'Директният приход × обичайната комисионна ставка на всеки имот — колко би коствало, ако същите нощувки бяха през платформа.',
  sold: 'Разлика с „Приходи“: тук броим резервациите по ДАТАТА, на която са направени (независимо кога ще е престоят). „Приходи“ разпределя сумата по датата на НОЩУВКАТА. Пример: резервация направена днес за престой през март се брои в „Продадено“ за днешния месец, но в „Приходи“ за март.',
}

function MetricCard({ icon: Icon, label, value, sub, info, accent }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
          {label}
          <InfoTooltip text={info} />
        </span>
        {Icon && (
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${accent ? 'bg-brand-50' : 'bg-slate-100'}`}>
            <Icon className={`h-4 w-4 ${accent ? 'text-brand-600' : 'text-slate-400'}`} />
          </span>
        )}
      </div>
      <p className={`mt-2 text-2xl font-bold tracking-tight ${accent ? 'text-brand-700' : 'text-slate-900'}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
    </Card>
  )
}

export default function Earnings() {
  const [periodKind, setPeriodKind] = useState('month')
  const [customFrom, setCustomFrom] = useState(todayISO())
  const [customTo, setCustomTo] = useState(todayISO())

  const [hasProperties, setHasProperties] = useState(null)
  const [summary, setSummary] = useState(null)
  const [sold, setSold] = useState(null)
  const [chartRows, setChartRows] = useState([])
  const [propertyRows, setPropertyRows] = useState([])
  const [unpaid, setUnpaid] = useState([])
  const [propertyNames, setPropertyNames] = useState({})
  const [incompleteCount, setIncompleteCount] = useState(0)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const { from, to } = getPeriodRange(periodKind, { from: customFrom, to: customTo })

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    const chartRange = getChartRange(to)

    const [propsRes, periodRes, chartRes, byPropertyRes, balancesRes, incompleteRes, soldRes] = await Promise.all([
      supabase.from('properties').select('id, name'),
      supabase.rpc('earnings_by_month', { p_from: from, p_to: to }),
      supabase.rpc('earnings_by_month', { p_from: chartRange.from, p_to: chartRange.to }),
      supabase.rpc('earnings_by_property', { p_from: from, p_to: to }),
      supabase
        .from('booking_balances')
        .select('booking_id, property_id, guest_name, check_in, check_out, status, due, paid, outstanding')
        .gt('outstanding', 0)
        .order('check_in', { ascending: true }),
      incompleteBookingsFilter(supabase.from('bookings').select('id', { count: 'exact', head: true })),
      supabase.rpc('bookings_sold', { p_from: from, p_to: to }),
    ])

    if (periodRes.error) setError('Неуспешно зареждане на приходите: ' + periodRes.error.message)
    setSold(soldRes.data?.[0] ?? null)

    const names = Object.fromEntries((propsRes.data ?? []).map((p) => [p.id, p.name]))
    setPropertyNames(names)
    setHasProperties((propsRes.data ?? []).length > 0)

    setSummary(aggregateEarningsRows(periodRes.data ?? []))
    setChartRows(chartRes.data ?? [])
    setPropertyRows(byPropertyRes.data ?? [])
    setUnpaid(balancesRes.data ?? [])
    setIncompleteCount(incompleteRes.count ?? 0)
    setLoading(false)
  }, [from, to])

  useEffect(() => {
    load()
  }, [load])

  const exportCsv = () => {
    downloadCsv(
      `prihodi-po-imot_${from}_${to}.csv`,
      ['Имот', 'Нощувки', 'Заетост %', 'Приход', 'Нето', 'Средна цена', 'Дял директни %'],
      propertyRows.map((r) => [
        r.property_name,
        r.nights_sold,
        r.occupancy_pct,
        Number(r.revenue).toFixed(2),
        Number(r.net).toFixed(2),
        r.adr != null ? Number(r.adr).toFixed(2) : '',
        r.direct_share_pct ?? '',
      ])
    )
  }

  return (
    <div>
      <PageHeader
        icon={TrendingUp}
        title="Приходи"
        description="Колко печелите — и колко спестявате, като резервирате директно."
        action={
          <Button variant="secondary" onClick={exportCsv} disabled={propertyRows.length === 0}>
            <Download className="h-4 w-4" />
            Експорт CSV
          </Button>
        }
      />

      <div className="mt-8 space-y-6">
        {error && <Alert>{error}</Alert>}

        {incompleteCount > 0 && (
          <Link
            to="/bookings?incomplete=1"
            className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 hover:bg-amber-100"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="flex-1">
              Числата по-долу не са пълни — <strong>{incompleteCount}</strong>{' '}
              {incompleteCount === 1 ? 'резервация от платформа чака' : 'резервации от платформи чакат'} цена/комисиона.
            </span>
            <span className="shrink-0 text-xs font-semibold underline">Попълни ги</span>
          </Link>
        )}

        {/* Избор на период — един ред, скопва всичко под него. */}
        <Card className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriodKind(p.value)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  periodKind === p.value
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {p.label}
              </button>
            ))}
            {periodKind === 'custom' && (
              <>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-500">От</span>
                  <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-auto" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-500">До</span>
                  <Input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    min={customFrom}
                    className="w-auto"
                  />
                </label>
              </>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {formatDateBG(from)} – {formatDateBG(to)}
          </p>
        </Card>

        {hasProperties === false ? (
          <EmptyState
            icon={Building2}
            title="Първо добавете имот"
            description="Приходите се смятат от резервациите на вашите имоти. Добавете поне един, за да започнете."
            action={
              <Link to="/properties/new">
                <Button>Добави имот</Button>
              </Link>
            }
          />
        ) : loading ? (
          <Card>
            <Spinner />
          </Card>
        ) : (
          <>
            {/* Спестена комисиона — най-видимата метрика, нарочно отделена. */}
            <Card className="border-brand-200 bg-gradient-to-br from-brand-50 to-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-brand-700">
                    <Sparkles className="h-4 w-4" />
                    Спестена комисиона
                    <InfoTooltip text={METRIC_INFO.saved} />
                  </span>
                  <p className="mt-1 text-4xl font-bold tracking-tight text-brand-700">
                    {formatMoney(summary?.commission_saved ?? 0)}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Толкова не платихте на Airbnb/Booking, защото гостите резервираха директно.
                  </p>
                </div>
              </div>
            </Card>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <MetricCard
                icon={TrendingUp}
                label="Приходи"
                value={formatMoney(summary?.revenue ?? 0)}
                info={METRIC_INFO.revenue}
              />
              <MetricCard
                icon={PiggyBank}
                label="Нетно след комисиони"
                value={formatMoney(summary?.net ?? 0)}
                info={METRIC_INFO.net}
              />
              <MetricCard
                icon={ClipboardList}
                label="Продадено"
                value={formatMoney(sold?.revenue ?? 0)}
                sub={`${sold?.bookings_count ?? 0} ${sold?.bookings_count === 1 ? 'резервация' : 'резервации'} · нето ${formatMoney(sold?.net ?? 0)}`}
                info={METRIC_INFO.sold}
              />
              <MetricCard
                icon={BedDouble}
                label="Заетост"
                value={`${summary?.occupancy_pct ?? 0}%`}
                sub={`${summary?.nights_sold ?? 0} от ${summary?.available_nights ?? 0} нощувки`}
                info={METRIC_INFO.occupancy}
              />
              <MetricCard
                icon={Receipt}
                label="Средна цена на нощувка"
                value={summary?.adr != null ? formatMoney(summary.adr) : '—'}
                info={METRIC_INFO.adr}
              />
              <MetricCard
                icon={Building2}
                label="Директни vs платформи"
                value={summary?.direct_share_pct != null ? `${summary.direct_share_pct}% / ${round1(100 - summary.direct_share_pct)}%` : '—'}
                info={METRIC_INFO.direct_share}
              />
            </div>

            <Card className="p-5">
              <EarningsChart rows={chartRows} />
            </Card>

            <Card className="overflow-hidden">
              <header className="border-b border-slate-100 px-6 py-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Приходи по имот</h2>
              </header>
              {propertyRows.length === 0 ? (
                <p className="px-6 py-10 text-center text-sm text-slate-500">Няма данни за избрания период.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/60 text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-5 py-3 font-semibold">Имот</th>
                        <th className="px-5 py-3 font-semibold">Нощувки</th>
                        <th className="px-5 py-3 font-semibold">Заетост</th>
                        <th className="px-5 py-3 font-semibold">Приход</th>
                        <th className="px-5 py-3 font-semibold">Нето</th>
                        <th className="px-5 py-3 font-semibold">Ср. цена</th>
                        <th className="px-5 py-3 font-semibold">% директни</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 tabular-nums">
                      {propertyRows.map((r) => (
                        <tr key={r.property_id}>
                          <td className="px-5 py-3.5 font-medium text-slate-900">{r.property_name}</td>
                          <td className="px-5 py-3.5 text-slate-600">{r.nights_sold}</td>
                          <td className="px-5 py-3.5 text-slate-600">{r.occupancy_pct}%</td>
                          <td className="px-5 py-3.5 text-slate-600">{formatMoney(r.revenue)}</td>
                          <td className="px-5 py-3.5 text-slate-600">{formatMoney(r.net)}</td>
                          <td className="px-5 py-3.5 text-slate-600">{r.adr != null ? formatMoney(r.adr) : '—'}</td>
                          <td className="px-5 py-3.5 text-slate-600">{r.direct_share_pct ?? '—'}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card className="overflow-hidden">
              <header className="border-b border-slate-100 px-6 py-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                  Неплатени остатъци
                </h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  Всички резервации с неплатен остатък, независимо от избрания период.
                </p>
              </header>
              {unpaid.length === 0 ? (
                <p className="px-6 py-10 text-center text-sm text-slate-500">
                  Няма неплатени остатъци — всичко е уредено.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {unpaid.map((b) => (
                    <li key={b.booking_id}>
                      <Link
                        to={`/bookings?focus=${b.booking_id}`}
                        className="flex flex-wrap items-center justify-between gap-2 px-6 py-3.5 text-sm hover:bg-slate-50/60"
                      >
                        <div>
                          <p className="font-medium text-slate-900">{b.guest_name}</p>
                          <p className="text-xs text-slate-400">
                            {propertyNames[b.property_id] ?? '—'} · {formatDateBG(b.check_in)} – {formatDateBG(b.check_out)}
                          </p>
                        </div>
                        <span className="font-semibold text-amber-700">{formatMoney(b.outstanding)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  )
}

function round1(n) {
  return Math.round(n * 10) / 10
}
