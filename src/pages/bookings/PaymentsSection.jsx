import { useState, useEffect, useCallback } from 'react'
import { Trash2, Wallet } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatDateBG } from '../../lib/dates'
import { formatMoney } from '../../lib/money'
import { PAYMENT_KINDS, PAYMENT_METHODS, paymentKindLabel, paymentMethodLabel } from '../../lib/bookings'
import { Field, Input, Select, Button, Alert, Spinner } from '../../components/ui'

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

  return (
    <div className="border-t border-line pt-5">
      <p className="mb-3 flex items-center gap-1.5 text-sm font-medium text-ink">
        <Wallet className="h-4 w-4 text-ink-muted" />
        Плащания
      </p>

      {error && (
        <div className="mb-3">
          <Alert>{error}</Alert>
        </div>
      )}

      {loading ? (
        <Spinner className="py-8" />
      ) : (
        <>
          {balance && (
            <div className="mb-3 flex flex-wrap gap-4 rounded-lg bg-sunken px-4 py-3 text-sm">
              <span>
                Дължимо: <strong>{formatMoney(balance.due)}</strong>
              </span>
              <span>
                Платено: <strong>{formatMoney(balance.paid)}</strong>
              </span>
              <span
                className={
                  Number(balance.outstanding) > 0
                    ? 'font-semibold text-warning-ink'
                    : 'font-semibold text-success-ink'
                }
              >
                Остатък: {formatMoney(balance.outstanding)}
              </span>
            </div>
          )}

          {payments.length > 0 && (
            <ul className="mb-3 divide-y divide-line rounded-lg border border-line">
              {payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium text-ink">{paymentKindLabel(p.kind)}</span>
                    <span className="ml-2 text-xs text-ink-muted">
                      {paymentMethodLabel(p.method)} · {formatDateBG(p.paid_at.slice(0, 10))}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-semibold text-ink">
                      {p.kind === 'refund' ? '−' : ''}
                      {formatMoney(p.amount)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDelete(p.id)}
                      className="rounded p-1 text-ink-muted hover:bg-danger-soft hover:text-danger"
                      aria-label="Изтрий плащането"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <Field label="Вид">
              <Select
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                onKeyDown={handleEnterKey}
                className="w-auto min-w-32"
              >
                {PAYMENT_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Сума (€)">
              <Input
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onKeyDown={handleEnterKey}
                placeholder="0.00"
                className="w-28"
              />
            </Field>
            <Field label="Метод">
              <Select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                onKeyDown={handleEnterKey}
                className="w-auto min-w-32"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="button" variant="secondary" onClick={handleAdd} loading={adding} className="!py-2">
              Добави плащане
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
