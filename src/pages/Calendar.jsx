import { useEffect, useMemo, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Building2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  MONTHS_BG,
  WEEKDAYS_BG,
  monthGrid,
  toISODate,
  todayISO,
  bookingCoversDay,
} from '../lib/dates'
import { SOURCE_STYLES, BOOKING_SOURCES } from '../lib/bookings'
import { priceForDay } from '../lib/pricing'
import { PageHeader, Card, Select, Button, Alert, Spinner, EmptyState } from '../components/ui'
import BookingFormModal from './bookings/BookingFormModal'

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
      .select('id, property_id, guest_name, check_in, check_out, source, status, num_guests, total_price, guest_phone, guest_email, notes')
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

  return (
    <div>
      <PageHeader
        icon={CalendarDays}
        title="Календар"
        description="Заетост по дни. Кликнете на свободен ден, за да добавите резервация."
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
        <div className="mt-8 space-y-4">
          {error && <Alert>{error}</Alert>}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={goPrev}
                className="rounded-lg border border-slate-300 bg-white p-2 text-slate-600 hover:bg-slate-50"
                aria-label="Предишен месец"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-44 text-center text-base font-bold">
                {MONTHS_BG[month]} {year}
              </span>
              <button
                onClick={goNext}
                className="rounded-lg border border-slate-300 bg-white p-2 text-slate-600 hover:bg-slate-50"
                aria-label="Следващ месец"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <Button variant="secondary" onClick={goToday} className="ml-1 !py-2">
                Днес
              </Button>
            </div>

            <Select
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="w-auto min-w-52"
            >
              <option value="all">Всички имоти</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>

          <Card className="overflow-hidden">
            {loading ? (
              <Spinner />
            ) : (
              <>
                <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/60">
                  {WEEKDAYS_BG.map((d) => (
                    <div
                      key={d}
                      className="px-2 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-slate-500"
                    >
                      {d}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7">
                  {days.map(({ iso, date, inMonth }) => {
                    const dayBookings = bookings.filter((b) => bookingCoversDay(b, iso))
                    const isToday = iso === today
                    const rule = pricingRules.length ? priceForDay(pricingRules, iso) : null

                    return (
                      <div
                        key={iso}
                        className={`min-h-24 border-b border-r border-slate-100 p-1.5 transition-colors last:border-r-0 ${
                          inMonth ? 'bg-white' : 'bg-slate-50/50'
                        } ${dayBookings.length === 0 ? 'cursor-pointer hover:bg-brand-50/50' : ''}`}
                        onClick={() => dayBookings.length === 0 && openNewBooking(iso)}
                      >
                        <div className="flex items-center justify-between">
                          {rule && inMonth ? (
                            <span className="rounded bg-brand-50 px-1 text-[10px] font-semibold text-brand-700">
                              {Number(rule.price_per_night).toFixed(0)} лв
                            </span>
                          ) : (
                            <span />
                          )}
                          <span
                            className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                              isToday
                                ? 'bg-brand-600 font-bold text-white'
                                : inMonth
                                  ? 'text-slate-600'
                                  : 'text-slate-300'
                            }`}
                          >
                            {date.getDate()}
                          </span>
                        </div>

                        <div className="mt-1 space-y-1">
                          {dayBookings.slice(0, 3).map((b) => {
                            const style = SOURCE_STYLES[b.source] ?? SOURCE_STYLES.manual
                            const isStart = b.check_in === iso
                            return (
                              <button
                                key={b.id}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openEditBooking(b)
                                }}
                                className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium text-white ${style.bar} ${
                                  b.status === 'pending' ? 'opacity-60' : ''
                                }`}
                                title={`${b.guest_name} — ${propertyName(b.property_id)}`}
                              >
                                {isStart || date.getDay() === 1
                                  ? propertyId === 'all'
                                    ? `${b.guest_name} · ${propertyName(b.property_id)}`
                                    : b.guest_name
                                  : ' '}
                              </button>
                            )
                          })}
                          {dayBookings.length > 3 && (
                            <p className="px-1.5 text-[10px] text-slate-400">
                              +{dayBookings.length - 3} още
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </Card>

          <div className="flex flex-wrap items-center gap-4 px-1 text-xs text-slate-500">
            <span className="font-medium">Източник:</span>
            {BOOKING_SOURCES.map((s) => (
              <span key={s.value} className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-sm ${SOURCE_STYLES[s.value].bar}`} />
                {s.label}
              </span>
            ))}
          </div>
        </div>
      )}

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
