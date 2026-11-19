import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, FileText } from 'lucide-react'
import { PageHeader, Card, Table, Th, Td, Badge, Segmented, Select, Button, EmptyState, Spinner, Alert } from '../components/ui'
import { loadDeclarationItems, setSubmitted, registryAvailable } from '../lib/registry'
import { CSV_HEADERS, csvRows, dmy } from '../lib/declarationLogic'
import { downloadCsv } from '../lib/earnings'
import { formatMoney } from '../lib/money'
import { todayISO, formatDateBG } from '../lib/dates'

const MISSING_LABELS = {
  country: 'гражданство',
  tax_id: 'ΑΦΜ',
  passport: 'паспорт',
  doc_name: 'име по паспорта',
  pay_method: 'начин на плащане',
}

const STATE_ORDER = { overdue: 0, due: 1, upcoming: 2, submitted: 3, long: 4 }

function StateBadge({ item }) {
  switch (item.state) {
    case 'overdue':
      return <Badge tone="danger">Просрочена</Badge>
    case 'due':
      return <Badge tone={item.daysLeft <= 7 ? 'warning' : 'info'}>Чака подаване</Badge>
    case 'upcoming':
      return <Badge>Още не е напуснал</Badge>
    case 'submitted':
      return <Badge tone="success">Подадена</Badge>
    case 'long':
      return <Badge tone="info">Над 59 нощи</Badge>
    default:
      return null
  }
}

function DeadlineText({ item }) {
  if (item.state === 'long') return <span className="text-ink-muted">Друга декларация</span>
  if (item.state === 'submitted') return <span className="text-ink-muted">—</span>
  const days = item.daysLeft
  return (
    <span>
      {dmy(item.deadline)}
      <span className="block text-xs text-ink-muted">
        {item.state === 'overdue'
          ? Math.abs(days) === 1
            ? 'просрочена с 1 ден'
            : `просрочена с ${Math.abs(days)} дни`
          : item.state === 'upcoming'
            ? ''
            : days === 0
              ? 'срокът е днес'
              : days === 1
                ? 'остава 1 ден'
                : `остават ${days} дни`}
      </span>
    </span>
  )
}

function DataBadges({ item }) {
  if (item.state === 'long' || item.state === 'submitted') return <span className="text-ink-muted">—</span>
  if (item.missing.length === 0) return <Badge tone="success">Пълни</Badge>
  return (
    <span className="flex flex-wrap gap-1">
      {item.missing.map((m) => (
        <Badge key={m} tone="warning">
          {MISSING_LABELS[m]}
        </Badge>
      ))}
    </span>
  )
}

/** Малко бройче: три в един ред и на телефон (пояснението е само на широк екран). */
function Tile({ label, value, hint, alert }) {
  return (
    <Card padded className="px-3 py-3 sm:px-5 sm:py-4">
      <p className="text-[0.8125rem] font-medium text-ink-soft">{label}</p>
      <p className={`mt-1 font-display text-2xl font-semibold leading-none sm:text-3xl ${alert ? 'text-danger' : ''}`}>{value}</p>
      <p className="mt-1.5 hidden text-xs text-ink-muted sm:block">{hint}</p>
    </Card>
  )
}

