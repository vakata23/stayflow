import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Inbox, Check, X, Building2, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatDateBG, nightsBetween } from '../lib/dates'
import { formatMoney } from '../lib/money'
import { translateBookingError, suggestTouristTax } from '../lib/bookings'
import { PageHeader, Card, Button, Alert, EmptyState, LoadingCard } from '../components/ui'

const STATUS_TABS = [
  { value: 'pending', label: 'Чакащи' },
  { value: 'accepted', label: 'Приети' },
  { value: 'declined', label: 'Отказани' },
  { value: 'expired', label: 'Изтекли' },
  { value: 'all', label: 'Всички' },
]

const STATUS_STYLES = {
  pending: 'bg-warning-soft text-warning-ink',
  accepted: 'bg-success-soft text-success-ink',
  declined: 'bg-sunken text-ink-soft',
  expired: 'bg-sunken text-ink-muted',
}
const STATUS_LABELS = {
  pending: 'Чакаща',
  accepted: 'Приета',
  declined: 'Отказана',
  expired: 'Изтекла',
}

export default function BookingRequests() {
  const [requests, setRequests] = useState([])
  const [properties, setProperties] = useState({})
  const [status, setStatus] = useState('pending')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actingId, setActingId] = useState(null)

  useEffect(() => {
    supabase
      .from('properties')
      .select('id, name')
      .then(({ data }) => setProperties(Object.fromEntries((data ?? []).map((p) => [p.id, p.name]))))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    let query = supabase.from('booking_requests').select('*').order('created_at', { ascending: false })
    if (status !== 'all') query = query.eq('status', status)

    const { data, error } = await query
    if (error) setError('Неуспешно зареждане: ' + error.message)
    setRequests(data ?? [])
    setLoading(false)
  }, [status])

  useEffect(() => {
    load()
  }, [load])

  const handleDecline = async (req) => {
    setActingId(req.id)
    setError(null)
    const { error } = await supabase
      .from('booking_requests')
      .update({ status: 'declined', decided_at: new Date().toISOString() })
      .eq('id', req.id)
    setActingId(null)
    if (error) return setError('Неуспешно отказване: ' + error.message)
    load()
  }

  const handleAccept = async (req) => {
    setActingId(req.id)
    setError(null)
    try {
      // Туристическата такса не се пази в заявката — смятаме я наново от
      // текущите настройки на имота (property_settings), не от стара
      // цитирана стойност, която може вече да не е актуална.
      const { data: settings } = await supabase
        .from('property_settings')
        .select('tourist_tax')
        .eq('property_id', req.property_id)
        .maybeSingle()

      const nights = nightsBetween(req.check_in, req.check_out)
      const touristTax = suggestTouristTax(req.num_guests, nights, settings?.tourist_tax ?? 0)

      const { error: bookingError } = await supabase.from('bookings').insert({
        property_id: req.property_id,
        guest_name: req.guest_name,
        guest_phone: req.guest_phone,
        guest_email: req.guest_email,
        check_in: req.check_in,
        check_out: req.check_out,
        num_guests: req.num_guests,
        total_price: req.quoted_total,
        commission: 0,
        tourist_tax: touristTax,
        source: 'direct',
        status: 'confirmed',
        notes: req.message || null,
      })
      // Последна защита: ако датите вече са заети (напр. приета е друга
      // заявка за същия период), exclusion constraint-ът го хваща тук.
      if (bookingError) throw bookingError

      const { error: updateError } = await supabase
        .from('booking_requests')
        .update({ status: 'accepted', decided_at: new Date().toISOString() })
        .eq('id', req.id)
      if (updateError) throw updateError

      load()
    } catch (err) {
      setError(translateBookingError(err))
    } finally {
      setActingId(null)
    }
  }

  const pendingCount = status === 'pending' ? requests.length : null

  return (
    <div>
      <PageHeader
        icon={Inbox}
        eyebrow="Директни резервации"
        title="Заявки за резервация"
        description="Заявки от публичната страница за резервации — приемете или откажете."
      />

      <div className="mt-8 space-y-4">
        {error && <Alert>{error}</Alert>}

        <div className="flex flex-wrap gap-2">
          {STATUS_TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setStatus(t.value)}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                status === t.value ? 'bg-accent text-white' : 'bg-sunken text-ink-soft hover:bg-line'
              }`}
            >
              {t.label}
              {t.value === 'pending' && pendingCount != null && pendingCount > 0 && ` (${pendingCount})`}
            </button>
          ))}
        </div>

        {loading ? (
          <LoadingCard />
        ) : requests.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={status === 'pending' ? 'Няма чакащи заявки' : 'Няма заявки в тази категория'}
            description="Заявките от публичната ви страница за резервации ще се появят тук."
            action={
              <Link to="/properties">
                <Button variant="secondary">
                  <Building2 className="h-4 w-4" />
                  Към имотите
                </Button>
              </Link>
            }
          />
        ) : (
          <div className="space-y-3">
            {requests.map((req) => (
              <Card key={req.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-ink">{req.guest_name}</p>
                      <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[req.status]}`}>
                        {STATUS_LABELS[req.status]}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-ink-soft">
                      {properties[req.property_id] ?? '—'} · {formatDateBG(req.check_in)} – {formatDateBG(req.check_out)}
                      {' · '}
                      <span className="inline-flex items-center gap-1 align-middle">
                        <Users className="h-3.5 w-3.5" />
                        {req.num_guests}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-ink-muted">
                      {req.guest_phone && <span>{req.guest_phone} </span>}
                      {req.guest_email && <span>{req.guest_email}</span>}
                    </p>
                    {req.message && (
                      <p className="mt-2 rounded-lg bg-sunken px-3 py-2 text-sm text-ink-soft">{req.message}</p>
                    )}
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-lg font-bold text-ink">{formatMoney(req.quoted_total ?? 0)}</p>
                    <p className="text-xs text-ink-muted">капаро {formatMoney(req.quoted_deposit ?? 0)}</p>
                  </div>
                </div>

                {req.status === 'pending' && (
                  <div className="mt-4 flex gap-3 border-t border-line pt-4">
                    <Button
                      variant="secondary"
                      onClick={() => handleDecline(req)}
                      loading={actingId === req.id}
                      className="!py-2"
                    >
                      <X className="h-4 w-4" />
                      Откажи
                    </Button>
                    <Button onClick={() => handleAccept(req)} loading={actingId === req.id} className="!py-2">
                      <Check className="h-4 w-4" />
                      Приеми
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
