import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { LogIn, LogOut, Building2, Plus, Moon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { todayISO, formatDateBG, addDays, toISODate, nightsBetween } from '../lib/dates'
import { SOURCE_STYLES, sourceLabel } from '../lib/bookings'
import { Card, Spinner, Alert, EmptyState, Button, PageHeader } from '../components/ui'
import CountUp from '../components/CountUp'
import { rise, useIntro } from '../lib/motion'

const HORIZON_DAYS = 14

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1)
const bg = (iso, opts) => new Intl.DateTimeFormat('bg-BG', opts).format(new Date(`${iso}T12:00:00`))
const initials = (name) =>
  (name || '?')
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

function SourceTag({ source }) {
  const style = SOURCE_STYLES[source] ?? SOURCE_STYLES.manual
  return <span className={`inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-xs font-semibold ${style.chip}`}>{sourceLabel(source)}</span>
}

/** Гост в имота днес: аватар, имот, състояние и лента с изминалите нощувки. */
function StayCard({ booking, propertyName, today, animate, index }) {
  const arrives = booking.check_in === today
  const leaves = booking.check_out === today
  const total = Math.max(1, nightsBetween(booking.check_in, booking.check_out))
  const done = Math.max(0, Math.min(total, nightsBetween(booking.check_in, today)))
  const Icon = arrives ? LogIn : leaves ? LogOut : Moon
  const state = arrives ? 'Пристига днес' : leaves ? 'Напуска днес' : `Настанен · до ${formatDateBG(booking.check_out)}`

  return (
    <li {...rise(index, animate)}>
      <article
        className={`grid h-full grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-3 rounded-2xl p-5 shadow-card ${
          arrives ? 'bg-accent-soft ring-1 ring-accent/30' : 'bg-card'
        }`}
      >
        <span className={`grid h-12 w-12 place-items-center rounded-full text-[0.9375rem] font-bold ${arrives ? 'bg-card text-accent-ink' : 'bg-accent-soft text-accent-ink'}`} aria-hidden="true">
          {initials(booking.guest_name)}
        </span>
        <div className="col-span-2 min-w-0">
          <p className="truncate text-[1.0625rem] font-semibold leading-tight">{booking.guest_name}</p>
          <p className="truncate text-sm text-ink-soft">{propertyName}</p>
        </div>
        <p className={`col-span-2 flex items-center gap-2 text-sm ${arrives ? 'font-semibold text-accent-ink' : 'text-ink-soft'}`}>
          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
          {state}
        </p>
        <SourceTag source={booking.source} />
        <div
          className={`col-span-3 h-1.5 overflow-hidden rounded-full ${arrives ? 'bg-accent/15' : 'bg-sunken'}`}
          role="img"
          aria-label={`${done} от ${total} нощувки`}
        >
          <div className={`h-full rounded-full ${arrives ? 'bg-accent' : 'bg-accent/70'}`} style={{ width: `${Math.round((done / total) * 100)}%` }} />
        </div>
      </article>
    </li>
  )
}

