import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { todayISO } from '../../lib/dates'
import { TASK_STATUSES } from '../../lib/cleaning'
import { Field, Input, Textarea, Select, Button, Alert } from '../../components/ui'

const empty = {
  property_id: '',
  due_date: todayISO(),
  assigned_to: '',
  status: 'pending',
  notes: '',
  booking_id: '',
}

export default function TaskFormModal({ open, onClose, onSaved, properties, initial }) {
  const [values, setValues] = useState(empty)
  const [checkouts, setCheckouts] = useState([])
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const isEdit = Boolean(initial?.id)

  useEffect(() => {
    if (!open) return
    setError(null)
    setValues({
      ...empty,
      property_id: properties[0]?.id ?? '',
      ...(initial
        ? {
            property_id: initial.property_id,
            due_date: initial.due_date,
            assigned_to: initial.assigned_to ?? '',
            status: initial.status,
            notes: initial.notes ?? '',
            booking_id: initial.booking_id ?? '',
          }
        : {}),
    })
  }, [open, initial?.id])

  // Предлага дати за напускане от предстоящите резервации на избрания имот,
  // за да може задачата да се закачи за конкретно освобождаване.
  useEffect(() => {
    if (!open || !values.property_id) {
      setCheckouts([])
      return
    }
    let cancelled = false
    supabase
      .from('bookings')
      .select('id, guest_name, check_out')
      .eq('property_id', values.property_id)
      .neq('status', 'cancelled')
      .gte('check_out', todayISO())
      .order('check_out')
      .limit(20)
      .then(({ data }) => {
        if (!cancelled) setCheckouts(data ?? [])
      })
    return () => {
      cancelled = true
    }
  }, [open, values.property_id])

  if (!open) return null

  const set = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.value }))

  // Избор на резервация → автоматично попълва датата с деня на напускане.
  const onPickBooking = (e) => {
    const bookingId = e.target.value
    const booking = checkouts.find((b) => b.id === bookingId)
    setValues((v) => ({
      ...v,
      booking_id: bookingId,
      due_date: booking ? booking.check_out : v.due_date,
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (!values.property_id) return setError('Изберете имот.')
    if (!values.due_date) return setError('Изберете дата.')

    setSaving(true)
    const payload = {
      property_id: values.property_id,
      due_date: values.due_date,
      assigned_to: values.assigned_to.trim() || null,
      status: values.status,
      notes: values.notes.trim() || null,
      booking_id: values.booking_id || null,
    }

    const { error } = isEdit
      ? await supabase.from('cleaning_tasks').update(payload).eq('id', initial.id)
      : await supabase.from('cleaning_tasks').insert(payload)

    setSaving(false)
    if (error) return setError('Неуспешно записване: ' + error.message)
    onSaved()
    onClose()
  }

  const handleDelete = async () => {
    setDeleting(true)
    const { error } = await supabase.from('cleaning_tasks').delete().eq('id', initial.id)
    setDeleting(false)
    if (error) return setError('Неуспешно изтриване: ' + error.message)
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <div className="fixed inset-0 bg-ink/40" onClick={onClose} />

      <div className="relative w-full max-w-lg rounded-2xl border border-line bg-card shadow-xl">
        <header className="border-b border-line px-6 py-4">
          <h2 className="text-lg font-bold">{isEdit ? 'Редакция на задача' : 'Нова задача'}</h2>
        </header>

        <form onSubmit={handleSubmit} className="space-y-5 px-6 py-5">
          {error && <Alert>{error}</Alert>}

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

          {checkouts.length > 0 && (
            <Field
              label="Свържи с напускане"
              hint="По избор — попълва датата от резервацията."
            >
              <Select value={values.booking_id} onChange={onPickBooking}>
                <option value="">— Без връзка —</option>
                {checkouts.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.guest_name} · напуска {b.check_out}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Дата" required>
              <Input type="date" value={values.due_date} onChange={set('due_date')} />
            </Field>
            <Field label="Статус">
              <Select value={values.status} onChange={set('status')}>
                {TASK_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Възложена на" hint="Име на камериерката.">
            <Input value={values.assigned_to} onChange={set('assigned_to')} placeholder="напр. Даниела" />
          </Field>

          <Field label="Бележки">
            <Textarea rows={3} value={values.notes} onChange={set('notes')} placeholder="Смяна на спално бельо, проверка на минибар…" />
          </Field>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
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
                {isEdit ? 'Запази' : 'Създай задача'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
