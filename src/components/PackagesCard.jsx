import { useEffect, useMemo, useState } from 'react'
import { Card, Alert, Button, Spinner } from './ui'
import PackagesEditor from './PackagesEditor'
import { packagesAvailable, loadPackages, savePackages } from '../lib/packages'
import { fetchPropertySettings } from '../lib/propertySettings'
import { loadSeasonRows } from '../lib/seasons'
import { lowestPrice } from '../lib/seasonLogic'
import { validatePackage, samePackage } from '../lib/packageLogic'

const changed = (drafts, original) =>
  drafts.length !== original.length || drafts.some((d) => !d.id || !original.find((o) => o.id === d.id) || !samePackage(d, original.find((o) => o.id === d.id)))

/**
 * „Пакети и оферти“ на имота: „6+1“, отстъпка за седмица/месец, фиксирана цена, ранно записване, последна минута.
 * Показва се само когато базата вече има таблицата (миграция 015); дотогава не се вижда.
 */
export default function PackagesCard({ propertyId }) {
  const [available, setAvailable] = useState(null)
  const [loading, setLoading] = useState(true)
  const [original, setOriginal] = useState([])
  const [drafts, setDrafts] = useState([])
  const [price, setPrice] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const [showErrors, setShowErrors] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const ok = await packagesAvailable()
      if (cancelled) return
      setAvailable(ok)
      if (!ok) return setLoading(false)
      try {
        const [rows, settings, seasons] = await Promise.all([loadPackages(propertyId), fetchPropertySettings(propertyId), loadSeasonRows([propertyId])])
        if (cancelled) return
        setOriginal(rows)
        setDrafts(rows)
        // за примера: основната цена, а ако няма — най-ниската от сезоните
        const base = Number(settings.base_price) || 0
        setPrice(base > 0 ? base : lowestPrice(0, seasons))
      } catch (err) {
        if (!cancelled) setError('Неуспешно зареждане на офертите: ' + err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [propertyId])

  const dirty = useMemo(() => changed(drafts, original), [drafts, original])

  if (!available) return null

  const change = (next) => {
    setDrafts(next)
    setSuccess(false)
  }

  const handleSave = async () => {
    setError(null)
    setSuccess(false)
    if (drafts.some((d) => validatePackage(d))) {
      setShowErrors(true)
      return setError('Поправете отбелязаните оферти, за да запишете.')
    }
    setSaving(true)
    try {
      const fresh = await savePackages(propertyId, drafts, original)
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
    <Card className="p-6" as="section" aria-labelledby="packages-title">
      <h2 id="packages-title" className="type-heading">
        Пакети и оферти
      </h2>
      <p className="mt-1 text-xs text-ink-muted">
        Специални условия за престой — например „6+1“ (платете 6 нощувки, останете 7), отстъпка за седмица или месец, фиксирана цена, ранно записване или
        последна минута. Гостът ги вижда на страницата на имота и цената му се смята автоматично.
      </p>

      {loading ? (
        <Spinner />
      ) : (
        <div className="mt-5 space-y-5">
          {error && <Alert>{error}</Alert>}
          {success && <Alert kind="success">Офертите са записани.</Alert>}
          <PackagesEditor packages={drafts} onChange={change} price={price} showErrors={showErrors} disabled={saving} />
          <div className="flex items-center gap-3 border-t border-line pt-5">
            <Button type="button" onClick={handleSave} loading={saving} disabled={!dirty}>
              Запази офертите
            </Button>
            {dirty && <span className="text-xs text-ink-muted">Има незаписани промени.</span>}
          </div>
        </div>
      )}
    </Card>
  )
}
