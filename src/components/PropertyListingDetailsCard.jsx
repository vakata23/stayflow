import { useState } from 'react'
import { Home, MapPin, LocateFixed } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { AMENITIES, CANCELLATION_POLICIES } from '../lib/amenities'
import { Card, Field, Input, Select, Button, Alert } from './ui'
import LocationMap from './LocationMap'

export default function PropertyListingDetailsCard({ property, onSaved }) {
  const [bedrooms, setBedrooms] = useState(property.bedrooms ?? 1)
  const [beds, setBeds] = useState(property.beds ?? 1)
  const [bathrooms, setBathrooms] = useState(property.bathrooms ?? 1)
  const [areaM2, setAreaM2] = useState(property.area_m2 ?? '')
  const [amenities, setAmenities] = useState(property.amenities ?? [])
  const [checkinTime, setCheckinTime] = useState(property.checkin_time ?? '14:00')
  const [checkoutTime, setCheckoutTime] = useState(property.checkout_time ?? '11:00')
  const [smokingAllowed, setSmokingAllowed] = useState(property.smoking_allowed ?? false)
  const [partiesAllowed, setPartiesAllowed] = useState(property.parties_allowed ?? false)
  const [cancellationPolicy, setCancellationPolicy] = useState(property.cancellation_policy ?? 'moderate')
  const [lat, setLat] = useState(property.lat ?? '')
  const [lng, setLng] = useState(property.lng ?? '')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const [locating, setLocating] = useState(false)

  const toggleAmenity = (key) => {
    setAmenities((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  const useMyLocation = () => {
    if (!navigator.geolocation) return setError('Браузърът не поддържа геолокация.')
    setLocating(true)
    setError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6))
        setLng(pos.coords.longitude.toFixed(6))
        setLocating(false)
      },
      (err) => {
        setError('Неуспешно засичане на местоположението: ' + err.message)
        setLocating(false)
      }
    )
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    const payload = {
      bedrooms: Number(bedrooms) || 0,
      beds: Number(beds) || 0,
      bathrooms: Number(bathrooms) || 0,
      area_m2: areaM2 === '' ? null : Number(areaM2),
      amenities,
      checkin_time: checkinTime,
      checkout_time: checkoutTime,
      smoking_allowed: smokingAllowed,
      parties_allowed: partiesAllowed,
      cancellation_policy: cancellationPolicy,
      lat: lat === '' ? null : Number(lat),
      lng: lng === '' ? null : Number(lng),
    }

    setSaving(true)
    const { error } = await supabase.from('properties').update(payload).eq('id', property.id)
    setSaving(false)

    if (error) return setError('Неуспешно записване: ' + error.message)
    setSuccess(true)
    onSaved?.(payload)
  }

  return (
    <Card className="p-6">
      <h2 className="flex items-center gap-2 type-heading">
        <Home className="h-4 w-4 text-ink-muted" />
        Детайли за гостите
      </h2>
      <p className="mt-1 text-xs text-ink-muted">
        Стаи, удобства и правила — показват се на публичната страница за резервации.
      </p>

      <form onSubmit={handleSave} className="mt-5 space-y-6">
        {error && <Alert>{error}</Alert>}
        {success && <Alert kind="success">Записано.</Alert>}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Спални">
            <Input type="number" min={0} value={bedrooms} onChange={(e) => setBedrooms(e.target.value)} />
          </Field>
          <Field label="Легла">
            <Input type="number" min={0} value={beds} onChange={(e) => setBeds(e.target.value)} />
          </Field>
          <Field label="Бани">
            <Input type="number" min={0} step="0.5" value={bathrooms} onChange={(e) => setBathrooms(e.target.value)} />
          </Field>
          <Field label="Кв.м" hint="По избор">
            <Input type="number" min={0} step="0.1" value={areaM2} onChange={(e) => setAreaM2(e.target.value)} />
          </Field>
        </div>

        <div>
          <p className="mb-2.5 text-sm font-medium text-ink">Удобства</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            {AMENITIES.map((a) => (
              <label key={a.key} className="flex items-center gap-2 text-sm text-ink-soft">
                <input
                  type="checkbox"
                  checked={amenities.includes(a.key)}
                  onChange={() => toggleAmenity(a.key)}
                  className="h-4 w-4 rounded border-line-strong text-accent focus:ring-accent"
                />
                {a.label}
              </label>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Час на настаняване">
            <Input type="time" value={checkinTime} onChange={(e) => setCheckinTime(e.target.value)} />
          </Field>
          <Field label="Час на напускане">
            <Input type="time" value={checkoutTime} onChange={(e) => setCheckoutTime(e.target.value)} />
          </Field>
        </div>

        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <input
              type="checkbox"
              checked={smokingAllowed}
              onChange={(e) => setSmokingAllowed(e.target.checked)}
              className="h-4 w-4 rounded border-line-strong text-accent focus:ring-accent"
            />
            Пушенето е разрешено
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <input
              type="checkbox"
              checked={partiesAllowed}
              onChange={(e) => setPartiesAllowed(e.target.checked)}
              className="h-4 w-4 rounded border-line-strong text-accent focus:ring-accent"
            />
            Партита са разрешени
          </label>
        </div>

        <Field label="Политика на анулиране">
          <Select value={cancellationPolicy} onChange={(e) => setCancellationPolicy(e.target.value)}>
            {CANCELLATION_POLICIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-ink-muted">
            {CANCELLATION_POLICIES.find((p) => p.value === cancellationPolicy)?.hint}
          </p>
        </Field>

        <div>
          <div className="mb-2.5 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
              <MapPin className="h-4 w-4 text-ink-muted" />
              Приблизително местоположение
            </p>
            <Button type="button" variant="secondary" className="!py-1.5 !text-xs" onClick={useMyLocation} loading={locating}>
              <LocateFixed className="h-3.5 w-3.5" />
              Моето местоположение
            </Button>
          </div>
          <p className="mb-3 text-xs text-ink-muted">
            Гостите виждат само приблизителна зона (~300м размазване) — точният адрес се дава след потвърждение.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Ширина (lat)">
              <Input type="number" step="0.000001" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="43.214100" />
            </Field>
            <Field label="Дължина (lng)">
              <Input type="number" step="0.000001" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="27.914700" />
            </Field>
          </div>
          {lat !== '' && lng !== '' && (
            <div className="mt-3">
              <LocationMap lat={Number(lat)} lng={Number(lng)} showMarker height={200} />
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-line pt-5">
          <Button type="submit" loading={saving}>
            Запази
          </Button>
        </div>
      </form>
    </Card>
  )
}
