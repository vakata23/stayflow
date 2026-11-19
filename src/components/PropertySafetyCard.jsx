import { useEffect, useMemo, useState } from 'react'
import { Copy } from 'lucide-react'
import { Card, Checkbox, Field, Input, Button, Alert, Badge } from './ui'
import { loadRegistry } from '../lib/registry'
import { safetyAvailable, loadSafety, saveSafetyItems } from '../lib/safety'
import { SAFETY_ITEMS, summarize } from '../lib/safetyLogic'
import { EMERGENCY_TEXT, hasEmergencyInfo } from '../lib/messageTemplates'
import { todayISO } from '../lib/dates'

const TONE = { ok: 'success', expiring: 'warning', expired: 'danger', missing: 'neutral' }
const STATE_LABEL = { ok: 'Готово', expiring: 'Изтича скоро', expired: 'Изтекло', missing: 'Липсва' }

/**
 * „Безопасност“ — документите и оборудването, които гръцкият закон 5170/2025 изисква за имот за краткосрочен наем.
 * Показва се само за имот в Гърция и само ако миграция 018 е пусната. Файлове не се качват: тук се пазят срокът и бележка (номер на документа).
 */
export default function PropertySafetyCard({ property }) {
  const [state, setState] = useState('loading') // loading | hidden | ready
  const [rows, setRows] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const [copied, setCopied] = useState(false)
  const today = todayISO()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [reg, available] = await Promise.all([loadRegistry(property.id), safetyAvailable()])
      if (cancelled) return
      if (!available || reg?.country !== 'GR') return setState('hidden')
      const data = await loadSafety(property.id)
      if (cancelled) return
      setRows(Object.fromEntries(data.map((r) => [r.item_key, { done: r.done, expires_on: r.expires_on ?? '', note: r.note ?? '' }])))
      setState('ready')
    })()
    return () => {
      cancelled = true
    }
  }, [property.id])

  const asRows = useMemo(() => Object.entries(rows).map(([item_key, r]) => ({ item_key, ...r, expires_on: r.expires_on || null })), [rows])
  const summary = useMemo(() => summarize(asRows, today, property.house_rules ?? ''), [asRows, today, property.house_rules])

  if (state === 'hidden') return null
  if (state === 'loading') return null

  const patch = (key, change) => {
    setSuccess(false)
    setRows((r) => ({ ...r, [key]: { done: false, expires_on: '', note: '', ...r[key], ...change } }))
  }

  const save = async (e) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    setSaving(true)
    try {
      await saveSafetyItems(
        property.id,
        SAFETY_ITEMS.filter((d) => rows[d.key]).map((d) => ({ item_key: d.key, ...rows[d.key] }))
      )
      setSuccess(true)
    } catch (err) {
      setError('Неуспешно записване: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const copyEmergency = async () => {
    try {
      await navigator.clipboard.writeText(EMERGENCY_TEXT)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setError('Не успях да копирам. Маркирайте текста ръчно.')
    }
  }

  const emergencyAuto = hasEmergencyInfo(property.house_rules)

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="type-heading">Безопасност</h2>
        <p className="text-sm font-medium text-ink-soft">{`${summary.ready} от ${summary.total} готови`}</p>
      </div>
      <p className="mt-1 text-xs text-ink-muted">
        Закон 5170/2025 (от 1 октомври 2025) изисква тези документи и оборудване за имот за краткосрочен наем в Гърция. Проверките са на място. Отбележете какво имате и до кога важи.
      </p>

      <form onSubmit={save} className="mt-5 space-y-5">
        {error && <Alert>{error}</Alert>}
        {success && <Alert kind="success">Данните са записани.</Alert>}
        {summary.expired > 0 && <Alert kind="warning">Има изтекъл документ. Подновете го и обновете срока.</Alert>}

        <ul className="divide-y divide-line rounded-2xl border border-line">
          {summary.items.map(({ def, state: st, days }) => {
            const row = rows[def.key] ?? { done: false, expires_on: '', note: '' }
            const isEmergency = def.key === 'emergency'
            return (
              <li key={def.key} className="space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Checkbox
                    label={def.label}
                    checked={isEmergency && emergencyAuto ? true : row.done}
                    disabled={isEmergency && emergencyAuto}
                    onChange={(e) => patch(def.key, { done: e.target.checked })}
                  />
                  <Badge tone={TONE[st]}>{STATE_LABEL[st]}</Badge>
                </div>
                {def.expiry && row.done && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Важи до" hint={days != null ? (days < 0 ? 'Срокът е минал.' : days === 0 ? 'Изтича днес.' : days === 1 ? 'Остава 1 ден.' : `Остават ${days} дни.`) : undefined}>
                      <Input type="date" value={row.expires_on} onChange={(e) => patch(def.key, { expires_on: e.target.value })} />
                    </Field>
                    <Field label="Номер или бележка (по избор)">
                      <Input value={row.note} maxLength={200} onChange={(e) => patch(def.key, { note: e.target.value })} />
                    </Field>
                  </div>
                )}
                {isEmergency && (
                  <div className="space-y-2">
                    <p className="text-xs text-ink-muted">
                      {emergencyAuto
                        ? 'Правилата за гостите вече съдържат 112 — готово.'
                        : 'Сложете този текст в „Правила на къщата“ на имота. Така гостите го виждат в картата си.'}
                    </p>
                    {!emergencyAuto && (
                      <Button type="button" variant="secondary" size="sm" onClick={copyEmergency}>
                        <Copy className="h-4 w-4" aria-hidden="true" />
                        {copied ? 'Копирано' : 'Копирай текста за правилата'}
                      </Button>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>

        <div className="flex justify-end">
          <Button type="submit" loading={saving}>
            Запази
          </Button>
        </div>
      </form>
    </Card>
  )
}
