import { useEffect, useState } from 'react'
import { Star, Trash2, MessageSquareQuote } from 'lucide-react'
import { fetchReviews, createReview, deleteReview } from '../lib/reviews'
import { formatDateBG, todayISO } from '../lib/dates'
import { Card, Field, Input, Textarea, Select, Button, Alert } from './ui'

const empty = { guest_name: '', rating: '5', comment: '', stayed_on: '' }

export default function PropertyReviewsManager({ propertyId }) {
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [values, setValues] = useState(empty)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      setReviews(await fetchReviews(propertyId))
    } catch (err) {
      setError('Неуспешно зареждане: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [propertyId])

  const set = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.value }))

  const handleAdd = async (e) => {
    e.preventDefault()
    setError(null)
    if (!values.guest_name.trim()) return setError('Името на госта е задължително.')
    if (!values.comment.trim()) return setError('Текстът на отзива е задължителен.')

    setSaving(true)
    try {
      await createReview({
        property_id: propertyId,
        guest_name: values.guest_name.trim(),
        rating: Number(values.rating),
        comment: values.comment.trim(),
        stayed_on: values.stayed_on || null,
      })
      setValues(empty)
      await load()
    } catch (err) {
      setError('Неуспешно записване: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    await deleteReview(id)
    setReviews((r) => r.filter((x) => x.id !== id))
  }

  return (
    <Card className="p-6">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-slate-700">
        <MessageSquareQuote className="h-4 w-4 text-slate-400" />
        Отзиви
      </h2>
      <p className="mt-1 text-xs text-slate-400">
        Въведете само реални отзиви от действителни гости — те се показват на публичната страница.
      </p>

      {!loading && reviews.length > 0 && (
        <ul className="mt-4 space-y-3">
          {reviews.map((r) => (
            <li key={r.id} className="rounded-xl bg-slate-50 p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-slate-900">{r.guest_name}</span>
                    <span className="flex items-center text-amber-500">
                      {Array.from({ length: r.rating }).map((_, i) => (
                        <Star key={i} className="h-3.5 w-3.5 fill-amber-500" />
                      ))}
                    </span>
                  </div>
                  {r.stayed_on && <p className="text-xs text-slate-400">Престой: {formatDateBG(r.stayed_on)}</p>}
                  <p className="mt-1.5 text-sm text-slate-600">{r.comment}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(r.id)}
                  className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  aria-label="Изтрий"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="mt-5 space-y-4 border-t border-slate-100 pt-5">
        {error && <Alert>{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Име на госта" required>
            <Input value={values.guest_name} onChange={set('guest_name')} placeholder="Мария К." />
          </Field>
          <Field label="Оценка">
            <Select value={values.rating} onChange={set('rating')}>
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {n} ★
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Дата на престоя">
            <Input type="date" value={values.stayed_on} onChange={set('stayed_on')} max={todayISO()} />
          </Field>
        </div>
        <Field label="Текст на отзива" required>
          <Textarea rows={2} value={values.comment} onChange={set('comment')} placeholder="Невероятен изглед към морето!" />
        </Field>
        <div className="flex justify-end">
          <Button type="submit" loading={saving}>
            Добави отзив
          </Button>
        </div>
      </form>
    </Card>
  )
}
