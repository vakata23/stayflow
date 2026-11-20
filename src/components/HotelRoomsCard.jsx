import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BedDouble, CalendarDays } from 'lucide-react'
import { Card, Field, Input, Button, Alert, Spinner } from './ui'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { hotelsAvailable, loadRooms, loadRoomPrices, createRooms } from '../lib/hotel'
import { groupRooms, planRooms, dayStats, MAX_ROOMS_PER_HOTEL } from '../lib/hotelLogic'
import { todayISO } from '../lib/dates'

/** Следващият свободен номер след най-големия в имената на стаите (Стая 102 → 103); без стаи → 101. */
function nextNumber(names) {
  const nums = names.map((n) => Number(String(n).match(/(\d+)\s*$/)?.[1])).filter((n) => Number.isFinite(n))
  return nums.length ? Math.max(...nums) + 1 : 101
}

/**
 * „Стаи“ — картата на хотела: стаите по вид, добавяне на няколко наведнъж и преминаване към календара на стаите.
 * Всяка стая е имот със свой календар, цена и iCal връзка с Booking/Airbnb. Вижда се само за имот от вид „Хотел“
 * и само ако миграция 019 е пусната.
 */
export default function HotelRoomsCard({ hotel }) {
  const { profile } = useAuth()
  const [state, setState] = useState('loading') // loading | hidden | ready
  const [rooms, setRooms] = useState([])
  const [prices, setPrices] = useState({})
  const [todayBookings, setTodayBookings] = useState([])
  const [form, setForm] = useState({ type: '', count: 5, prefix: 'Стая', startNumber: 101, maxGuests: 2, price: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(null)

  const load = useCallback(async () => {
    try {
      if (!(await hotelsAvailable())) return setState('hidden')
      const list = await loadRooms(hotel.id)
      const ids = list.map((r) => r.id)
      const [p, b] = await Promise.all([
        loadRoomPrices(ids),
        ids.length
          ? supabase.from('bookings').select('property_id, check_in, check_out, status').in('property_id', ids).lte('check_in', todayISO()).gte('check_out', todayISO())
          : Promise.resolve({ data: [] }),
      ])
      setRooms(list)
      setPrices(p)
      setTodayBookings(b.data ?? [])
      setForm((f) => ({ ...f, startNumber: nextNumber(list.map((r) => r.name)) }))
      setState('ready')
    } catch {
      setState('hidden')
    }
  }, [hotel.id])

  useEffect(() => {
    load()
  }, [load])

  const groups = useMemo(() => groupRooms(rooms), [rooms])
  const stats = useMemo(() => dayStats(rooms, todayBookings, todayISO()), [rooms, todayBookings])

  if (state === 'loading') return <Card className="p-6"><Spinner /></Card>
  if (state === 'hidden') return null

  const set = (key) => (e) => {
    setDone(null)
    setForm((f) => ({ ...f, [key]: e.target.value }))
  }

  const add = async (e) => {
    e.preventDefault()
    setError(null)
    setDone(null)
    const plan = planRooms(form, rooms.map((r) => r.name), rooms.length)
    if (plan.error) return setError(plan.error)
    if (!profile?.id) return setError('Профилът ви не беше намерен. Излезте и влезте отново.')
    setSaving(true)
    try {
      await createRooms(hotel, plan, profile.id)
      setDone(plan.rows.length)
      await load()
    } catch (err) {
      setError('Неуспешно добавяне: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const priceLabel = (g) => {
    const list = g.rooms.map((r) => prices[r.id]).filter((n) => n > 0)
    return list.length ? `от ${Math.min(...list)} €` : null
  }

  return (
    <Card className="p-6" id="hotel-rooms">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="type-heading">Стаи</h2>
          <p className="mt-1 text-xs text-ink-muted">
            Всяка стая има свой календар, своя цена и своя iCal връзка с Booking и Airbnb. Гостите избират вид стая, а системата им дава свободна.
          </p>
        </div>
        {rooms.length > 0 && (
          <Link to={`/hotels/${hotel.id}/calendar`}>
            <Button type="button" variant="secondary">
              <CalendarDays className="h-4 w-4" />
              Календар на стаите
            </Button>
          </Link>
        )}
      </div>

      {rooms.length > 0 && (
        <p className="mt-4 text-sm text-ink-soft" data-testid="hotel-today">
          {`Днес: ${stats.occupied} от ${stats.total} стаи са заети (${stats.percent}%), ${stats.arrivals} пристигат, ${stats.departures} заминават.`}
        </p>
      )}

      {groups.length === 0 ? (
        <p className="mt-4 text-sm text-ink-muted">Още няма стаи. Добавете първите по-долу — например 10 двойни стаи наведнъж.</p>
      ) : (
        <div className="mt-4 space-y-4">
          {groups.map((g) => (
            <section key={g.type} aria-label={g.type}>
              <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                <BedDouble className="h-4 w-4 text-ink-muted" aria-hidden="true" />
                <span translate="no">{g.type}</span>
                <span className="font-normal text-ink-muted">{`· ${g.rooms.length} ${g.rooms.length === 1 ? 'стая' : 'стаи'}`}</span>
                {priceLabel(g) && <span className="font-normal text-ink-muted">{`· ${priceLabel(g)}`}</span>}
              </h3>
              <ul className="mt-2 flex flex-wrap gap-2">
                {g.rooms.map((r) => (
                  <li key={r.id}>
                    <Link
                      to={`/properties/${r.id}`}
                      className="inline-flex min-h-[34px] items-center rounded-lg border border-line bg-sunken px-3 text-sm text-ink hover:border-accent"
                    >
                      <span translate="no">{r.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <form onSubmit={add} noValidate className="mt-6 space-y-4 border-t border-line pt-5">
        <h3 className="text-sm font-semibold text-ink">Добавяне на стаи</h3>
        {error && <Alert>{error}</Alert>}
        {done && <Alert kind="success">{done === 1 ? 'Добавена е 1 стая.' : `Добавени са ${done} стаи.`}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Вид на стаите" hint="Например: Двойна стая, Семеен апартамент">
            <Input value={form.type} onChange={set('type')} maxLength={60} placeholder="Двойна стая" />
          </Field>
          <Field label="Колко стаи" hint={`До ${MAX_ROOMS_PER_HOTEL} в хотел`}>
            <Input type="number" inputMode="numeric" min={1} value={form.count} onChange={set('count')} />
          </Field>
          <Field label="Име преди номера">
            <Input value={form.prefix} onChange={set('prefix')} maxLength={30} placeholder="Стая" />
          </Field>
          <Field label="Започни от номер" hint="101, 102, 103…">
            <Input type="number" inputMode="numeric" min={0} value={form.startNumber} onChange={set('startNumber')} />
          </Field>
          <Field label="Гости в стая">
            <Input type="number" inputMode="numeric" min={1} max={50} value={form.maxGuests} onChange={set('maxGuests')} />
          </Field>
          <Field label="Цена на нощ (€)" hint="По избор — можете да я зададете по-късно">
            <Input type="number" inputMode="decimal" min={1} step="1" value={form.price} onChange={set('price')} placeholder="80" />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button type="submit" loading={saving}>
            Добави стаите
          </Button>
        </div>
      </form>
    </Card>
  )
}
