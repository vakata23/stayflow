import { useEffect, useRef, useState } from 'react'
import { Paperclip, X } from 'lucide-react'
import { todayISO } from '../lib/dates'
import {
  categoriesFor,
  createMoneyEntry,
  updateMoneyEntry,
  uploadReceiptImage,
  removeReceiptImage,
  signedReceiptUrl,
} from '../lib/moneyEntries'
import { Field, Input, Textarea, Select, Button, Alert } from './ui'

const empty = { amount: '', entry_date: todayISO(), category: '', property_id: '', note: '' }

export default function MoneyEntryModal({ open, onClose, onSaved, kind, properties, profileId, userId, initial }) {
  const [values, setValues] = useState(empty)
  const [receiptFile, setReceiptFile] = useState(null)
  const [existingReceiptPath, setExistingReceiptPath] = useState(null)
  const [existingReceiptUrl, setExistingReceiptUrl] = useState(null)
  const [removeExisting, setRemoveExisting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const fileRef = useRef(null)

  const isEdit = Boolean(initial?.id)
  const categories = categoriesFor(kind)
  const title = isEdit
    ? kind === 'income'
      ? 'Редакция на приход'
      : 'Редакция на разход'
    : kind === 'income'
      ? 'Нов приход'
      : 'Нов разход'

  useEffect(() => {
    if (!open) return
    setError(null)
    setReceiptFile(null)
    setRemoveExisting(false)
    if (fileRef.current) fileRef.current.value = ''
    setValues({
      amount: initial?.amount ?? '',
      entry_date: initial?.entry_date ?? todayISO(),
      category: initial?.category ?? '',
      property_id: initial?.property_id ?? '',
      note: initial?.note ?? '',
    })
    setExistingReceiptPath(initial?.receipt_path ?? null)
    setExistingReceiptUrl(null)
    if (initial?.receipt_path) {
      signedReceiptUrl(initial.receipt_path).then(setExistingReceiptUrl)
    }
  }, [open, initial?.id])

  const set = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.value }))

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      setReceiptFile(file)
      setRemoveExisting(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    const amount = Number(values.amount)
    if (!(amount > 0)) return setError('Сумата трябва да е по-голяма от 0.')
    if (!values.entry_date) return setError('Изберете дата.')
    if (!values.category) return setError('Изберете категория.')

    setSaving(true)
    try {
      let receiptPath = existingReceiptPath
      if (removeExisting && !receiptFile) {
        if (existingReceiptPath) await removeReceiptImage(existingReceiptPath)
        receiptPath = null
      }
      if (receiptFile) {
        const newPath = await uploadReceiptImage(receiptFile, userId)
        if (existingReceiptPath) await removeReceiptImage(existingReceiptPath)
        receiptPath = newPath
      }

      const payload = {
        profile_id: profileId,
        property_id: values.property_id || null,
        kind,
        category: values.category,
        amount,
        entry_date: values.entry_date,
        note: values.note.trim() || null,
        receipt_path: receiptPath,
      }

      if (isEdit) await updateMoneyEntry(initial.id, payload)
      else await createMoneyEntry(payload)

      onSaved()
      onClose()
    } catch (err) {
      setError('Неуспешно записване: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <div className="fixed inset-0 bg-ink/40" onClick={onClose} />

      <div className="relative w-full max-w-lg rounded-2xl border border-line bg-card shadow-xl">
        <header className="border-b border-line px-6 py-4">
          <h2 className="text-lg font-bold">{title}</h2>
        </header>

        <form onSubmit={handleSubmit} className="space-y-5 px-6 py-5">
          {error && <Alert>{error}</Alert>}

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Сума (€)" required>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                inputMode="decimal"
                value={values.amount}
                onChange={set('amount')}
                placeholder="50.00"
              />
            </Field>
            <Field label="Дата" required>
              <Input type="date" value={values.entry_date} onChange={set('entry_date')} />
            </Field>
          </div>

          <Field label="Категория" required>
            <Select value={values.category} onChange={set('category')}>
              <option value="">— Изберете —</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Имот" hint="„Всички имоти“ за общи разходи (напр. счетоводство, реклама).">
            <Select value={values.property_id} onChange={set('property_id')}>
              <option value="">Всички имоти</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Бележка">
            <Textarea rows={2} value={values.note} onChange={set('note')} placeholder="По избор…" />
          </Field>

          <Field label="Снимка на касова бележка" hint="По избор, до 5 MB.">
            {existingReceiptPath && !removeExisting && !receiptFile ? (
              <div className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                <Paperclip className="h-4 w-4 shrink-0 text-ink-muted" />
                {existingReceiptUrl ? (
                  <a href={existingReceiptUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                    Преглед на бележката
                  </a>
                ) : (
                  <span className="text-ink-soft">Прикачена бележка</span>
                )}
                <button
                  type="button"
                  onClick={() => setRemoveExisting(true)}
                  className="ml-auto rounded-lg p-1 text-ink-muted hover:bg-danger-soft hover:text-danger"
                  aria-label="Премахни"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={handleFile}
                className="block w-full text-sm text-ink-soft file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-accent-soft file:px-4 file:py-2 file:text-sm file:font-semibold file:text-accent-ink hover:file:bg-accent-soft"
              />
            )}
          </Field>

          <div className="flex justify-end gap-3 border-t border-line pt-5">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
              Отказ
            </Button>
            <Button type="submit" loading={saving}>
              {isEdit ? 'Запази' : 'Добави'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
