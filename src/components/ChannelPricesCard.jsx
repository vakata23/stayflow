import { useEffect, useMemo, useState } from 'react'
import { Percent } from 'lucide-react'
import { Card, Field, Input, Button, Alert, Spinner, Table, Th, Td } from './ui'
import { fetchPropertySettings } from '../lib/propertySettings'
import { loadSeasonRows } from '../lib/seasons'
import { seasonRangeLabel } from '../lib/seasonLogic'
import { appLocale } from '../i18n/appLang'
import { loadMarkups, saveMarkups } from '../lib/channelPrices'
import { channelRows, markupFromCommission, validMarkup } from '../lib/channelPricing'
import { formatMoney } from '../lib/money'

/**
 * „Цени по канал“ — каква да е цената в Airbnb и Booking, за да остане същото след комисионата, както при директна резервация.
 * Само справка: с iCal StayFlow обменя дати, не цени, затова цената в платформите се въвежда там. Картата се вижда само ако миграция 018 е пусната.
 */
export default function ChannelPricesCard({ propertyId }) {
  const [state, setState] = useState('loading') // loading | hidden | ready
  const [settings, setSettings] = useState(null)
  const [seasons, setSeasons] = useState([])
  const [airbnb, setAirbnb] = useState('0')
  const [booking, setBooking] = useState('0')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [m, s, rows] = await Promise.all([loadMarkups(propertyId), fetchPropertySettings(propertyId), loadSeasonRows([propertyId])])
        if (cancelled) return
        if (!m.available) return setState('hidden')
        setSettings(s)
        setSeasons(rows)
        setAirbnb(String(m.airbnb))
        setBooking(String(m.booking))
        setState('ready')
      } catch {
        if (!cancelled) setState('hidden')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [propertyId])

  const locale = appLocale()
  const rows = useMemo(
    () =>
      channelRows({
        basePrice: settings?.base_price,
        seasons: seasons.map((s) => ({ key: s.id, name: s.name, label: seasonRangeLabel(s, locale), price_per_night: s.price_per_night })),
        airbnbPct: validMarkup(airbnb) ? airbnb : 0,
        bookingPct: validMarkup(booking) ? booking : 0,
      }),
    [settings, seasons, airbnb, booking, locale]
  )

  if (state !== 'ready') return null

  const suggested = markupFromCommission(settings?.ota_commission_pct)

  const useSuggested = () => {
    setSuccess(false)
    setAirbnb(String(suggested))
    setBooking(String(suggested))
  }

  const save = async (e) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    if (!validMarkup(airbnb) || !validMarkup(booking)) return setError('Надбавката трябва да е число между 0 и 100.')
    setSaving(true)
    try {
      await saveMarkups(propertyId, { airbnb, booking })
      setSuccess(true)
    } catch (err) {
      setError('Неуспешно записване: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="p-6">
      <h2 className="type-heading">Цени по канал</h2>
      <p className="mt-1 text-xs text-ink-muted">
        Платформите удържат комисиона, затова там цената може да е малко по-висока, а директно — по-ниска. Това е справка: въведете цените в Airbnb и Booking ръчно, StayFlow не ги праща.
      </p>

      <form onSubmit={save} noValidate className="mt-5 space-y-5">
        {error && <Alert>{error}</Alert>}
        {success && <Alert kind="success">Надбавките са записани.</Alert>}

        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="Надбавка за Airbnb" hint="% върху директната цена">
            <div className="relative">
              <Input type="number" min={0} max={100} step="0.1" value={airbnb} onChange={(e) => (setSuccess(false), setAirbnb(e.target.value))} className="pr-8" />
              <Percent className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
            </div>
          </Field>
          <Field label="Надбавка за Booking" hint="% върху директната цена">
            <div className="relative">
              <Input type="number" min={0} max={100} step="0.1" value={booking} onChange={(e) => (setSuccess(false), setBooking(e.target.value))} className="pr-8" />
              <Percent className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
            </div>
          </Field>
          <div className="flex items-end">
            {suggested > 0 && (
              <Button type="button" variant="secondary" onClick={useSuggested}>
                {`Предложи от комисионата (+${String(suggested).replace('.', ',')}%)`}
              </Button>
            )}
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-ink-muted">Още няма цени. Задайте основна цена в „Настройки на имота“ или сезонни цени.</p>
        ) : (
          <Table label="Цени по канал">
            <thead>
              <tr>
                <Th>Период</Th>
                <Th numeric>Директно</Th>
                <Th numeric>Airbnb</Th>
                <Th numeric>Booking</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <Td>
                    {r.base ? (
                      'Останалите дати'
                    ) : r.name ? (
                      <>
                        <span translate="no">{r.name}</span>
                        {` · ${r.label}`}
                      </>
                    ) : (
                      r.label
                    )}
                  </Td>
                  <Td numeric>{formatMoney(r.direct).replace(/\.00 €$/, ' €')}</Td>
                  <Td numeric>{`${r.airbnb} €`}</Td>
                  <Td numeric>{`${r.booking} €`}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <p className="text-xs text-ink-muted">Цената е за нощувка, закръглена до цяло евро.</p>

        <div className="flex justify-end">
          <Button type="submit" loading={saving}>
            Запази
          </Button>
        </div>
      </form>
    </Card>
  )
}
