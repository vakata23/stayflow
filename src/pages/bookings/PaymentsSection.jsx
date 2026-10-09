import { useState, useEffect, useCallback } from 'react'
import { Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatDateBG } from '../../lib/dates'
import { formatMoney } from '../../lib/money'
import { PAYMENT_KINDS, PAYMENT_METHODS, paymentKindLabel, paymentMethodLabel } from '../../lib/bookings'
import { Field, Input, Select, Button, Alert, LoadingCard } from '../../components/ui'

export default function PaymentsSection({ bookingId }) {
  const [payments, setPayments] = useState([])
  const [balance, setBalance] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [adding, setAdding] = useState(false)

  const [kind, setKind] = useState('deposit')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('bank')

  const load = useCallback(async () => {
    setLoading(true)
    const [paymentsRes, balanceRes] = await Promise.all([
      supabase
        .from('payments')
        .select('*')
        .eq('booking_id', bookingId)
        .order('paid_at', { ascending: false }),
      supabase.from('booking_balances').select('due, paid, outstanding').eq('booking_id', bookingId).maybeSingle(),
    ])
    if (paymentsRes.error) setError('Неуспешно зареждане на плащанията: ' + paymentsRes.error.message)
    setPayments(paymentsRes.data ?? [])
    setBalance(balanceRes.data ?? null)
    setLoading(false)
  }, [bookingId])

  useEffect(() => {
    load()
  }, [load])

  // Полетата тук седят вложени в <form> на резервацията. Enter там иначе
  // би „изтекъл“ нагоре и би подал цялата форма (и затворил модала) —
  // прихващаме го тук, за да добавя плащането вместо това.
  const handleEnterKey = (e) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    handleAdd(e)
  }

  const handleAdd = async (e) => {
    e.preventDefault()
    setError(null)

    if (amount === '' || Number(amount) <= 0) return setError('Въведете валидна сума.')

    setAdding(true)
    const { error } = await supabase.from('payments').insert({
      booking_id: bookingId,
      kind,
      amount: Number(amount),
      method,
    })
    setAdding(false)

    if (error) return setError('Неуспешно записване: ' + error.message)
    setAmount('')
    load()
  }

  const handleDelete = async (id) => {
    const { error } = await supabase.from('payments').delete().eq('id', id)
    if (error) return setError('Неуспешно изтриване: ' + error.message)
    load()
  }

  const owes = balance && Number(balance.outstanding) > 0

  return (
    <section className="space-y-4 border-t border-line pt-7">
      <h3 className="type-heading">Плащания</h3>

      {error && <Alert>{error}</Alert>}

      {loading ? (
        <LoadingCard rows={2} className="!shadow-none bg-sunken/60" />
      ) : (
        <>
          {balance && (
            <dl className="grid grid-cols-3 gap-2 text-center sm:gap-3">
              <div className="rounded-2xl bg-sunken px-2 py-3">
                <dt className="text-xs text-ink-soft">Дължимо</dt>
                <dd className="num mt-0.5 font-display text-lg font-semibold">{formatMoney(balance.due)}</dd>
              </div>
              <div className="rounded-2xl bg-sunken px-2 py-3">
                <dt className="text-xs text-ink-soft">Платено</dt>
                <dd className="num mt-0.5 font-display text-lg font-semibold">{formatMoney(balance.paid)}</dd>
              </div>
              <div className={`rounded-2xl px-2 py-3 ${owes ? 'bg-warning-soft text-warning-ink' : 'bg-success-soft text-success-ink'}`}>
                <dt className="text-xs">Остатък</dt>
                <dd className="num mt-0.5 font-display text-lg font-semibold">{formatMoney(balance.outstanding)}</dd>
              </div>
            </dl>
          )}

          {payments.length > 0 && (
            <ul className="divide-y divide-line rounded-2xl bg-sunken/60 px-4">
              {payments.map((p) => (
                <li key={p.id} className="flex min-h-14 items-center justify-between gap-3 py-1.5 text-sm">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{paymentKindLabel(p.kind)}</p>
                    <p className="text-xs text-ink-muted">
                      {paymentMethodLabel(p.method)} · {formatDateBG(p.paid_at.slice(0, 10))}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="num font-semibold text-ink">
                      {p.kind === 'refund' ? '−' : ''}
                      {formatMoney(p.amount)}
                    </span>
                    <button type="button" onClick={() => handleDelete(p.id)} className="icon-btn text-ink-muted hover:text-danger" aria-label="Изтрий плащането">
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[1fr_1fr_7rem_auto]">
            <Field label="Вид">
              <Select value={kind} onChange={(e) => setKind(e.target.value)} onKeyDown={handleEnterKey}>
                {PAYMENT_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Метод">
              <Select value={method} onChange={(e) => setMethod(e.target.value)} onKeyDown={handleEnterKey}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Сума (€)">
              <Input
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onKeyDown={handleEnterKey}
                placeholder="0.00"
              />
            </Field>
            <Button type="button" variant="secondary" onClick={handleAdd} loading={adding} aria-label="Добави плащане" className="col-span-1 self-end">
              Добави
            </Button>
          </div>
        </>
      )}
    </section>
  )
}