/** Ден от следващите 14 дни: голямо число (Literata) и движенията в него. */
function DayGroup({ date, events, propertyName, animate, index }) {
  const weekday = capitalize(bg(date, { weekday: 'long' }))
  const month = bg(date, { month: 'long' })
  return (
    <li className="grid gap-x-5 gap-y-1 border-t border-line py-5 first:border-t-0 sm:grid-cols-[9.5rem_1fr]" {...rise(index, animate)}>
      <h3 className="flex items-center gap-3 self-start sm:items-baseline">
        <span className="font-display text-4xl font-semibold leading-none tracking-tighter sm:text-5xl">{bg(date, { day: 'numeric' })}</span>
        <span className="text-[0.9375rem] leading-tight text-ink-soft">
          {weekday}
          <span className="block text-[0.8125rem] text-ink-muted">{month}</span>
        </span>
      </h3>
      <ul className="min-w-0">
        {events.map(({ booking, kind }) => {
          const arrival = kind === 'arrival'
          return (
            <li key={`${kind}-${booking.id}`} className="flex items-center gap-3.5 border-t border-line py-3.5 first:border-t-0 first:pt-0 last:pb-0 sm:first:pt-0">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${arrival ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning'}`}>
                {arrival ? <LogIn className="h-4 w-4" aria-hidden="true" /> : <LogOut className="h-4 w-4" aria-hidden="true" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold leading-tight">{booking.guest_name}</p>
                <p className="truncate text-sm text-ink-soft">{propertyName(booking.property_id)}</p>
              </div>
              <span className="hidden text-sm text-ink-muted sm:block">{arrival ? 'Настаняване' : 'Напускане'}</span>
              <SourceTag source={booking.source} />
            </li>
          )
        })}
      </ul>
    </li>
  )
}

function Kpi({ label, value, hint, id, hero }) {
  return (
    <div className="min-w-0 px-4 py-5 sm:px-7">
      <p className="text-sm font-medium text-ink-soft">{label}</p>
      <p className={`my-1.5 font-display text-[2.5rem] font-semibold leading-none tracking-tighter sm:text-[3.5rem] ${hero ? 'text-accent' : 'text-ink'}`}>
        <CountUp value={value} id={id} />
      </p>
      <p className="truncate text-[0.8125rem] text-ink-muted">{hint}</p>
    </div>
  )
}

function Panel({ title, count, children }) {
  return (
    <section className="mt-10 sm:mt-12">
      <div className="mb-4 flex items-center justify-between gap-3 sm:mb-5">
        <h2 className="text-[1.375rem] sm:text-[1.625rem]">{title}</h2>
        {count > 0 && <span className="grid h-7 min-w-7 place-items-center rounded-full bg-sunken px-2 text-[0.8125rem] font-semibold text-ink-soft">{count}</span>}
      </div>
      {children}
    </section>
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

  const animate = useIntro('screen-dashboard', !loading)
  const today = todayISO()
  const propertyName = (id) => properties.find((p) => p.id === id)?.name ?? '—'

  // Текущо състояние: пристигащи днес, заминаващи днес и текущо настанени.
  const arrivingToday = bookings.filter((b) => b.check_in === today)
  const departingToday = bookings.filter((b) => b.check_out === today)
  const inHouse = bookings.filter((b) => b.check_in <= today && b.check_out > today)
  // „Сега в имотите“: настанени (включително пристигащите днес) и тези, които днес напускат
  const nowItems = bookings.filter((b) => b.check_in <= today && b.check_out >= today && b.check_in !== b.check_out)

  // Предстоящи: движения след днес, в рамките на хоризонта, групирани по ден.
  const upcoming = []
  for (const b of bookings) {
    if (b.check_in > today) upcoming.push({ booking: b, kind: 'arrival', date: b.check_in })
    if (b.check_out > today) upcoming.push({ booking: b, kind: 'departure', date: b.check_out })
  }
  upcoming.sort((a, z) => a.date.localeCompare(z.date))
  const upcomingShown = upcoming.slice(0, 20)
  const byDay = []
  for (const e of upcomingShown) {
    const last = byDay[byDay.length - 1]
    if (last && last.date === e.date) last.events.push(e)
    else byDay.push({ date: e.date, events: [e] })
  }

  const firstOf = (list) => list[0]?.guest_name
  const distinctProps = new Set(inHouse.map((b) => b.property_id)).size

  return (
    <div>
      <PageHeader
        eyebrow={capitalize(bg(today, { weekday: 'long', day: 'numeric', month: 'long' }))}
        title="Табло"
        description={`Какво се случва в имотите днес и през следващите ${HORIZON_DAYS} дни.`}
      />
      <div className="mt-8 sm:mt-10" />

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
          <section aria-label="Днес накратко" className="card grid grid-cols-3 divide-x divide-line py-1 sm:py-2" {...rise(0, animate)}>
            <Kpi label="Пристигат днес" value={arrivingToday.length} id="dash-arrive" hero hint={firstOf(arrivingToday) ?? 'няма'} />
            <Kpi label="Напускат днес" value={departingToday.length} id="dash-leave" hint={firstOf(departingToday) ?? 'няма'} />
            <Kpi label="Настанени сега" value={inHouse.length} id="dash-house" hint={`${distinctProps} от ${properties.length} ${properties.length === 1 ? 'имот' : 'имота'}`} />
          </section>

          <Panel title="Сега в имотите" count={nowItems.length}>
            {nowItems.length === 0 ? (
              <p className="card px-6 py-12 text-center text-sm text-ink-soft">Няма движения за днес и няма настанени гости.</p>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-[repeat(auto-fill,minmax(17.5rem,1fr))]">
                {nowItems.map((b, i) => (
                  <StayCard key={b.id} booking={b} propertyName={propertyName(b.property_id)} today={today} animate={animate} index={i + 1} />
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={`Следващите ${HORIZON_DAYS} дни`} count={upcomingShown.length}>
            {byDay.length === 0 ? (
              <p className="card px-6 py-12 text-center text-sm text-ink-soft">Няма предстоящи настанявания или напускания.</p>
            ) : (
              <ul className="card px-5 sm:px-7">
                {byDay.map((d, i) => (
                  <DayGroup key={d.date} date={d.date} events={d.events} propertyName={propertyName} animate={animate} index={i + 1} />
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}
    </div>
  )
}
