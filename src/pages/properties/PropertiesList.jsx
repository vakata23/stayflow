import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, Plus, Users, MapPin, CalendarCheck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { propertyTypeLabel } from '../../lib/constants'
import { PageHeader, Card, EmptyState, Spinner, Button, Alert } from '../../components/ui'

function PropertyCard({ property, activeBookings }) {
  return (
    <Link
      to={`/properties/${property.id}`}
      className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:border-brand-300 hover:shadow-md"
    >
      <div className="h-40 overflow-hidden bg-slate-100">
        {property.cover_image_url ? (
          <img
            src={property.cover_image_url}
            alt={property.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Building2 className="h-9 w-9 text-slate-300" />
          </div>
        )}
      </div>
      <div className="p-5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold leading-tight text-slate-900 group-hover:text-brand-700">
            {property.name}
          </h3>
          <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
            {propertyTypeLabel(property.property_type)}
          </span>
        </div>

        {(property.address || property.city) && (
          <p className="mt-1.5 flex items-start gap-1.5 text-sm text-slate-500">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="line-clamp-2">
              {[property.address, property.city].filter(Boolean).join(', ')}
            </span>
          </p>
        )}

        <div className="mt-4 flex items-center gap-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            до {property.max_guests} гости
          </span>
          <span className="flex items-center gap-1.5">
            <CalendarCheck className="h-3.5 w-3.5" />
            {activeBookings} активни резервации
          </span>
        </div>
      </div>
    </Link>
  )
}

export default function PropertiesList() {
  const [properties, setProperties] = useState([])
  const [bookingCounts, setBookingCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Не зависи от профила — RLS вече ограничава резултата до имотите
  // на текущия потребител.
  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      const { data, error } = await supabase
        .from('properties')
        .select('*')
        .order('created_at', { ascending: false })

      if (cancelled) return
      if (error) {
        setError('Неуспешно зареждане на имотите: ' + error.message)
        setLoading(false)
        return
      }
      setProperties(data ?? [])

      // Брой активни (потвърдени, незавършили) резервации по имот.
      const today = new Date().toISOString().slice(0, 10)
      const { data: bookings } = await supabase
        .from('bookings')
        .select('property_id')
        .eq('status', 'confirmed')
        .gte('check_out', today)

      if (cancelled) return
      const counts = {}
      for (const b of bookings ?? []) {
        counts[b.property_id] = (counts[b.property_id] ?? 0) + 1
      }
      setBookingCounts(counts)
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div>
      <PageHeader
        icon={Building2}
        title="Поддръжка на имоти"
        description="Всички имоти, които управлявате."
        action={
          <Link to="/properties/new">
            <Button>
              <Plus className="h-4 w-4" />
              Добави имот
            </Button>
          </Link>
        }
      />

      <div className="mt-8">
        {error && <Alert>{error}</Alert>}

        {loading ? (
          <Card>
            <Spinner />
          </Card>
        ) : properties.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="Още нямате добавени имоти"
            description="Добавете първия си имот, за да започнете да управлявате резервации, почиствания и цени."
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
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {properties.map((p) => (
              <PropertyCard
                key={p.id}
                property={p}
                activeBookings={bookingCounts[p.id] ?? 0}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
