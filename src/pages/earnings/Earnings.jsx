import { useEffect, useRef, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  TrendingUp,
  PiggyBank,
  Wallet,
  BedDouble,
  Receipt,
  Building2,
  AlertTriangle,
  Download,
  Sparkles,
  ClipboardList,
  Plus,
  Minus,
  Pencil,
  Trash2,
  Paperclip,
  Wand2,
  Repeat,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { formatDateBG, todayISO, toISODate } from '../../lib/dates'
import { formatMoney } from '../../lib/money'
import { incompleteBookingsFilter } from '../../lib/bookings'
import {
  PERIODS,
  getPeriodRange,
  getChartRange,
  endOfMonth,
  aggregateEarningsRows,
  downloadCsv,
} from '../../lib/earnings'
import { fetchMoneyEntries, deleteMoneyEntry, signedReceiptUrl, removeReceiptImage } from '../../lib/moneyEntries'
import { fetchRules, generateMyAutoEntries, countAutoEntriesInRange, ruleTooltip } from '../../lib/recurringRules'
import SetupWizard from './SetupWizard'
import { PageHeader, Card, Select, Input, Button, Alert, Spinner, EmptyState, Modal, Segmented } from '../../components/ui'
import InfoTooltip from '../../components/InfoTooltip'
import MoneyEntryModal from '../../components/MoneyEntryModal'
import CountUp from '../../components/CountUp'
import { rise, useIntro } from '../../lib/motion'
import EarningsChart from './EarningsChart'

const METRIC_INFO = {
  revenue: 'Цена на престоя за нощувките, попадащи в избрания период (без туристически данък). Отменени резервации не се броят.',
  net: 'Приходи минус комисионата, задържана от Airbnb/Booking за същия период.',
  occupancy: 'Продадени нощувки спрямо наличните нощувки (брой имоти × дни в периода).',
  adr: 'Средна цена на нощувка (ADR) = приходи ÷ продадени нощувки.',
  direct_share: 'Какъв дял от прихода идва от директни гости (не през платформа) спрямо платформите.',
  saved: 'Директният приход × обичайната комисионна ставка на всеки имот — колко би коствало, ако същите нощувки бяха през платформа.',
  sold: 'Разлика с „Приходи“: тук броим резервациите по ДАТАТА, на която са направени (независимо кога ще е престоят). „Приходи“ разпределя сумата по датата на НОЩУВКАТА. Пример: резервация направена днес за престой през март се брои в „Продадено“ за днешния месец, но в „Приходи“ за март.',
  profit: 'Нетно след комисиони + допълнителни приходи (извън резервациите) − разходи за избрания период.',
}

const SETUP_SEEN_KEY = 'stayflow.autoSetupSeen'

const todayMonth = () => todayISO().slice(0, 7)

function monthRange(ym) {
  const [y, m] = ym.split('-').map(Number)
  const start = new Date(y, m - 1, 1)
  return { from: toISODate(start), to: toISODate(endOfMonth(start)) }
}

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1)
const monthName = (iso, withYear) =>
  new Intl.DateTimeFormat('bg-BG', withYear ? { month: 'long', year: 'numeric' } : { month: 'long' }).format(new Date(`${iso}T12:00:00`))

const fmtInt = (n) => String(Math.round(n))

/** Показател без собствена карта: етикет, число с таблични цифри (Literata), подсказка. */
function Metric({ icon: Icon, label, info, sub, children }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-sm font-medium text-ink-soft">
        {Icon && <Icon className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />}
        <span className="min-w-0">{label}</span>
        <InfoTooltip text={info} />
      </p>
      <p className="num mt-2 font-display text-[1.75rem] font-semibold leading-none tracking-tight sm:text-[2rem]">{children}</p>
      {sub && <p className="mt-1.5 text-[0.8125rem] text-ink-muted">{sub}</p>}
    </div>
  )
}

/** Печалбата е героят на екрана: цялата част е огромна, стотинките и валутата — по-малки. */
function HeroProfit({ value }) {
  const v = Number(value) || 0
  const abs = Math.abs(v)
  const dec = abs.toFixed(2).split('.')[1]
  return (
    <p
      role="img"
      aria-label={`Печалба ${formatMoney(v)}`}
      className="num flex items-baseline font-display text-[3.5rem] font-semibold leading-none tracking-tighter text-ink sm:text-[5.5rem]"
    >
      {v < 0 && <span aria-hidden="true">−</span>}
      <CountUp value={Math.trunc(abs)} id="earnings-profit" format={fmtInt} />
      <span aria-hidden="true" className="ml-1 text-[0.4em] font-medium text-ink-soft">
        .{dec} €
      </span>
    </p>
  )
}

