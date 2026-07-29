import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { DoorOpen, LogIn, LogOut, Building2, Plus, Moon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { todayISO, formatDateBG, addDays, toISODate, nightsBetween } from '../lib/dates'
import { SOURCE_STYLES, sourceLabel } from '../lib/bookings'
import { PageHeader, Card, Spinner, Alert, EmptyState, Button } from '../components/ui'

const HORIZON_DAYS = 14

function MovementRow({ booking, propertyName, kind }) {
  const isArrival = kind === 'arrival'
  const date = isArrival ? booking.check_in : booking.check_out

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5">
      <div className="flex items-center gap-3">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
            isArrival ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
          }`}
        >
          {isArrival ? <LogIn className="h-4 w-4" /> : <LogOut className="h-4 w-4" />}
        </span>
        <div>
          <p className="text-sm font-medium text-slate-900">{booking.guest_name}</p>
          <p className="text-xs text-slate-500">{propertyName}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span
          className={`hidden rounded-md px-2 py-0.5 text-xs font-medium sm:inline-flex ${
            (SOURCE_STYLES[booking.source] ?? SOURCE_STYLES.manual).chip
          }`}
        >
          {sourceLabel(booking.source)}
        </span>
        <span className="text-sm font-medium text-slate-700">{formatDateBG(date)}</span>
      </div>
    </li>
  )
}

function Section({ title, icon: Icon, items, emptyText }) {
  return (
    <Card>
      <header className="flex items-center gap-2 border-b border-slate-100 px-6 py-4">
        <Icon className="h-4 w-4 text-slate-400" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">{title}</h2>
        {items.length > 0 && (
          <span className="ml-auto rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
            {items.length}
          </span>
        )}
      </header>

      {items.length === 0 ? (
        <p className="px-6 py-12 text-center text-sm text-slate-500">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-slate-100">{items}</ul>
      )}
    </Card>
  )
}

export default function Dashboard() {
  const [properties, setProperties] = useState([])
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const today = todayISO()
      const horizon = toISODate(addDays(new Date(), HORIZON_DAYS))

      const [propsRes, bookingsRes] = await Promise.all([
        supabase.from('properties').select('id, name').order('name'),
        supabase
          .from('bookings')
          .select('id, property_id, guest_name, check_in, check_out, source, status')
          .neq('status', 'cancelled')
          .lte('check_in', horizon)
          .gte('check_out', today)
          .order('check_in'),
      ])

      if (cancelled) return
      if (bookingsRes.error) setError('Неуспешно зареждане: ' + bookingsRes.error.message)

      setProperties(propsRes.data ?? [])
      setBookings(bookingsRes.data ?? [])
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const today = todayISO()
  const propertyName = (id) => properties.find((p) => p.id === id)?.name ?? '—'

  // Текущо състояние: пристигащи днес, заминаващи днес и текущо настанени.
  const arrivingToday = bookings.filter((b) => b.check_in === today)
  const departingToday = bookings.filter((b) => b.check_out === today)
  const staying = bookings.filter((b) => b.check_in < today && b.check_out > today)

  const currentItems = [
    ...arrivingToday.map((b) => (
      <MovementRow key={`a-${b.id}`} booking={b} propertyName={propertyName(b.property_id)} kind="arrival" />
    )),
    ...departingToday.map((b) => (
      <MovementRow key={`d-${b.id}`} booking={b} propertyName={propertyName(b.property_id)} kind="departure" />
    )),
    ...staying.map((b) => (
      <li key={`s-${b.id}`} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <Moon className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-medium text-slate-900">{b.guest_name}</p>
            <p className="text-xs text-slate-500">{propertyName(b.property_id)}</p>
          </div>
        </div>
        <span className="text-sm text-slate-500">
          настанен · до {formatDateBG(b.check_out)}
        </span>
      </li>
    )),
  ]

  // Предстоящи: движения след днес, в рамките на хоризонта.
  const upcoming = []
  for (const b of bookings) {
    if (b.check_in > today) upcoming.push({ booking: b, kind: 'arrival', date: b.check_in })
    if (b.check_out > today) upcoming.push({ booking: b, kind: 'departure', date: b.check_out })
  }
  upcoming.sort((a, z) => a.date.localeCompare(z.date))

  const upcomingItems = upcoming
    .slice(0, 20)
    .map(({ booking, kind }) => (
      <MovementRow
        key={`${kind}-${booking.id}`}
        booking={booking}
        propertyName={propertyName(booking.property_id)}
        kind={kind}
      />
    ))

  return (
    <div>
      <PageHeader
        icon={DoorOpen}
        title="Настанявания/Напускания"
        description="Преглед на текущото състояние на обектите и предстоящите движения."
      />

      <div className="mt-8 space-y-6">
        {error && <Alert>{error}</Alert>}

        {loading ? (
          <Card>
            <Spinner />
          </Card>
        ) : properties.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="Добре дошли в StayFlow"
            description="Добавете първия си имот, за да започнете да следите настанявания, почиствания и приходи."
            action={
              <Link to="/properties/new">
                <Button>
                  <Plus className="h-4 w-4" />
                  Добави имот
                </Button>
              </Link>
            }
          />
        ) : (
          <>
            <Section
              title="Текущо състояние"
              icon={LogIn}
              items={currentItems}
              emptyText="Няма движения за днес и няма настанени гости."
            />
            <Section
              title={`Предстоящи настанявания и напускания (${HORIZON_DAYS} дни)`}
              icon={LogOut}
              items={upcomingItems}
              emptyText="Няма предстоящи настанявания или напускания."
            />
          </>
        )}
      </div>
    </div>
  )
}
