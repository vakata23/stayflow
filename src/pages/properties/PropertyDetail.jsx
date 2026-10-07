import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Building2, Trash2, CalendarDays, Sparkles } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { uploadPropertyImage } from '../../lib/storage'
import { PageHeader, Card, Spinner, Button, Alert, Modal, EmptyState } from '../../components/ui'
import IcalSync from '../../components/IcalSync'
import PropertySettingsCard from '../../components/PropertySettingsCard'
import PublicListingCard from '../../components/PublicListingCard'
import PropertyListingDetailsCard from '../../components/PropertyListingDetailsCard'
import PropertyPhotosManager from '../../components/PropertyPhotosManager'
import PropertyReviewsManager from '../../components/PropertyReviewsManager'
import PropertyForm from './PropertyForm'

function UpcomingBookings({ propertyId, reloadKey }) {
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const today = new Date().toISOString().slice(0, 10)

    supabase
      .from('bookings')
      .select('id, guest_name, check_in, check_out, status')
      .eq('property_id', propertyId)
      .neq('status', 'cancelled')
      .gte('check_out', today)
      .order('check_in', { ascending: true })
      .limit(5)
      .then(({ data }) => {
        if (cancelled) return
        setBookings(data ?? [])
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [propertyId, reloadKey])

  if (loading) return <Spinner />

  if (bookings.length === 0) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-sm text-slate-500">Няма предстоящи резервации за този имот.</p>
        <p className="mt-1 text-xs text-slate-400">
          Резервации ще можете да добавяте след Етап 4 (Календар и Резервации).
        </p>
      </div>
    )
  }

  return (
    <ul className="divide-y divide-slate-100">
      {bookings.map((b) => (
        <li key={b.id} className="flex items-center justify-between px-6 py-3.5 text-sm">
          <span className="font-medium text-slate-800">{b.guest_name}</span>
          <span className="text-slate-500">
            {b.check_in} → {b.check_out}
          </span>
        </li>
      ))}
    </ul>
  )
}

export default function PropertyDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [property, setProperty] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [bookingsKey, setBookingsKey] = useState(0)

  useEffect(() => {
    let cancelled = false

    supabase
      .from('properties')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setError('Неуспешно зареждане: ' + error.message)
        setProperty(data)
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [id])

  const handleSubmit = async (values, file) => {
    setSaving(true)
    setError(null)
    setSuccess(false)

    try {
      let coverUrl = values.cover_image_url || null
      if (file) coverUrl = await uploadPropertyImage(file, user.id)

      const { error } = await supabase
        .from('properties')
        .update({ ...values, cover_image_url: coverUrl })
        .eq('id', id)

      if (error) throw error
      setProperty((p) => ({ ...p, ...values, cover_image_url: coverUrl }))
      setSuccess(true)
    } catch (err) {
      setError('Неуспешно записване: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    const { error } = await supabase.from('properties').delete().eq('id', id)
    if (error) {
      setError('Неуспешно изтриване: ' + error.message)
      setDeleting(false)
      setConfirmOpen(false)
      return
    }
    navigate('/properties')
  }

  if (loading) return <Spinner />

  if (!property) {
    return (
      <EmptyState
        icon={Building2}
        title="Имотът не е намерен"
        description="Възможно е да е изтрит или да нямате достъп до него."
        action={
          <Link to="/properties">
            <Button variant="secondary">Към всички имоти</Button>
          </Link>
        }
      />
    )
  }

  return (
    <div>
      <Link
        to="/properties"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Всички имоти
      </Link>

      <PageHeader
        icon={Building2}
        title={property.name}
        description="Редакция на данните за имота."
        action={
          <div className="flex flex-wrap gap-2">
            <Link to={`/properties/${id}/setup`}>
              <Button variant="secondary">
                <Sparkles className="h-4 w-4" />
                Страница за гости
              </Button>
            </Link>
            <Button variant="danger" onClick={() => setConfirmOpen(true)}>
              <Trash2 className="h-4 w-4" />
              Изтрий
            </Button>
          </div>
        }
      />

      <div className="mt-8 space-y-6">
        {success && <Alert kind="success">Промените са записани.</Alert>}

        <PropertyForm
          initial={property}
          onSubmit={handleSubmit}
          submitLabel="Запази промените"
          saving={saving}
          error={error}
        />

        <PropertySettingsCard
          property={property}
          onSaved={(channels) => setProperty((p) => ({ ...p, channels }))}
        />

        <PublicListingCard
          property={property}
          onSaved={(patch) => setProperty((p) => ({ ...p, ...patch }))}
        />

        <PropertyPhotosManager
          property={property}
          userId={user?.id}
          onCoverChanged={(coverUrl) => setProperty((p) => ({ ...p, cover_image_url: coverUrl }))}
        />

        <PropertyListingDetailsCard
          property={property}
          onSaved={(patch) => setProperty((p) => ({ ...p, ...patch }))}
        />

        <PropertyReviewsManager propertyId={property.id} />

        <IcalSync
          property={property}
          onBookingsChanged={() => setBookingsKey((k) => k + 1)}
        />

        <Card>
          <header className="flex items-center gap-2 border-b border-slate-100 px-6 py-4">
            <CalendarDays className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
              Предстоящи резервации
            </h2>
          </header>
          <UpcomingBookings propertyId={id} reloadKey={bookingsKey} />
        </Card>
      </div>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Изтриване на имот">
        <p className="text-sm leading-relaxed text-slate-600">
          Сигурни ли сте, че искате да изтриете <strong>{property.name}</strong>? Заедно с имота
          ще бъдат изтрити всички свързани резервации, ценови правила, камериерски задачи и
          забележки. Действието е необратимо.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setConfirmOpen(false)} disabled={deleting}>
            Отказ
          </Button>
          <Button variant="dangerSolid" onClick={handleDelete} loading={deleting}>
            Изтрий имота
          </Button>
        </div>
      </Modal>
    </div>
  )
}
