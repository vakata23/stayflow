import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { formatDateBG } from '../../lib/dates'
import { findOverlappingRule, formatPrice } from '../../lib/pricing'
import { Field, Input, Select, Button, Alert } from '../../components/ui'

const empty = {
  property_id: '',
  start_date: '',
  end_date: '',
  price_per_night: '',
  min_nights: 1,
}

export default function PricingRuleModal({ open, onClose, onSaved, properties, initial }) {
  const [values, setValues] = useState(empty)
  const [error, setError] = useState(null)
  const [warning, setWarning] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const isEdit = Boolean(initial?.id)

  useEffect(() => {
    if (!open) return
    setError(null)
    setWarning(null)
    setValues({
      ...empty,
      property_id: properties[0]?.id ?? '',
      ...(initial
        ? {
            property_id: initial.property_id,
            start_date: initial.start_date,
            end_date: initial.end_date,
            price_per_night: initial.price_per_night,
            min_nights: initial.min_nights,
          }
        : {}),
    })
  }, [open, initial?.id])

  if (!open) return null

  const set = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setWarning(null)

    if (!values.property_id) return setError('Изберете имот.')
    if (!values.start_date || !values.end_date) return setError('Попълнете двете дати.')
    if (values.end_date < values.start_date) {
      return setError('Крайната дата не може да е преди началната.')
    }
    if (values.price_per_night === '' || Number(values.price_per_night) < 0) {
      return setError('Въведете валидна цена на нощувка.')
    }
    if (Number(values.min_nights) < 1) return setError('Минималният престой е поне 1 нощувка.')

    setSaving(true)

    // Предупреждение (не блокиране): застъпване е позволено, по-новото правило печели.
    const overlap = await findOverlappingRule({
      propertyId: values.property_id,
      startDate: values.start_date,
      endDate: values.end_date,
      excludeId: initial?.id,
    })
    if (overlap && !warning) {
      setSaving(false)
      setWarning(
        `Този период се застъпва със съществуващо правило ` +
          `(${formatDateBG(overlap.start_date)} – ${formatDateBG(overlap.end_date)}, ${formatPrice(overlap.price_per_night)}). ` +
          `Ако запазите, за застъпените дни ще важи новото правило. Натиснете отново, за да продължите.`
      )
      return
    }

    const payload = {
      property_id: values.property_id,
      start_date: values.start_date,
      end_date: values.end_date,
      price_per_night: Number(values.price_per_night),
      min_nights: Number(values.min_nights),
    }

    const { error } = isEdit
      ? await supabase.from('pricing_rules').update(payload).eq('id', initial.id)
      : await supabase.from('pricing_rules').insert(payload)

    setSaving(false)
    if (error) return setError('Неуспешно записване: ' + error.message)
    onSaved()
    onClose()
  }

  const handleDelete = async () => {
    setDeleting(true)
    const { error } = await supabase.from('pricing_rules').delete().eq('id', initial.id)
    setDeleting(false)
    if (error) return setError('Неуспешно изтриване: ' + error.message)
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <div className="fixed inset-0 bg-slate-900/40" onClick={onClose} />

      <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl">
        <header className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-bold">
            {isEdit ? 'Редакция на ценово правило' : 'Ново ценово правило'}
          </h2>
        </header>

        <form onSubmit={handleSubmit} className="space-y-5 px-6 py-5">
          {error && <Alert>{error}</Alert>}
          {warning && <Alert kind="info">{warning}</Alert>}

          <Field label="Имот" required>
            <Select value={values.property_id} onChange={set('property_id')}>
              <option value="">— Изберете имот —</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="От дата" required>
              <Input type="date" value={values.start_date} onChange={set('start_date')} />
            </Field>
            <Field label="До дата" required>
              <Input
                type="date"
                value={values.end_date}
                onChange={set('end_date')}
                min={values.start_date}
              />
            </Field>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Цена на нощувка (лв.)" required>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={values.price_per_night}
                onChange={set('price_per_night')}
                placeholder="0.00"
              />
            </Field>
            <Field label="Минимален престой (нощувки)">
              <Input type="number" min={1} value={values.min_nights} onChange={set('min_nights')} />
            </Field>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
            <div>
              {isEdit && (
                <Button type="button" variant="danger" onClick={handleDelete} loading={deleting}>
                  Изтрий
                </Button>
              )}
            </div>
            <div className="flex gap-3">
              <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
                Отказ
              </Button>
              <Button type="submit" loading={saving}>
                {isEdit ? 'Запази' : warning ? 'Запази въпреки това' : 'Създай правило'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
