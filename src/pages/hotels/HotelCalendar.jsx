import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, BedDouble, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { hotelsAvailable, loadRooms } from '../../lib/hotel'
import { groupRooms, timelineDays, bookingSpan, dayStats, freePerDay } from '../../lib/hotelLogic'
import { appLocale } from '../../i18n/appLang'
import { todayISO, addDays, fromISODate, toISODate, WEEKDAYS_BG } from '../../lib/dates'
import { SOURCE_STYLES, BOOKING_SOURCES } from '../../lib/bookings'
import { PageHeader, Card, Button, Alert, Spinner, EmptyState } from '../../components/ui'
import BookingFormModal from '../bookings/BookingFormModal'

const SHOWN_DAYS = 14
const STEP = 7

const dayLabel = (iso) => {
  const d = fromISODate(iso)
  return { weekday: WEEKDAYS_BG[(d.getDay() + 6) % 7], num: d.getDate(), month: d.getMonth() }
}

/**
 * Календар на стаите („шахматна таблица“): стаите по редове, 14 дни по колони. Резервацията е лента през дните,
 * денят на напускане е свободен за нов гост. Клик на празна клетка — нова резервация за тази стая и ден.
 */
export default function HotelCalendar() {
  const { id } = useParams()
  const [hotel, setHotel] = useState(null)
  const [rooms, setRooms] = useState([])
  const [bookings, setBookings] = useState([])
  const [start, setStart] = useState(() => toISODate(addDays(fromISODate(todayISO()), -1)))
  const [state, setState] = useState('loading') // loading | ready | missing
  const [error, setError] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalDefaults, setModalDefaults] = useState({})
  const [editing, setEditing] = useState(null)

  const days = useMemo(() => timelineDays(start, SHOWN_DAYS), [start])
  const rangeStart = days[0]
  const rangeEnd = days[days.length - 1]

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (!(await hotelsAvailable())) return setState('missing')
        const { data: h } = await supabase.from('properties').select('id, name, property_type').eq('id', id).maybeSingle()
        if (cancelled) return
        if (!h) return setState('missing')
        const list = await loadRooms(id)
        if (cancelled) return
        setHotel(h)
        setRooms(list)
        setState('ready')
      } catch {
        if (!cancelled) setState('missing')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  const loadBookings = useCallback(async () => {
    if (!rooms.length) return setBookings([])
    setError(null)
    const { data, error: err } = await supabase
      .from('bookings')
      .select('id, property_id, guest_name, check_in, check_out, source, status, num_guests, total_price, commission, tourist_tax, guest_phone, guest_email, notes')
      .in('property_id', rooms.map((r) => r.id))
      .neq('status', 'cancelled')
      .lte('check_in', rangeEnd)
      .gt('check_out', rangeStart)
    if (err) setError('Неуспешно зареждане на резервациите: ' + err.message)
    setBookings(data ?? [])
  }, [rooms, rangeStart, rangeEnd])

  useEffect(() => {
    loadBookings()
  }, [loadBookings])

  const groups = useMemo(() => groupRooms(rooms), [rooms])
  const free = useMemo(() => freePerDay(rooms, bookings, days), [rooms, bookings, days])
  const today = todayISO()

  if (state === 'loading') return <Spinner />
  if (state === 'missing') {
    return (
      <EmptyState
        icon={BedDouble}
        title="Няма календар на стаи"
        description="Този имот не е хотел или хотелските стаи още не са включени в акаунта."
        action={<Link to="/properties"><Button>Към имотите</Button></Link>}
      />
    )
  }

  const shift = (n) => setStart((s) => toISODate(addDays(fromISODate(s), n)))
  const openNew = (roomId, iso) => {
    setEditing(null)
    setModalDefaults({ property_id: roomId, check_in: iso })
    setModalOpen(true)
  }
  const openEdit = (b) => {
    setEditing(b)
    setModalDefaults({})
    setModalOpen(true)
  }

  const todayStats = dayStats(rooms, bookings, today)
  const first = dayLabel(rangeStart)
  const last = dayLabel(rangeEnd)
  const monthName = (m) => new Date(2000, m, 1).toLocaleDateString(appLocale(), { month: 'long' })
  const range = first.month === last.month ? `${monthName(first.month)} ${fromISODate(rangeStart).getFullYear()}` : `${monthName(first.month)} – ${monthName(last.month)} ${fromISODate(rangeEnd).getFullYear()}`

  return (
    <div>
      <Link to={`/properties/${hotel.id}`} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-ink">
        <ArrowLeft className="h-4 w-4" />
        <span translate="no">{hotel.name}</span>
      </Link>
      <PageHeader
        icon={BedDouble}
        title="Календар на стаите"
        description="Всяка стая на свой ред. Кликнете на празна клетка, за да добавите резервация."
        action={
          <Button onClick={() => openNew(rooms[0]?.id, today)} disabled={rooms.length === 0}>
            <Plus className="h-4 w-4" />
            Нова резервация
          </Button>
        }
      />

      <div className="mt-8 space-y-4">
        {error && <Alert>{error}</Alert>}

        {rooms.length === 0 ? (
          <EmptyState icon={BedDouble} title="Още няма стаи" description="Добавете стаи в страницата на хотела и тук ще видите заетостта им." action={<Link to={`/properties/${hotel.id}`}><Button>Към хотела</Button></Link>} />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button onClick={() => shift(-STEP)} className="icon-btn border border-line-strong bg-card text-ink-soft" aria-label="Назад с една седмица">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="min-w-40 text-center text-base font-bold capitalize">{range}</span>
                <button onClick={() => shift(STEP)} className="icon-btn border border-line-strong bg-card text-ink-soft" aria-label="Напред с една седмица">
                  <ChevronRight className="h-4 w-4" />
                </button>
                <Button variant="secondary" onClick={() => setStart(toISODate(addDays(fromISODate(today), -1)))} className="ml-1">
                  Днес
                </Button>
              </div>
              <p className="text-sm text-ink-soft" data-testid="hotel-cal-today">
                {`Днес: ${todayStats.occupied} от ${todayStats.total} заети`}
              </p>
            </div>

            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] border-collapse text-xs" aria-label="Календар на стаите">
                  <thead>
                    <tr className="bg-sunken/60">
                      <th scope="col" className="sticky left-0 z-10 w-36 min-w-36 border-b border-r border-line bg-sunken px-3 py-2 text-left text-xs font-semibold text-ink-soft">
                        Стая
                      </th>
                      {days.map((iso) => {
                        const l = dayLabel(iso)
                        return (
                          <th key={iso} scope="col" className={`border-b border-r border-line px-1 py-1.5 text-center font-medium ${iso === today ? 'bg-accent-soft text-accent-ink' : 'text-ink-soft'}`}>
                            <span className="block text-[10px] uppercase">{l.weekday}</span>
                            <span className="block text-sm font-bold">{l.num}</span>
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g) => (
                      <GroupRows key={g.type} group={g} days={days} today={today} bookings={bookings} onNew={openNew} onEdit={openEdit} />
                    ))}
                    <tr className="bg-sunken/60">
                      <th scope="row" className="sticky left-0 z-10 border-r border-t border-line bg-sunken px-3 py-2 text-left text-xs font-semibold text-ink-soft">
                        Свободни стаи
                      </th>
                      {free.map((n, i) => (
                        <td key={days[i]} className={`border-r border-t border-line px-1 py-2 text-center font-semibold ${n === 0 ? 'text-danger-ink' : 'text-ink'}`}>
                          {n}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>

            <div className="flex flex-wrap items-center gap-4 px-1 text-xs text-ink-soft">
              <span className="font-medium">Източник:</span>
              {BOOKING_SOURCES.map((s) => (
                <span key={s.value} className="flex items-center gap-1.5">
                  <span className={`h-2.5 w-2.5 rounded-sm ${SOURCE_STYLES[s.value].bar}`} />
                  {s.label}
                </span>
              ))}
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-card ring-2 ring-inset ring-ink-muted" />
                Чакаща (само контур)
              </span>
            </div>
          </>
        )}
      </div>

      <BookingFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={loadBookings}
        properties={rooms}
        initial={editing}
        defaults={modalDefaults}
      />
    </div>
  )
}

/** Заглавен ред за вида стаи и по един ред на стая. */
function GroupRows({ group, days, today, bookings, onNew, onEdit }) {
  return (
    <>
      <tr>
        <th scope="rowgroup" colSpan={days.length + 1} className="border-b border-t border-line bg-sunken/40 px-3 py-1.5 text-left text-xs font-semibold text-ink">
          <span translate="no">{group.type}</span>
          <span className="ml-2 font-normal text-ink-muted">{`· ${group.rooms.length} ${group.rooms.length === 1 ? 'стая' : 'стаи'}`}</span>
        </th>
      </tr>
      {group.rooms.map((room) => (
        <RoomRow key={room.id} room={room} days={days} today={today} bookings={bookings.filter((b) => b.property_id === room.id)} onNew={onNew} onEdit={onEdit} />
      ))}
    </>
  )
}

function RoomRow({ room, days, today, bookings, onNew, onEdit }) {
  const spans = {}
  for (const b of bookings) {
    const s = bookingSpan(b, days)
    if (s) spans[s.start] = { b, ...s }
  }
  const cells = []
  for (let i = 0; i < days.length; ) {
    const sp = spans[i]
    if (sp) {
      const style = SOURCE_STYLES[sp.b.source] ?? SOURCE_STYLES.manual
      cells.push(
        <td key={days[i]} colSpan={sp.length} className="border-b border-r border-line p-0.5">
          <button
            type="button"
            onClick={() => onEdit(sp.b)}
            title={`${sp.b.guest_name} · ${sp.b.check_in} → ${sp.b.check_out}`}
            className={`block h-7 w-full truncate px-1.5 text-left text-[11px] font-medium ${sp.cutLeft ? 'rounded-l-none' : 'rounded-l-md'} ${sp.cutRight ? 'rounded-r-none' : 'rounded-r-md'} ${
              sp.b.status === 'pending' ? `bg-card text-ink ring-2 ring-inset ${style.ring}` : `text-white ${style.bar}`
            }`}
          >
            <span translate="no">{sp.b.guest_name}</span>
          </button>
        </td>
      )
      i += sp.length
    } else {
      const iso = days[i]
      cells.push(
        <td
          key={iso}
          onClick={() => onNew(room.id, iso)}
          className={`h-8 cursor-pointer border-b border-r border-line hover:bg-accent-soft/50 ${iso === today ? 'bg-accent-soft/30' : ''}`}
          aria-label={`${room.name}, ${iso}, свободно`}
        />
      )
      i += 1
    }
  }
  return (
    <tr>
      <th scope="row" className="sticky left-0 z-10 w-36 min-w-36 truncate border-b border-r border-line bg-card px-3 py-1 text-left text-xs font-medium text-ink">
        <Link to={`/properties/${room.id}`} className="hover:text-accent-ink">
          <span translate="no">{room.name}</span>
        </Link>
      </th>
      {cells}
    </tr>
  )
}