export default function Declarations() {
  const [items, setItems] = useState(null)
  const [available, setAvailable] = useState(true)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [filter, setFilter] = useState('open')
  const [propertyId, setPropertyId] = useState('')
  const today = todayISO()

  const load = async () => {
    try {
      setAvailable(await registryAvailable())
      setItems(await loadDeclarationItems(today))
    } catch (err) {
      setError('Неуспешно зареждане: ' + err.message)
      setItems([])
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const properties = useMemo(() => {
    const seen = new Map()
    for (const it of items ?? []) seen.set(it.booking.property_id, it.propertyName)
    return [...seen].map(([id, name]) => ({ id, name }))
  }, [items])

  const tracked = useMemo(
    () => (items ?? []).filter((it) => it.state !== 'cancelled' && (!propertyId || it.booking.property_id === propertyId)),
    [items, propertyId]
  )

  const counts = useMemo(() => {
    const c = { overdue: 0, due: 0, submitted: 0, missing: 0 }
    for (const it of tracked) {
      if (it.state === 'overdue') c.overdue++
      if (it.state === 'due') c.due++
      if (it.state === 'submitted') c.submitted++
      if ((it.state === 'due' || it.state === 'overdue') && it.missing.length) c.missing++
    }
    return c
  }, [tracked])

  const visible = useMemo(() => {
    const keep = {
      open: (it) => it.state === 'overdue' || it.state === 'due' || it.state === 'upcoming',
      overdue: (it) => it.state === 'overdue',
      submitted: (it) => it.state === 'submitted',
      all: () => true,
    }[filter]
    return tracked
      .filter(keep)
      .sort((a, b) => {
        if (STATE_ORDER[a.state] !== STATE_ORDER[b.state]) return STATE_ORDER[a.state] - STATE_ORDER[b.state]
        return a.state === 'submitted' || a.state === 'long' ? b.booking.check_out.localeCompare(a.booking.check_out) : a.booking.check_out.localeCompare(b.booking.check_out)
      })
  }, [tracked, filter])

  const toggle = async (item) => {
    setBusyId(item.booking.id)
    setError(null)
    try {
      await setSubmitted(item.booking.id, item.state !== 'submitted')
      await load()
    } catch (err) {
      setError('Неуспешно записване: ' + err.message)
    } finally {
      setBusyId(null)
    }
  }

  const exportCsv = () => {
    const rows = csvRows(visible)
    downloadCsv(`declarations-${today.slice(0, 7)}.csv`, CSV_HEADERS, rows)
  }

  if (items === null) return <Spinner />

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Гърция"
        title="Декларации за престой"
        description="Подавате ги в myAADE до 20-о число на следващия месец. StayFlow следи срока и подготвя данните."
        action={
          <Button variant="secondary" onClick={exportCsv} disabled={!visible.some((it) => it.state !== 'long')}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Експорт за подаване (CSV)
          </Button>
        }
      />

      {error && <Alert>{error}</Alert>}

      {!available || properties.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={FileText}
            title="Още няма имот в Гърция"
            description="Включете „Този имот е в Гърция“ в картата „Регистрация в Гърция“ на имота. После резервациите му ще се появят тук."
            action={
              <Link to="/properties" className="btn">
                Към имотите
              </Link>
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <Tile label="Просрочени" value={counts.overdue} hint={counts.overdue ? 'Подайте ги веднага' : 'Няма'} alert={counts.overdue > 0} />
            <Tile label="Чакат подаване" value={counts.due} hint={counts.missing ? `${counts.missing} с липсващи данни` : 'Данните са пълни'} />
            <Tile label="Подадени" value={counts.submitted} hint="Отбелязани от вас" />
          </div>

          <div className="flex flex-wrap items-end justify-between gap-4">
            <Segmented
              label="Показване"
              className="w-full sm:w-auto [&>button]:flex-1 [&>button]:px-2 sm:[&>button]:flex-none sm:[&>button]:px-3.5"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'open', label: 'Чакат' },
                { value: 'overdue', label: 'Просрочени' },
                { value: 'submitted', label: 'Подадени' },
                { value: 'all', label: 'Всички' },
              ]}
            />
            {properties.length > 1 && (
              <label className="field w-full sm:w-64">
                <span className="field-label">Имот</span>
                <Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
                  <option value="">Всички</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </label>
            )}
          </div>

          {visible.length === 0 ? (
            <Card className="p-6">
              <EmptyState icon={FileText} title="Няма декларации в този изглед" description="Резервациите, които не са отказани, се появяват тук със срока си." />
            </Card>
          ) : (
            <>
            <Card flat className="hidden overflow-hidden sm:block">
              <Table label="Декларации за престой">
                <thead>
                  <tr>
                    <Th>Гост</Th>
                    <Th>Имот</Th>
                    <Th>Напуска</Th>
                    <Th numeric>Сума</Th>
                    <Th>Срок</Th>
                    <Th>Данни</Th>
                    <Th>Статус</Th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((it) => {
                    const b = it.booking
                    return (
                      <tr key={b.id}>
                        <Td>
                          <Link to={`/bookings?focus=${b.id}`} className="font-semibold text-accent hover:underline">
                            {b.guest_name}
                          </Link>
                        </Td>
                        <Td>{it.propertyName}</Td>
                        <Td>{formatDateBG(b.check_out)}</Td>
                        <Td numeric>{b.total_price == null ? '—' : formatMoney(b.total_price)}</Td>
                        <Td>
                          <DeadlineText item={it} />
                        </Td>
                        <Td>
                          <DataBadges item={it} />
                        </Td>
                        <Td>
                          <div className="flex flex-col items-start gap-2">
                            <StateBadge item={it} />
                            {it.split?.length > 1 && it.state !== 'submitted' && <span className="text-xs text-ink-muted">{`${it.split.length} декларации (Нова година)`}</span>}
                            {it.state !== 'long' && (
                              <Button size="sm" variant={it.state === 'submitted' ? 'ghost' : 'secondary'} loading={busyId === b.id} onClick={() => toggle(it)}>
                                {it.state === 'submitted' ? 'Върни в чакащи' : 'Отбележи като подадена'}
                              </Button>
                            )}
                          </div>
                        </Td>
                      </tr>
                    )
                  })}
                </tbody>
              </Table>
            </Card>

            <ul className="space-y-3 sm:hidden" aria-label="Декларации за престой">
              {visible.map((it) => {
                const b = it.booking
                return (
                  <li key={b.id}>
                    <Card padded className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link to={`/bookings?focus=${b.id}`} className="font-semibold text-accent hover:underline">
                            {b.guest_name}
                          </Link>
                          <p className="text-sm text-ink-soft">{it.propertyName}</p>
                        </div>
                        <StateBadge item={it} />
                      </div>
                      <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1.5 text-sm">
                        <dt className="text-ink-muted">Напуска</dt>
                        <dd className="text-right">{formatDateBG(b.check_out)}</dd>
                        <dt className="text-ink-muted">Сума</dt>
                        <dd className="text-right">{b.total_price == null ? '—' : formatMoney(b.total_price)}</dd>
                        <dt className="text-ink-muted">Срок</dt>
                        <dd className="text-right">
                          <DeadlineText item={it} />
                        </dd>
                        <dt className="text-ink-muted">Данни</dt>
                        <dd className="flex justify-end">
                          <DataBadges item={it} />
                        </dd>
                      </dl>
                      {it.split?.length > 1 && it.state !== 'submitted' && <p className="text-xs text-ink-muted">{`${it.split.length} декларации (Нова година)`}</p>}
                      {it.state !== 'long' && (
                        <Button size="sm" block variant={it.state === 'submitted' ? 'ghost' : 'secondary'} loading={busyId === b.id} onClick={() => toggle(it)}>
                          {it.state === 'submitted' ? 'Върни в чакащи' : 'Отбележи като подадена'}
                        </Button>
                      )}
                    </Card>
                  </li>
                )
              })}
            </ul>
            </>
          )}

          <p className="max-w-3xl text-xs text-ink-muted">
            Подаването е в портала myAADE — StayFlow не го прави вместо вас. Отказана резервация, за която гостът е платил такса, също се декларира, но не се следи тук. Престой от 60 нощи нагоре е друг вид наем с друга декларация.
          </p>
        </>
      )}
    </div>
  )
}