export default function Earnings() {
  const { profile, user } = useAuth()
  const [periodKind, setPeriodKind] = useState('month')
  const [customFrom, setCustomFrom] = useState(todayISO())
  const [customTo, setCustomTo] = useState(todayISO())

  const [hasProperties, setHasProperties] = useState(null)
  const [summary, setSummary] = useState(null)
  const [sold, setSold] = useState(null)
  const [chartRows, setChartRows] = useState([])
  const [propertyRows, setPropertyRows] = useState([])
  const [unpaid, setUnpaid] = useState([])
  const [properties, setProperties] = useState([])
  const [propertyNames, setPropertyNames] = useState({})
  const [incompleteCount, setIncompleteCount] = useState(0)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Независим филтър по месец за леджера "Последни разходи и приходи" —
  // отделен от избрания отгоре период (той поддържа година/custom/предстоящи).
  const [ledgerMonth, setLedgerMonth] = useState(todayMonth())
  const [ledgerEntries, setLedgerEntries] = useState([])
  const [ledgerLoading, setLedgerLoading] = useState(true)
  const [ledgerError, setLedgerError] = useState(null)
  const [receiptUrls, setReceiptUrls] = useState({})

  const [rules, setRules] = useState([])
  const [autoCount, setAutoCount] = useState(0)
  const [wizardOpen, setWizardOpen] = useState(false)

  const [entryModal, setEntryModal] = useState(null) // { kind, entry? }
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const animate = useIntro('screen-earnings', !loading)

  const { from, to } = getPeriodRange(periodKind, { from: customFrom, to: customTo })

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    const chartRange = getChartRange(to)

    const [propsRes, periodRes, chartRes, byPropertyRes, balancesRes, incompleteRes, soldRes, autoN] = await Promise.all([
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
      countAutoEntriesInRange(from, to).catch(() => 0),
    ])

    setAutoCount(autoN)
    if (periodRes.error) setError('Неуспешно зареждане на приходите: ' + periodRes.error.message)
    setSold(soldRes.data?.[0] ?? null)

    const names = Object.fromEntries((propsRes.data ?? []).map((p) => [p.id, p.name]))
    setProperties(propsRes.data ?? [])
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

  // Автоматичните записи: при отваряне на „Приходи“ догонваме каквото се е
  // натрупало (резервации, напуснали след последното пускане). Ако са
  // създадени нови — презареждаме. Грешка (напр. още няма правила) е тиха.
  const loadRules = useCallback(async () => {
    const list = await fetchRules().catch(() => null)
    if (list) {
      setRules(list)
      if (list.length === 0 && !localStorage.getItem(SETUP_SEEN_KEY)) setWizardOpen(true)
    }
  }, [])

  // refs — за да презаредим с ТЕКУЩИЯ период, а не с този от първото рендиране
  const reloadRef = useRef(null)
  reloadRef.current = () => {
    load()
    loadLedger()
  }

  useEffect(() => {
    loadRules()
    generateMyAutoEntries()
      .then((n) => n > 0 && reloadRef.current())
      .catch(() => {})
  }, [])

  const closeWizard = () => {
    localStorage.setItem(SETUP_SEEN_KEY, '1')
    setWizardOpen(false)
  }

  const loadLedger = useCallback(async () => {
    setLedgerLoading(true)
    setLedgerError(null)
    try {
      const range = monthRange(ledgerMonth)
      const rows = await fetchMoneyEntries(range)
      setLedgerEntries(rows)

      const withReceipt = rows.filter((r) => r.receipt_path)
      const urls = await Promise.all(withReceipt.map((r) => signedReceiptUrl(r.receipt_path)))
      setReceiptUrls(Object.fromEntries(withReceipt.map((r, i) => [r.id, urls[i]])))
    } catch (err) {
      setLedgerError('Неуспешно зареждане: ' + err.message)
    } finally {
      setLedgerLoading(false)
    }
  }, [ledgerMonth])

  useEffect(() => {
    loadLedger()
  }, [loadLedger])

  const handleEntrySaved = () => {
    load()
    loadLedger()
  }

  const handleDeleteConfirmed = async () => {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      await deleteMoneyEntry(confirmDelete.id)
      if (confirmDelete.receipt_path) await removeReceiptImage(confirmDelete.receipt_path)
      setConfirmDelete(null)
      handleEntrySaved()
    } catch (err) {
      setLedgerError('Неуспешно изтриване: ' + err.message)
    } finally {
      setDeleting(false)
    }
  }

  const exportCsv = () => {
    downloadCsv(
      `prihodi-po-imot_${from}_${to}.csv`,
      ['Имот', 'Нощувки', 'Заетост %', 'Приход', 'Нето', 'Средна цена', 'Дял директни %', 'Доп. приход', 'Разходи', 'Печалба'],
      propertyRows.map((r) => [
        r.property_name,
        r.nights_sold,
        r.occupancy_pct ?? '',
        Number(r.revenue).toFixed(2),
        Number(r.net).toFixed(2),
        r.adr != null ? Number(r.adr).toFixed(2) : '',
        r.direct_share_pct ?? '',
        Number(r.other_income ?? 0).toFixed(2),
        Number(r.expenses ?? 0).toFixed(2),
        Number(r.profit ?? 0).toFixed(2),
      ])
    )
  }

  const eyebrow = periodKind === 'month' ? capitalize(monthName(from, true)) : `${formatDateBG(from)} – ${formatDateBG(to)}`
  const heroLabel = periodKind === 'month' ? `Печалба за ${monthName(from, false)}` : 'Печалба за периода'

  return (
    <div>
      <PageHeader
        eyebrow={eyebrow}
        title="Приходи"
        description="Колко печелите — и колко спестявате, като резервирате директно."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setEntryModal({ kind: 'expense' })}>
              <Minus className="h-4 w-4" />
              Разход
            </Button>
            <Button onClick={() => setEntryModal({ kind: 'income' })}>
              <Plus className="h-4 w-4" />
              Приход
            </Button>
          </div>
        }
      />

      <div className="mt-8 space-y-6 sm:mt-10">
        {error && <Alert>{error}</Alert>}

        {incompleteCount > 0 && (
          <Link
            to="/bookings?incomplete=1"
            className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-warning-soft px-5 py-3.5 text-sm text-warning-ink shadow-card"
          >
            <AlertTriangle className="h-[1.125rem] w-[1.125rem] shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 basis-[12rem]">
              Числата по-долу не са пълни — <strong>{incompleteCount}</strong>{' '}
              {incompleteCount === 1 ? 'резервация от платформа чака' : 'резервации от платформи чакат'} цена/комисиона.
            </span>
            <span className="shrink-0 text-xs font-semibold underline">Попълни ги</span>
          </Link>
        )}

        {/* Избор на период — един ред, скопва всичко под него. */}
        <div>
          <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
            <Segmented label="Период" options={PERIODS} value={periodKind} onChange={setPeriodKind} className="!grid w-full grid-cols-2 sm:!inline-flex sm:w-auto" />
            {periodKind === 'custom' && (
              <>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-ink-soft">От</span>
                  <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-auto" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-ink-soft">До</span>
                  <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} min={customFrom} className="w-auto" />
                </label>
              </>
            )}
          </div>
          <p className="mt-2 text-xs text-ink-muted">
            {formatDateBG(from)} – {formatDateBG(to)}
          </p>
        </div>

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
            {/* Героят на екрана: печалбата. До нея — спестената комисиона (най-видимата поука за директните резервации). */}
            <section aria-label="Печалба" className="card grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-end" {...rise(0, animate)}>
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[0.9375rem] font-medium text-ink-soft">
                  <Wallet className="h-4 w-4 text-accent" aria-hidden="true" />
                  {heroLabel}
                  <InfoTooltip text={METRIC_INFO.profit} />
                </p>
                <div className="mt-3">
                  <HeroProfit value={summary?.profit ?? 0} />
                </div>
                <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[0.9375rem] text-ink-soft">
                  <span>
                    <span className="num font-semibold text-ink">{formatMoney(summary?.net ?? 0)}</span> нетно
                  </span>
                  <span className="num">+ {formatMoney(summary?.other_income ?? 0)} други приходи</span>
                  <span className="num">− {formatMoney(summary?.expenses ?? 0)} разходи</span>
                </p>
              </div>
              <div className="flex max-w-sm items-start gap-3.5 rounded-2xl bg-accent-soft p-4 text-accent-ink">
                <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
                <div>
                  <p className="num font-display text-2xl font-semibold leading-tight">{formatMoney(summary?.commission_saved ?? 0)}</p>
                  <p className="mt-0.5 flex items-start gap-1 text-[0.8125rem] leading-snug">
                    <span>Спестена комисиона — толкова не платихте на Airbnb/Booking, защото гостите резервираха директно.</span>
                    <InfoTooltip text={METRIC_INFO.saved} />
                  </p>
                </div>
              </div>
            </section>

            {autoCount > 0 && (
              <Link
                to="/earnings/rules"
                className="flex items-start gap-2.5 rounded-2xl bg-sunken px-4 py-3 text-[0.8125rem] leading-relaxed text-ink-soft"
              >
                <Repeat className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden="true" />
                <span>
                  Печалбата включва <strong>{autoCount}</strong> {autoCount === 1 ? 'автоматичен запис' : 'автоматични записа'} — оценка по вашите
                  правила, не реални плащания. Резервациите и ръчно въведените записи са реални.
                </span>
              </Link>
            )}

            <section aria-label="Показатели" className="card grid grid-cols-2 gap-x-6 gap-y-8 p-6 sm:p-8 lg:grid-cols-3" {...rise(1, animate)}>
              <Metric icon={TrendingUp} label="Приходи" info={METRIC_INFO.revenue} sub="преди комисиони">
                <CountUp value={Number(summary?.revenue ?? 0)} id="earnings-revenue" format={formatMoney} />
              </Metric>
              <Metric icon={PiggyBank} label="Нетно след комисиони" info={METRIC_INFO.net} sub="след комисиони">
                <CountUp value={Number(summary?.net ?? 0)} id="earnings-net" format={formatMoney} />
              </Metric>
              <Metric
                icon={ClipboardList}
                label="Продадено"
                info={METRIC_INFO.sold}
                sub={`${sold?.bookings_count ?? 0} ${sold?.bookings_count === 1 ? 'резервация' : 'резервации'} · нето ${formatMoney(sold?.net ?? 0)}`}
              >
                <CountUp value={Number(sold?.revenue ?? 0)} id="earnings-sold" format={formatMoney} />
              </Metric>
              <Metric
                icon={BedDouble}
                label="Заетост"
                info={METRIC_INFO.occupancy}
                sub={`${summary?.nights_sold ?? 0} от ${summary?.available_nights ?? 0} нощувки`}
              >
                <CountUp
                  value={Number(summary?.occupancy_pct ?? 0)}
                  id="earnings-occupancy"
                  format={(v) => `${v === Number(summary?.occupancy_pct ?? 0) ? v : round1(v)}%`}
                />
              </Metric>
              <Metric icon={Receipt} label="Средна цена на нощувка" info={METRIC_INFO.adr} sub="на нощувка">
                {summary?.adr != null ? <CountUp value={Number(summary.adr)} id="earnings-adr" format={formatMoney} /> : '—'}
              </Metric>
              <Metric icon={Building2} label="Директни vs платформи" info={METRIC_INFO.direct_share} sub="дял от приходите">
                {summary?.direct_share_pct != null ? `${summary.direct_share_pct}% / ${round1(100 - summary.direct_share_pct)}%` : '—'}
              </Metric>
            </section>

            <Card className="p-5 sm:p-8" {...rise(2, animate)}>
              <EarningsChart rows={chartRows} />
            </Card>

            <section aria-labelledby="by-property" {...rise(3, animate)}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 id="by-property" className="text-[1.375rem] sm:text-[1.625rem]">
                  По имоти
                </h2>
                <Button variant="ghost" size="sm" onClick={exportCsv} disabled={propertyRows.length === 0}>
                  <Download className="h-4 w-4" />
                  Експорт CSV
                </Button>
              </div>
              {propertyRows.length === 0 ? (
                <p className="card px-6 py-10 text-center text-sm text-ink-soft">Няма данни за избрания период.</p>
              ) : (
                <>
                  {/* Телефон: ред на имот с лента на заетостта и трите главни числа */}
                  <ul className="space-y-3 md:hidden">
                    {propertyRows.map((r) => (
                      <li key={r.property_id ?? 'general'} className="card p-4">
                        <p className="font-semibold leading-tight">{r.property_name}</p>
                        <p className="text-sm text-ink-soft">
                          {r.nights_sold} нощувки{r.occupancy_pct != null ? ` · ${r.occupancy_pct}% заетост` : ''}
                        </p>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-sunken" aria-hidden="true">
                          <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, Math.max(0, Number(r.occupancy_pct) || 0))}%` }} />
                        </div>
                        <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                          <div>
                            <dt className="text-xs text-ink-muted">Приход</dt>
                            <dd className="num font-semibold">{formatMoney(r.revenue)}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-ink-muted">Нето</dt>
                            <dd className="num font-semibold">{formatMoney(r.net)}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-ink-muted">Печалба</dt>
                            <dd className="num font-semibold text-accent-ink">{formatMoney(r.profit ?? 0)}</dd>
                          </div>
                        </dl>
                      </li>
                    ))}
                  </ul>
                  <div className="table-wrap hidden md:block" tabIndex={0} role="region" aria-label="Приходи по имот (таблица)">
                    <table className="table">
                      <thead>
                        <tr>
                          <th scope="col">Имот</th>
                          <th scope="col" className="num">Нощувки</th>
                          <th scope="col" className="num">Заетост</th>
                          <th scope="col" className="num">Приход</th>
                          <th scope="col" className="num">Нето</th>
                          <th scope="col" className="num">Ср. цена</th>
                          <th scope="col" className="num">% директни</th>
                          <th scope="col" className="num">Доп. приход</th>
                          <th scope="col" className="num">Разходи</th>
                          <th scope="col" className="num">Печалба</th>
                        </tr>
                      </thead>
                      <tbody>
                        {propertyRows.map((r) => (
                          <tr key={r.property_id ?? 'general'}>
                            <td className="font-semibold text-ink">{r.property_name}</td>
                            <td className="num text-ink-soft">{r.nights_sold}</td>
                            <td className="num text-ink-soft">{r.occupancy_pct != null ? `${r.occupancy_pct}%` : '—'}</td>
                            <td className="num text-ink-soft">{formatMoney(r.revenue)}</td>
                            <td className="num text-ink-soft">{formatMoney(r.net)}</td>
                            <td className="num text-ink-soft">{r.adr != null ? formatMoney(r.adr) : '—'}</td>
                            <td className="num text-ink-soft">{r.direct_share_pct != null ? `${r.direct_share_pct}%` : '—'}</td>
                            <td className="num text-ink-soft">{formatMoney(r.other_income ?? 0)}</td>
                            <td className="num text-ink-soft">{formatMoney(r.expenses ?? 0)}</td>
                            <td className="num font-semibold text-ink">{formatMoney(r.profit ?? 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>

            <Card className="overflow-hidden" {...rise(4, animate)}>
              <header className="px-6 pb-3 pt-6">
                <h2 className="text-[1.375rem]">Неплатени остатъци</h2>
                <p className="mt-1 text-[0.8125rem] text-ink-muted">Всички резервации с неплатен остатък, независимо от избрания период.</p>
              </header>
              {unpaid.length === 0 ? (
                <p className="px-6 pb-8 pt-4 text-center text-sm text-ink-soft">Няма неплатени остатъци — всичко е уредено.</p>
              ) : (
                <ul className="divide-y divide-line border-t border-line">
                  {unpaid.map((b) => (
                    <li key={b.booking_id}>
                      <Link
                        to={`/bookings?focus=${b.booking_id}`}
                        className="flex min-h-14 flex-wrap items-center justify-between gap-2 px-6 py-3.5 text-sm transition-colors hover:bg-sunken/60"
                      >
                        <div>
                          <p className="font-semibold text-ink">{b.guest_name}</p>
                          <p className="text-xs text-ink-muted">
                            {propertyNames[b.property_id] ?? '—'} · {formatDateBG(b.check_in)} – {formatDateBG(b.check_out)}
                          </p>
                        </div>
                        <span className="num font-semibold text-warning-ink">{formatMoney(b.outstanding)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}

        <Card className="overflow-hidden">
          <header className="flex flex-wrap items-center justify-between gap-3 px-6 pb-3 pt-6">
            <h2 className="text-[1.375rem]">Последни разходи и приходи</h2>
            <Input type="month" value={ledgerMonth} onChange={(e) => setLedgerMonth(e.target.value)} className="w-auto" aria-label="Месец" />
          </header>

          {ledgerError && (
            <div className="px-6 pt-2">
              <Alert>{ledgerError}</Alert>
            </div>
          )}

          {ledgerLoading ? (
            <Spinner />
          ) : ledgerEntries.length === 0 ? (
            <p className="px-6 pb-8 pt-4 text-center text-sm text-ink-soft">Няма разходи или приходи за избрания месец.</p>
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {ledgerEntries.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5 text-sm">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">{entry.category}</span>
                      {entry.is_auto && (
                        <span className="inline-flex items-center gap-0.5 rounded-md bg-sunken px-1.5 py-0.5 text-[11px] font-semibold text-ink-soft">
                          авто
                          <InfoTooltip
                            text={
                              rules.find((r) => r.id === entry.rule_id)
                                ? ruleTooltip(rules.find((r) => r.id === entry.rule_id))
                                : 'Генерирано автоматично от правило. Оценка — ако е различно, редактирайте записа.'
                            }
                          />
                        </span>
                      )}
                      <span className="text-xs text-ink-muted">{propertyNames[entry.property_id] ?? 'Всички имоти'}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {formatDateBG(entry.entry_date)}
                      {entry.note && ` · ${entry.note}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {entry.receipt_path && receiptUrls[entry.id] && (
                      <a
                        href={receiptUrls[entry.id]}
                        target="_blank"
                        rel="noreferrer"
                        className="icon-btn text-ink-muted hover:text-accent"
                        aria-label="Преглед на бележката"
                      >
                        <Paperclip className="h-4 w-4" />
                      </a>
                    )}
                    <span className={`num mr-2 font-semibold ${entry.kind === 'income' ? 'text-success' : 'text-danger'}`}>
                      {entry.kind === 'income' ? '+' : '−'}
                      {formatMoney(entry.amount)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEntryModal({ kind: entry.kind, entry })}
                      className="icon-btn text-ink-muted hover:text-ink"
                      aria-label="Редакция"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(entry)}
                      className="icon-btn text-ink-muted hover:text-danger"
                      aria-label="Изтрий"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* По-рядко ползваните действия — извън основния поглед */}
        <div className="flex flex-wrap items-center gap-2 pb-2">
          <Button variant="ghost" size="sm" onClick={() => setWizardOpen(true)}>
            <Wand2 className="h-4 w-4" />
            Настройка на автоматичните записи
          </Button>
          <Link to="/earnings/rules">
            <Button variant="ghost" size="sm">
              <Repeat className="h-4 w-4" />
              Правила{rules.length > 0 ? ` (${rules.length})` : ''}
            </Button>
          </Link>
        </div>
      </div>

      {entryModal && (
        <MoneyEntryModal
          open={Boolean(entryModal)}
          onClose={() => setEntryModal(null)}
          onSaved={handleEntrySaved}
          kind={entryModal.kind}
          initial={entryModal.entry}
          properties={properties}
          profileId={profile?.id}
          userId={user?.id}
        />
      )}

      <SetupWizard
        open={wizardOpen}
        onClose={closeWizard}
        onSaved={() => {
          closeWizard()
          loadRules()
          reloadRef.current()
        }}
        properties={properties}
        profileId={profile?.id}
        existingRules={rules}
      />

      <Modal open={Boolean(confirmDelete)} onClose={() => setConfirmDelete(null)} title="Изтриване на запис">
        <p className="text-sm leading-relaxed text-ink-soft">
          Сигурни ли сте, че искате да изтриете този {confirmDelete?.kind === 'income' ? 'приход' : 'разход'} (
          {confirmDelete && formatMoney(confirmDelete.amount)})? Действието е необратимо.
        </p>
        {confirmDelete?.is_auto && (
          <p className="mt-2 text-xs leading-relaxed text-ink-soft">
            Това е автоматичен запис. Ако го изтриете, правилото няма да го създаде наново за същия месец/резервация.
          </p>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setConfirmDelete(null)} disabled={deleting}>
            Отказ
          </Button>
          <Button variant="dangerSolid" onClick={handleDeleteConfirmed} loading={deleting}>
            Изтрий
          </Button>
        </div>
      </Modal>
    </div>
  )
}

function round1(n) {
  return Math.round(n * 10) / 10
}
