import { useEffect, useState, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BookMarked, Plus, ArrowUpDown, Filter, AlertTriangle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatDateBG, nightsBetween } from '../../lib/dates'
import { formatMoney } from '../../lib/money'
import {
  BOOKING_STATUSES,
  SOURCE_STYLES,
  STATUS_STYLES,
  OTA_SOURCES,
  incompleteBookingsFilter,
  sourceLabel,
  statusLabel,
} from '../../lib/bookings'
import { PageHeader, Card, Select, Input, Button, Alert, Spinner, EmptyState } from '../../components/ui'
import BookingFormModal from './BookingFormModal'
import { rise, useIntro } from '../../lib/motion'

const initials = (name) =>
  (name || '?')
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

export default function BookingsList() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [properties, setProperties] = useState([])
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [propertyId, setPropertyId] = useState('all')
  const [status, setStatus] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [sortAsc, setSortAsc] = useState(true)
  const [incompleteOnly, setIncompleteOnly] = useState(() => searchParams.get('incomplete') === '1')
  const [incompleteCount, setIncompleteCount] = useState(0)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const animate = useIntro('screen-bookings', !loading)

  useEffect(() => {
    supabase
      .from('properties')
      .select('id, name, max_guests')
      .order('name')
      .then(({ data }) => setProperties(data ?? []))
  }, [])

  // Дълбок линк от таблото „Приходи“ — отваря директно конкретна
  // резервация за редакция, независимо от текущите филтри.
  useEffect(() => {
    const focusId = searchParams.get('focus')
    if (!focusId) return

    supabase
      .from('bookings')
      .select('*')
      .eq('id', focusId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setEditing(data)
          setModalOpen(true)
        }
        setSearchParams((p) => {
          p.delete('focus')
          return p
        })
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refreshIncompleteCount = useCallback(async () => {
    const { count } = await incompleteBookingsFilter(
      supabase.from('bookings').select('id', { count: 'exact', head: true })
    )
    setIncompleteCount(count ?? 0)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    let query = supabase.from('bookings').select('*').order('check_in', { ascending: sortAsc })

    if (incompleteOnly) {
      query = incompleteBookingsFilter(query)
    } else {
      if (propertyId !== 'all') query = query.eq('property_id', propertyId)
      if (status !== 'all') query = query.eq('status', status)
      if (from) query = query.gte('check_in', from)
      if (to) query = query.lte('check_in', to)
    }

    // Броят „чакат цена“ се взема едновременно със списъка — бележката не измества списъка, след като е показан.
    const [{ data, error }] = await Promise.all([query, refreshIncompleteCount()])
    if (error) setError('Неуспешно зареждане: ' + error.message)
    setBookings(data ?? [])
    setLoading(false)
  }, [propertyId, status, from, to, sortAsc, incompleteOnly, refreshIncompleteCount])

  useEffect(() => {
    load()
  }, [load])

  const propertyName = (id) => properties.find((p) => p.id === id)?.name ?? '—'
  const hasFilters = propertyId !== 'all' || status !== 'all' || from || to

  const clearFilters = () => {
    setPropertyId('all')
    setStatus('all')
    setFrom('')
    setTo('')
    setIncompleteOnly(false)
  }

  const toggleIncomplete = () => {
    if (!incompleteOnly) clearFilters()
    setIncompleteOnly((v) => !v)
  }

  const openEditor = (b) => {
    setEditing(b)
    setModalOpen(true)
  }

  return (
    <div>
      <PageHeader
        eyebrow="Всички резервации"
        title="Резервации"
        description="Филтри, сортиране и бързо редактиране."
        action={
          <Button
            onClick={() => {
              setEditing(null)
              setModalOpen(true)
            }}
            disabled={properties.length === 0}
          >
            <Plus className="h-4 w-4" />
            Нова резервация
          </Button>
        }
      />

      <div className="mt-8 space-y-5 sm:mt-10">
        {error && <Alert>{error}</Alert>}

        {incompleteCount > 0 && (
          <button
            type="button"
            onClick={toggleIncomplete}
            aria-pressed={incompleteOnly}
            className="flex min-h-11 w-full flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-warning-soft px-5 py-3.5 text-left text-sm text-warning-ink shadow-card transition-transform active:scale-[0.99]"
          >
            <AlertTriangle className="h-[1.125rem] w-[1.125rem] shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 basis-[12rem]">
              <strong>{incompleteCount}</strong>{' '}
              {incompleteCount === 1 ? 'резервация от платформа чака' : 'резервации от платформи чакат'}{' '}
              цена/комисиона — иначе приходите ще се смятат грешно.
            </span>
            <span className="shrink-0 text-xs font-semibold underline">
              {incompleteOnly ? 'Покажи всички' : 'Покажи само тях'}
            </span>
          </button>
        )}

        <Card className="p-4 sm:p-5">
          <div className="flex flex-wrap items-end gap-x-3 gap-y-3">
            <div className="flex w-full items-center gap-1.5 text-sm font-semibold text-ink-soft sm:w-auto sm:pb-3">
              <Filter className="h-4 w-4" aria-hidden="true" />
              Филтри
            </div>

            {incompleteOnly && (
              <span className="w-full pb-1 text-xs text-ink-muted sm:w-auto sm:pb-3">
                Филтрите по-долу са изключени, докато преглеждате непопълнените резервации.
              </span>
            )}

            <div
              className={`grid w-full grid-cols-2 gap-3 sm:flex sm:w-auto sm:flex-wrap sm:items-end ${incompleteOnly ? 'pointer-events-none opacity-40' : ''}`}
            >
              <label className="block min-w-0">
                <span className="mb-1 block text-xs font-semibold text-ink-soft">Имот</span>
                <Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className="sm:w-auto sm:min-w-44">
                  <option value="all">Всички</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </label>

              <label className="block min-w-0">
                <span className="mb-1 block text-xs font-semibold text-ink-soft">Статус</span>
                <Select value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-auto sm:min-w-36">
                  <option value="all">Всички</option>
                  {BOOKING_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </label>

              <label className="block min-w-0">
                <span className="mb-1 block text-xs font-semibold text-ink-soft">Настаняване от</span>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="sm:w-auto" />
              </label>

              <label className="block min-w-0">
                <span className="mb-1 block text-xs font-semibold text-ink-soft">до</span>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="sm:w-auto" />
              </label>
            </div>

            {hasFilters && !incompleteOnly && (
              <Button variant="secondary" onClick={clearFilters}>
                Изчисти
              </Button>
            )}
          </div>
        </Card>

        {loading ? (
          <Card>
            <Spinner />
          </Card>
        ) : bookings.length === 0 ? (
          <EmptyState
            icon={incompleteOnly ? AlertTriangle : hasFilters ? Filter : BookMarked}
            title={
              incompleteOnly
                ? 'Всичко е попълнено'
                : hasFilters
                  ? 'Няма резервации по тези филтри'
                  : 'Още нямате резервации'
            }
            description={
              incompleteOnly
                ? 'Няма резервации от платформи без цена или комисиона.'
                : hasFilters
                  ? 'Опитайте с други филтри или ги изчистете.'
                  : properties.length === 0
                    ? 'Първо добавете имот, след което ще можете да въвеждате резервации.'
                    : 'Добавете първата си резервация или я импортирайте от Airbnb/Booking.'
            }
            action={
              properties.length === 0 ? (
                <Link to="/properties/new">
                  <Button>
                    <Plus className="h-4 w-4" />
                    Добави имот
                  </Button>
                </Link>
              ) : incompleteOnly ? (
                <Button variant="secondary" onClick={toggleIncomplete}>
                  Покажи всички
                </Button>
              ) : hasFilters ? (
                <Button variant="secondary" onClick={clearFilters}>
                  Изчисти филтрите
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    setEditing(null)
                    setModalOpen(true)
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Нова резервация
                </Button>
              )
            }
          />
        ) : (
          <>
            {/* Телефон: карта на резервация (гост, дати, цена); цялата карта е бутон за редакция */}
            <ul className="space-y-3 md:hidden">
              {bookings.map((b, i) => (
                <li key={b.id} {...rise(i, animate)}>
                  <button type="button" onClick={() => openEditor(b)} className="card card-interactive grid w-full grid-cols-2 gap-x-4 gap-y-3 p-4 text-left">
                    <span className="col-span-2 flex items-center gap-3">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent-soft text-[0.9375rem] font-bold text-accent-ink" aria-hidden="true">
                        {initials(b.guest_name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold leading-tight">{b.guest_name}</span>
                        <span className="block truncate text-sm text-ink-soft">{propertyName(b.property_id)}</span>
                      </span>
                      <span className={`inline-flex shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[b.status]}`}>{statusLabel(b.status)}</span>
                    </span>
                    <span>
                      <span className="block text-xs text-ink-muted">Настаняване</span>
                      <span className="num font-medium">{formatDateBG(b.check_in)}</span>
                    </span>
                    <span>
                      <span className="block text-xs text-ink-muted">Напускане</span>
                      <span className="num font-medium">{formatDateBG(b.check_out)}</span>
                    </span>
                    <span>
                      <span className="block text-xs text-ink-muted">Нощувки</span>
                      <span className="num font-medium">{nightsBetween(b.check_in, b.check_out)}</span>
                    </span>
                    <span className="text-right">
                      <span className="block text-xs text-ink-muted">Цена</span>
                      {b.total_price != null ? (
                        <span className="num font-display text-lg font-semibold">{formatMoney(b.total_price)}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-sm font-semibold text-warning-ink">
                          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                          няма
                        </span>
                      )}
                    </span>
                    <span className="col-span-2 flex items-center justify-between gap-3">
                      <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ${(SOURCE_STYLES[b.source] ?? SOURCE_STYLES.manual).chip}`}>{sourceLabel(b.source)}</span>
                      {OTA_SOURCES.includes(b.source) && (
                        <span className={`num text-sm ${Number(b.commission) > 0 ? 'text-ink-soft' : 'font-semibold text-warning-ink'}`}>
                          Комисиона: {formatMoney(Number(b.commission) > 0 ? b.commission : 0)}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            {/* Голям екран: таблица */}
            <div className="table-wrap hidden md:block" tabIndex={0} role="region" aria-label="Резервации (таблица)" {...rise(0, animate)}>
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Гост</th>
                    <th scope="col">Имот</th>
                    <th scope="col" aria-sort={sortAsc ? 'ascending' : 'descending'}>
                      <button type="button" onClick={() => setSortAsc((s) => !s)} className="inline-flex min-h-8 items-center gap-1 hover:text-ink" title="Сортирай по настаняване">
                        Настаняване
                        <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                      </button>
                    </th>
                    <th scope="col">Напускане</th>
                    <th scope="col" className="num">Нощувки</th>
                    <th scope="col" className="num">Цена</th>
                    <th scope="col" className="num">Комисиона</th>
                    <th scope="col">Източник</th>
                    <th scope="col">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b) => (
                    <tr key={b.id} onClick={() => openEditor(b)} className="cursor-pointer">
                      <td>
                        <p className="font-semibold text-ink">{b.guest_name}</p>
                        {b.guest_phone && <p className="text-xs text-ink-muted">{b.guest_phone}</p>}
                      </td>
                      <td className="text-ink-soft">{propertyName(b.property_id)}</td>
                      <td className="text-ink-soft">{formatDateBG(b.check_in)}</td>
                      <td className="text-ink-soft">{formatDateBG(b.check_out)}</td>
                      <td className="num text-ink-soft">{nightsBetween(b.check_in, b.check_out)}</td>
                      <td className="num">
                        {b.total_price != null ? (
                          <span className="font-semibold">{formatMoney(b.total_price)}</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-semibold text-warning-ink">
                            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                            няма
                          </span>
                        )}
                      </td>
                      <td className="num text-ink-soft">
                        {OTA_SOURCES.includes(b.source) ? (
                          Number(b.commission) > 0 ? (
                            formatMoney(b.commission)
                          ) : (
                            <span className="font-semibold text-warning-ink">{formatMoney(0)}</span>
                          )
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ${(SOURCE_STYLES[b.source] ?? SOURCE_STYLES.manual).chip}`}>{sourceLabel(b.source)}</span>
                      </td>
                      <td>
                        <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[b.status]}`}>{statusLabel(b.status)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <BookingFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={load}
        properties={properties}
        initial={editing}
        defaults={{}}
      />
    </div>
  )
}
