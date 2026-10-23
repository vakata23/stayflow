import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarRange } from 'lucide-react'
import { Card, Alert, Button, Spinner } from './ui'
import SeasonEditor from './SeasonEditor'
import { seasonsAvailable, loadSeasons, saveSeasons } from '../lib/seasons'
import { fetchPropertySettings } from '../lib/propertySettings'
import { validateSeason } from '../lib/seasonLogic'

const signature = (list) => JSON.stringify(list.map(({ id, name, start_month, start_day, end_month, end_day, price_per_night, min_nights }) => [id, name, +start_month, +start_day, +end_month, +end_day, +price_per_night, +min_nights]))

/**
 * „Сезонни цени“ на имота: цени по периоди, които се повтарят всяка година (ноември–март една цена, юни–септември друга…).
 * Показва се само когато базата вече има таблицата (миграция 014); дотогава не прави нищо и не се вижда.
 */
export default function SeasonPrices({ propertyId }) {
  const [available, setAvailable] = useState(null)
  const [loading, setLoading] = useState(true)
  const [original, setOriginal] = useState([])
  const [drafts, setDrafts] = useState([])
  const [basePrice, setBasePrice] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const [showErrors, setShowErrors] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const ok = await seasonsAvailable()
      if (cancelled) return
      setAvailable(ok)
      if (!ok) return setLoading(false)
      try {
        const [rows, settings] = await Promise.all([loadSeasons(propertyId), fetchPropertySettings(propertyId)])
        if (cancelled) return
        setOriginal(rows)
        setDrafts(rows)
        setBasePrice(Number(settings.base_price) || 0)
      } catch (err) {
        if (!cancelled) setError('Неуспешно зареждане на сезоните: ' + err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [propertyId])

  const dirty = useMemo(() => signature(drafts) !== signature(original), [drafts, original])

  if (!available) return null

  const change = (next) => {
    setDrafts(next)
    setSuccess(false)
  }

  const handleSave = async () => {
    setError(null)
    setSuccess(false)
    if (drafts.some((d) => validateSeason(d))) {
      setShowErrors(true)
      return setError('Поправете отбелязаните сезони, за да запишете.')
    }
    setSaving(true)
    try {
      const fresh = await saveSeasons(propertyId, drafts, original)
      setOriginal(fresh)
      setDrafts(fresh)
      setShowErrors(false)
      setSuccess(true)
    } catch (err) {
      setError('Неуспешно записване: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="p-6" as="section" aria-labelledby="season-prices-title">
      <h2 id="season-prices-title" className="type-heading">
        Сезонни цени
      </h2>
      <p className="mt-1 text-xs text-ink-muted">
        Различна цена на нощувка за различни периоди — задава се веднъж и важи всяка година. Основната цена (в „Настройки на имота“) е
        за всички останали дати. За конкретни дати (празници, събития) ползвайте{' '}
        <Link to="/pricing" className="font-semibold text-accent">
          <CalendarRange className="mr-0.5 inline h-3 w-3" aria-hidden="true" />
          Ценови планове
        </Link>{' '}
        — те имат предимство пред сезона.
      </p>

      {loading ? (
        <Spinner />
      ) : (
        <div className="mt-5 space-y-5">
          {error && <Alert>{error}</Alert>}
          {success && <Alert kind="success">Сезоните са записани.</Alert>}
          <SeasonEditor seasons={drafts} onChange={change} basePrice={basePrice} showErrors={showErrors} disabled={saving} />
          <div className="flex items-center gap-3 border-t border-line pt-5">
            <Button type="button" onClick={handleSave} loading={saving} disabled={!dirty}>
              Запази сезоните
            </Button>
            {dirty && <span className="text-xs text-ink-muted">Има незаписани промени.</span>}
          </div>
        </div>
      )}
    </Card>
  )
}
