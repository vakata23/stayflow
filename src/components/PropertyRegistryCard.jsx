import { useEffect, useState } from 'react'
import { Card, Field, Input, Select, Switch, Button, Alert, Spinner } from './ui'
import { registryAvailable, loadRegistry, saveRegistry } from '../lib/registry'
import { REGISTRY_KINDS, validateRegistry, athensZoneWarning, ATHENS_FROZEN_UNTIL, dmy } from '../lib/declarationLogic'

/**
 * „Регистрация в Гърция“ — номерът на имота (AMA или лицензионен номер) и ATAK.
 * Включва и Гърция за имота: тогава резервациите му получават данни за декларация, а номерът се показва на страницата за гости.
 * Картата се вижда само ако миграция 017 е пусната.
 */
export default function PropertyRegistryCard({ property }) {
  const [available, setAvailable] = useState(null)
  const [values, setValues] = useState({ country: 'BG', kind: 'ama', number: '', atak: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    let cancelled = false
    registryAvailable().then(async (ok) => {
      if (cancelled) return
      setAvailable(ok)
      if (!ok) return setLoading(false)
      const row = await loadRegistry(property.id)
      if (cancelled) return
      if (row) setValues({ country: row.country, kind: row.kind, number: row.number ?? '', atak: row.atak ?? '' })
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [property.id])

  if (available === false) return null

  const greek = values.country === 'GR'
  const set = (key) => (e) => {
    setSuccess(false)
    setValues((v) => ({ ...v, [key]: e.target.value }))
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    const problem = greek ? validateRegistry(values) : null
    if (problem) return setError(problem)
    setSaving(true)
    try {
      await saveRegistry(property.id, values)
      setSuccess(true)
    } catch (err) {
      setError('Неуспешно записване: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const missingNumber = greek && !values.number.trim()

  return (
    <Card className="p-6">
      <h2 className="type-heading">Регистрация в Гърция</h2>
      <p className="mt-1 text-xs text-ink-muted">
        В Гърция всеки имот за краткосрочен наем има номер в регистъра на данъчната служба AADE. Номерът трябва да е във всяка обява и на собствения сайт.
      </p>

      {loading ? (
        <Spinner />
      ) : (
        <form onSubmit={handleSave} className="mt-5 space-y-5">
          {error && <Alert>{error}</Alert>}
          {success && <Alert kind="success">Данните са записани.</Alert>}

          <Switch
            label="Този имот е в Гърция"
            checked={greek}
            onChange={(e) => {
              setSuccess(false)
              setValues((v) => ({ ...v, country: e.target.checked ? 'GR' : 'BG' }))
            }}
          />

          {greek && (
            <>
              <div className="grid gap-5 sm:grid-cols-3">
                <Field label="Вид номер">
                  <Select value={values.kind} onChange={set('kind')}>
                    {REGISTRY_KINDS.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={values.kind === 'ama' ? 'AMA на имота' : 'Номер на обекта'} hint="Показва се на страницата за гости.">
                  <Input value={values.number} onChange={set('number')} placeholder="00000000000" maxLength={40} autoComplete="off" />
                </Field>
                <Field label="ATAK" hint="Номерът на имота в кадастъра. Нужен е за AMA в myAADE.">
                  <Input value={values.atak} onChange={set('atak')} placeholder="12345678" maxLength={40} autoComplete="off" />
                </Field>
              </div>

              {missingNumber && (
                <Alert kind="warning">
                  Липсва номер на имота. Без него обявите в Airbnb и Booking могат да бъдат свалени, а страницата за гости няма да показва номер.
                </Alert>
              )}
              {missingNumber && athensZoneWarning(property.city, property.address) && (
                <Alert kind="info">
                  {`Нови регистрации в част от центъра на Атина (Плака, Колонаки, Куказки, Ексархия, Пагрити) са спрени до ${dmy(ATHENS_FROZEN_UNTIL)}. Ако имотът е там и още няма AMA, проверете със счетоводител дали може да се регистрира.`}
                </Alert>
              )}
              {!missingNumber && !property.is_listed && (
                <p className="text-xs text-ink-muted">Номерът ще се показва на страницата за гости, когато имотът е публикуван.</p>
              )}
              <p className="text-xs text-ink-muted">
                Резервациите на този имот получават секция „Данни за декларацията“, а менюто — екран „Декларации“. StayFlow следи срока (до 20-о число на следващия месец) и подготвя данните. Подава се в myAADE.
              </p>
            </>
          )}

          <div className="flex justify-end">
            <Button type="submit" loading={saving}>
              Запази
            </Button>
          </div>
        </form>
      )}
    </Card>
  )
}
