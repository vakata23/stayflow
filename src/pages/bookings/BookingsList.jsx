import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { BookMarked, Plus, ArrowUpDown, Building2, Filter } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatDateBG, nightsBetween } from '../../lib/dates'
import {
  BOOKING_STATUSES,
  SOURCE_STYLES,
  STATUS_STYLES,
  sourceLabel,
  statusLabel,
} from '../../lib/bookings'
import { PageHeader, Card, Select, Input, Button, Alert, Spinner, EmptyState } from '../../components/ui'
import BookingFormModal from './BookingFormModal'

export default function BookingsList() {
  const [properties, setProperties] = useState([])
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [propertyId, setPropertyId] = useState('all')
  const [status, setStatus] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [sortAsc, setSortAsc] = useState(true)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  useEffect(() => {
    supabase
      .from('properties')
      .select('id, name, max_guests')
      .order('name')
      .then(({ data }) => setProperties(data ?? []))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    let query = supabase
      .from('bookings')
      .select('*')
      .order('check_in', { ascending: sortAsc })

    if (propertyId !== 'all') query = query.eq('property_id', propertyId)
    if (status !== 'all') query = query.eq('status', status)
    if (from) query = query.gte('check_in', from)
    if (to) query = query.lte('check_in', to)

    const { data, error } = await query
    if (error) setError('Неуспешно зареждане: ' + error.message)
    setBookings(data ?? [])
    setLoading(false)
  }, [propertyId, status, from, to, sortAsc])

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
  }

  return (
    <div>
      <PageHeader
        icon={BookMarked}
        title="Резервации"
        description="Всички резервации с филтри и сортиране."
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

      <div className="mt-8 space-y-4">
        {error && <Alert>{error}</Alert>}

        <Card className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex items-center gap-1.5 pb-2 text-sm font-medium text-slate-500">
              <Filter className="h-4 w-4" />
              Филтри
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">Имот</span>
              <Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className="w-auto min-w-44">
                <option value="all">Всички</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">Статус</span>
              <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto min-w-36">
                <option value="all">Всички</option>
                {BOOKING_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">Настаняване от</span>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-auto" />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">до</span>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-auto" />
            </label>

            {hasFilters && (
              <Button variant="secondary" onClick={clearFilters} className="!py-2">
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
            icon={hasFilters ? Filter : BookMarked}
            title={hasFilters ? 'Няма резервации по тези филтри' : 'Още нямате резервации'}
            description={
              hasFilters
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
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-5 py-3 font-semibold">Гост</th>
                    <th className="px-5 py-3 font-semibold">Имот</th>
                    <th className="px-5 py-3 font-semibold">
                      <button
                        onClick={() => setSortAsc((s) => !s)}
                        className="inline-flex items-center gap-1 hover:text-slate-800"
                        title="Сортирай по настаняване"
                      >
                        Настаняване
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </th>
                    <th className="px-5 py-3 font-semibold">Напускане</th>
                    <th className="px-5 py-3 font-semibold">Нощувки</th>
                    <th className="px-5 py-3 font-semibold">Цена</th>
                    <th className="px-5 py-3 font-semibold">Източник</th>
                    <th className="px-5 py-3 font-semibold">Статус</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {bookings.map((b) => (
                    <tr
                      key={b.id}
                      onClick={() => {
                        setEditing(b)
                        setModalOpen(true)
                      }}
                      className="cursor-pointer hover:bg-slate-50/60"
                    >
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-slate-900">{b.guest_name}</p>
                        {b.guest_phone && <p className="text-xs text-slate-400">{b.guest_phone}</p>}
                      </td>
                      <td className="px-5 py-3.5 text-slate-600">{propertyName(b.property_id)}</td>
                      <td className="px-5 py-3.5 text-slate-600">{formatDateBG(b.check_in)}</td>
                      <td className="px-5 py-3.5 text-slate-600">{formatDateBG(b.check_out)}</td>
                      <td className="px-5 py-3.5 text-slate-600">
                        {nightsBetween(b.check_in, b.check_out)}
                      </td>
                      <td className="px-5 py-3.5 text-slate-600">
                        {b.total_price != null ? `${Number(b.total_price).toFixed(2)} лв.` : '—'}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${
                            (SOURCE_STYLES[b.source] ?? SOURCE_STYLES.manual).chip
                          }`}
                        >
                          {sourceLabel(b.source)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[b.status]}`}
                        >
                          {statusLabel(b.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
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
