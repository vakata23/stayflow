import { useEffect, useMemo, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Building2, LogIn, LogOut, Moon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  MONTHS_BG,
  WEEKDAYS_BG,
  monthGrid,
  toISODate,
  todayISO,
  addDays,
  fromISODate,
  formatDateBG,
  nightsBetween,
  bookingCoversDay,
} from '../lib/dates'
import { SOURCE_STYLES, BOOKING_SOURCES, sourceLabel } from '../lib/bookings'
import { priceForDay } from '../lib/pricing'
import { useMediaQuery } from '../lib/useMediaQuery'
import { PageHeader, Select, Button, Alert, EmptyState, Skeleton, Modal } from '../components/ui'
import BookingFormModal from './bookings/BookingFormModal'

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1)
const longDate = (iso) => capitalize(new Intl.DateTimeFormat('bg-BG', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${iso}T12:00:00`)))
const lastNight = (b) => toISODate(addDays(fromISODate(b.check_out), -1))

/** Лента на резервация в дневна клетка (голям екран): лентите на съседни дни се слепват в една. */
function BookingBar({ booking, iso, label, onOpen }) {
  const style = SOURCE_STYLES[booking.source] ?? SOURCE_STYLES.manual
  const start = booking.check_in === iso
  const end = lastNight(booking) === iso
  const pending = booking.status === 'pending'
  const showName = start || new Date(`${iso}T12:00:00`).getDay() === 1
  return (
    <div className={`${start ? 'pl-1.5' : ''} ${end ? 'pr-1.5' : ''}`}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onOpen(booking)
        }}
        className={`block h-6 w-full truncate text-left text-[0.6875rem] font-semibold leading-6 ${start ? 'rounded-l-md pl-1.5' : 'pl-1'} ${end ? 'rounded-r-md' : ''} ${
          pending ? `border-y-2 bg-card text-ink ${start ? 'border-l-2' : ''} ${end ? 'border-r-2' : ''} ${style.edge}` : `text-white ${style.bar}`
        }`}
        title={label}
        aria-label={label}
      >
        {showName ? booking.guest_name : ' '}
      </button>
    </div>
  )
}

export default function Calendar() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [propertyId, setPropertyId] = useState('all')

  const [properties, setProperties] = useState([])
  const [bookings, setBookings] = useState([])
  const [pricingRules, setPricingRules] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [modalDefaults, setModalDefaults] = useState({})
  const [editing, setEditing] = useState(null)
  const [sheet, setSheet] = useState({ open: false, iso: null })

  const wide = useMediaQuery('(min-width: 768px)')

  const days = useMemo(() => monthGrid(year, month), [year, month])
  const rangeStart = days[0].iso
  const rangeEnd = days[days.length - 1].iso

  useEffect(() => {
    supabase
      .from('properties')
      .select('id, name, max_guests')
      .order('name')
      .then(({ data }) => setProperties(data ?? []))
  }, [])

  const loadBookings = useCallback(async () => {
    setLoading(true)
    setError(null)

    let query = supabase
      .from('bookings')
      .select('id, property_id, guest_name, check_in, check_out, source, status, num_guests, total_price, commission, tourist_tax, guest_phone, guest_email, notes')
      .neq('status', 'cancelled')
      // Всичко, което се застъпва с показания диапазон.
      .lte('check_in', rangeEnd)
      .gt('check_out', rangeStart)

    if (propertyId !== 'all') query = query.eq('property_id', propertyId)

    const { data, error } = await query
    if (error) setError('Неуспешно зареждане на резервациите: ' + error.message)
    setBookings(data ?? [])

    // Цените се показват само при избран конкретен имот (те са per имот).
    if (propertyId !== 'all') {
      const { data: rules } = await supabase
        .from('pricing_rules')
        .select('start_date, end_date, price_per_night, created_at')
        .eq('property_id', propertyId)
        .lte('start_date', rangeEnd)
        .gte('end_date', rangeStart)
      setPricingRules(rules ?? [])
    } else {
      setPricingRules([])
    }

    setLoading(false)
  }, [rangeStart, rangeEnd, propertyId])

  useEffect(() => {
    loadBookings()
  }, [loadBookings])

  const propertyName = (id) => properties.find((p) => p.id === id)?.name ?? ''

  const goPrev = () => {
    if (month === 0) {
      setYear((y) => y - 1)
      setMonth(11)
    } else setMonth((m) => m - 1)
  }

  const goNext = () => {
    if (month === 11) {
      setYear((y) => y + 1)
      setMonth(0)
    } else setMonth((m) => m + 1)
  }

  const goToday = () => {
    const d = new Date()
    setYear(d.getFullYear())
    setMonth(d.getMonth())
  }

  const openNewBooking = (dayISO) => {
    setEditing(null)
    setModalDefaults({
      check_in: dayISO,
      ...(propertyId !== 'all' ? { property_id: propertyId } : {}),
    })
    setModalOpen(true)
  }

  const openEditBooking = (booking) => {
    setEditing(booking)
    setModalDefaults({})
    setModalOpen(true)
  }

  const today = todayISO()
  const bookingLabel = (b) => `${b.guest_name}${propertyId === 'all' ? ` — ${propertyName(b.property_id)}` : ''}, ${formatDateBG(b.check_in)} – ${formatDateBG(b.check_out)}`

  // Листът за ден: всичко, което настанява, нощува или напуска в този ден.
  const sheetBookings = sheet.iso ? bookings.filter((b) => b.check_in <= sheet.iso && sheet.iso <= b.check_out) : []
  const sheetRule = sheet.iso && pricingRules.length ? priceForDay(pricingRules, sheet.iso) : null
  const closeSheet = () => setSheet((s) => ({ ...s, open: false }))

  return (
    <div>
      <PageHeader
        icon={CalendarDays}
        eyebrow="Планиране"
        title="Календар"
        description={wide ? 'Заетост по дни. Кликнете на свободен ден, за да добавите резервация.' : 'Заетост по дни. Докоснете ден, за да видите резервациите или да добавите нова.'}
        action={
          <Button onClick={() => openNewBooking(today)} disabled={properties.length === 0}>
            <Plus className="h-4 w-4" />
            Нова резервация
          </Button>
        }
      />

      {properties.length === 0 && !loading ? (
        <div className="mt-8">
          <EmptyState
            icon={Building2}
            title="Първо добавете имот"
            description="Календарът показва заетостта на вашите имоти. Добавете поне един, за да започнете."
            action={
              <Link to="/properties/new">
                <Button>
                  <Plus className="h-4 w-4" />
                  Добави имот
                </Button>
              </Link>
            }
          />
        </div>
      ) : (
        <div className="mt-8 space-y-4 sm:mt-10">
          {error && <Alert>{error}</Alert>}

          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <button onClick={goPrev} className="icon-btn border border-line-strong bg-card text-ink-soft" aria-label="Предишен месец">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <h2 aria-live="polite" className="min-w-0 flex-1 text-center font-display text-xl font-semibold tracking-tight sm:min-w-[13rem] sm:flex-none sm:text-[1.75rem]">
                {MONTHS_BG[month]} {year}
              </h2>
              <button onClick={goNext} className="icon-btn border border-line-strong bg-card text-ink-soft" aria-label="Следващ месец">
                <ChevronRight className="h-4 w-4" />
              </button>
              <Button variant="secondary" onClick={goToday} className="ml-1">
                Днес
              </Button>
            </div>

            <Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} aria-label="Имот" className="w-full sm:w-auto sm:min-w-52">
              <option value="all">Всички имоти</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="card overflow-hidden p-2 sm:p-4">
            {loading ? (
              <div role="status" aria-busy="true" className="p-2">
                <span className="sr-only">Зареждане</span>
                <div className="grid grid-cols-7 gap-1.5" aria-hidden="true">
                  {Array.from({ length: 35 }, (_, i) => (
                    <Skeleton key={i} className="h-14 md:h-24" />
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-7">
                  {WEEKDAYS_BG.map((d) => (
                    <div key={d} className="px-2 pb-2 pt-1 text-center text-[0.8125rem] font-semibold text-ink-muted">
                      {d}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7">
                  {days.map(({ iso, date, inMonth }) => {
                    const dayBookings = bookings.filter((b) => bookingCoversDay(b, iso))
                    const isToday = iso === today
                    const rule = pricingRules.length ? priceForDay(pricingRules, iso) : null
                    const number = (
                      <span
                        className={`grid h-7 w-7 place-items-center rounded-full text-[0.8125rem] font-semibold ${
                          isToday ? 'bg-accent text-on-accent' : inMonth ? 'text-ink' : 'text-ink-muted'
                        }`}
                      >
                        {date.getDate()}
                      </span>
                    )
                    const cell = `relative border-t border-line ${inMonth ? '' : 'bg-sunken/50'}`

                    // Телефон: клетка-бутон с тънки цветни ленти; подробностите са в листа за деня.
                    if (!wide) {
                      return (
                        <button
                          key={iso}
                          type="button"
                          onClick={() => setSheet({ open: true, iso })}
                          aria-label={`${longDate(iso)}, ${dayBookings.length ? `резервации: ${dayBookings.length}` : 'свободен ден'}`}
                          className={`${cell} flex min-h-[3.75rem] flex-col items-center gap-1 pb-1.5 pt-1.5 transition-colors active:bg-accent-soft`}
                        >
                          {number}
                          <span className="flex w-full flex-col gap-[3px]" aria-hidden="true">
                            {dayBookings.slice(0, 3).map((b) => {
                              const style = SOURCE_STYLES[b.source] ?? SOURCE_STYLES.manual
                              const start = b.check_in === iso
                              const end = lastNight(b) === iso
                              return (
                                <span key={b.id} className={`${start ? 'pl-1' : ''} ${end ? 'pr-1' : ''}`}>
                                  <span className={`block h-1.5 ${start ? 'rounded-l-full' : ''} ${end ? 'rounded-r-full' : ''} ${style.bar} ${b.status === 'pending' ? 'opacity-45' : ''}`} />
                                </span>
                              )
                            })}
                          </span>
                        </button>
                      )
                    }

                    const head = (
                      <div className="flex items-center justify-between px-1.5">
                        <span className="num text-[0.6875rem] text-ink-muted">{rule && inMonth ? `${Number(rule.price_per_night).toFixed(0)} €` : ''}</span>
                        {number}
                      </div>
                    )

                    // Свободен ден: цялата клетка е бутон за нова резервация.
                    if (dayBookings.length === 0) {
                      return (
                        <button
                          key={iso}
                          type="button"
                          onClick={() => openNewBooking(iso)}
                          aria-label={`Нова резервация на ${longDate(iso)}`}
                          className={`${cell} group flex min-h-28 flex-col pb-1.5 pt-1.5 text-left transition-colors hover:bg-accent-soft/60`}
                        >
                          {head}
                          <span className="mt-auto hidden items-center justify-center pb-1 text-accent opacity-0 transition-opacity group-hover:opacity-100 md:flex" aria-hidden="true">
                            <Plus className="h-4 w-4" />
                          </span>
                        </button>
                      )
                    }

                    return (
                      <div key={iso} className={`${cell} min-h-28 pb-1.5 pt-1.5`}>
                        {head}
                        <div className="mt-1.5 space-y-1">
                          {dayBookings.slice(0, 3).map((b) => (
                            <BookingBar key={b.id} booking={b} iso={iso} label={bookingLabel(b)} onOpen={openEditBooking} />
                          ))}
                          {dayBookings.length > 3 && (
                            <button type="button" onClick={() => setSheet({ open: true, iso })} className="mx-1.5 min-h-6 rounded text-[0.6875rem] font-semibold text-accent-ink underline">
                              +{dayBookings.length - 3} още
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1 text-[0.8125rem] text-ink-soft">
            <span className="font-semibold">Източник:</span>
            {BOOKING_SOURCES.map((s) => (
              <span key={s.value} className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-sm ${SOURCE_STYLES[s.value].bar}`} />
                {s.label}
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-card ring-2 ring-inset ring-ink-muted" />
              Чакаща (контур)
            </span>
          </div>
        </div>
      )}

      {/* Лист за деня: резервациите в него и бутон за нова */}
      <Modal
        open={sheet.open}
        onClose={closeSheet}
        title={sheet.iso ? longDate(sheet.iso) : ''}
        description={sheetRule ? `Цена за нощувка: ${Number(sheetRule.price_per_night).toFixed(0)} €` : undefined}
        variant="sheet"
        footer={
          <Button
            onClick={() => {
              const d = sheet.iso
              closeSheet()
              openNewBooking(d)
            }}
            disabled={properties.length === 0}
          >
            <Plus className="h-4 w-4" />
            Нова резервация
          </Button>
        }
      >
        {sheetBookings.length === 0 ? (
          <EmptyState compact icon={Moon} title="Свободен ден" description="Няма настаняване, нощувка или напускане в този ден." />
        ) : (
          <ul className="-mx-1 space-y-1">
            {sheetBookings.map((b) => {
              const style = SOURCE_STYLES[b.source] ?? SOURCE_STYLES.manual
              const state = sheet.iso === b.check_in ? { t: 'Настаняване', Icon: LogIn } : sheet.iso === b.check_out ? { t: 'Напускане', Icon: LogOut } : { t: 'Нощува', Icon: Moon }
              return (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => {
                      closeSheet()
                      openEditBooking(b)
                    }}
                    className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-2 py-1.5 text-left transition-colors active:bg-sunken sm:hover:bg-sunken"
                  >
                    <span className={`h-10 w-1.5 shrink-0 rounded-full ${style.bar}`} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold leading-tight">{b.guest_name}</span>
                      <span className="block truncate text-sm text-ink-soft">{propertyName(b.property_id)}</span>
                      <span className="num block truncate text-[0.8125rem] text-ink-muted">
                        {formatDateBG(b.check_in)} – {formatDateBG(b.check_out)} · {nightsBetween(b.check_in, b.check_out)} н.
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1 text-xs font-semibold text-ink-soft">
                      <span className="flex items-center gap-1">
                        <state.Icon className="h-3.5 w-3.5" aria-hidden="true" />
                        {state.t}
                      </span>
                      <span className={`rounded-md px-1.5 py-0.5 ${style.chip}`}>{sourceLabel(b.source)}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Modal>

      <BookingFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={loadBookings}
        properties={properties}
        initial={editing}
        defaults={modalDefaults}
      />
    </div>
  )
}
