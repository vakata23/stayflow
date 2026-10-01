import { useState, useEffect } from 'react'
import { FileText } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { nightsBetween, formatDateBG, todayISO } from '../../lib/dates'
import { nextInvoiceNumber } from '../../lib/invoices'
import { generateInvoicePdf, downloadBlob } from '../../lib/invoicePdf'
import { Field, Input, Select, Button, Alert } from '../../components/ui'

export default function InvoiceModal({ open, onClose, onSaved, bookings, properties, profile }) {
  const { user } = useAuth()

  const [bookingId, setBookingId] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [issueDate, setIssueDate] = useState(todayISO())
  const [guestName, setGuestName] = useState('')
  const [guestPhone, setGuestPhone] = useState('')
  const [guestEmail, setGuestEmail] = useState('')
  const [amount, setAmount] = useState('')

  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setError(null)
    setIssueDate(todayISO())
    setBookingId('')
    setGuestName('')
    setGuestPhone('')
    setGuestEmail('')
    setAmount('')
    nextInvoiceNumber()
      .then(setInvoiceNumber)
      .catch(() => setInvoiceNumber(''))
  }, [open])

  // Избор на резервация → автоматично попълва данните на госта.
  const onPickBooking = (e) => {
    const id = e.target.value
    setBookingId(id)
    const b = bookings.find((x) => x.id === id)
    if (b) {
      setGuestName(b.guest_name ?? '')
      setGuestPhone(b.guest_phone ?? '')
      setGuestEmail(b.guest_email ?? '')
      setAmount(b.total_price != null ? String(b.total_price) : '')
    }
  }

  if (!open) return null

  const booking = bookings.find((b) => b.id === bookingId)
  const property = booking ? properties.find((p) => p.id === booking.property_id) : null

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (!booking) return setError('Изберете резервация.')
    if (!guestName.trim()) return setError('Името на госта е задължително.')
    if (amount === '' || Number(amount) < 0) return setError('Въведете валидна сума.')
    if (!invoiceNumber) return setError('Липсва номер на фактура.')

    setSaving(true)
    try {
      const guestDetails = {
        name: guestName.trim(),
        phone: guestPhone.trim() || null,
        email: guestEmail.trim() || null,
      }

      // 1. Запис в базата
      const { error: dbError } = await supabase.from('invoices').insert({
        booking_id: booking.id,
        invoice_number: invoiceNumber,
        guest_details: guestDetails,
        amount: Number(amount),
        issue_date: issueDate,
      })
      if (dbError) {
        // 23505 = дублиран номер (състезателна заявка) — предлагаме нов
        if (dbError.code === '23505') {
          throw new Error('Този номер вече е използван. Затворете и опитайте отново.')
        }
        throw dbError
      }

      // 2. Генериране и сваляне на PDF
      const { blob, filename } = await generateInvoicePdf({
        invoiceNumber,
        issueDate,
        business: {
          name: profile?.company_name || profile?.full_name || 'StayFlow',
          phone: profile?.phone || '',
        },
        guest: guestDetails,
        property: { name: property?.name || '' },
        period: {
          checkIn: booking.check_in,
          checkOut: booking.check_out,
          nights: nightsBetween(booking.check_in, booking.check_out),
        },
        amount: Number(amount),
      })
      downloadBlob(blob, filename)

      onSaved()
      onClose()
    } catch (err) {
      setError('Неуспешно издаване: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <div className="fixed inset-0 bg-slate-900/40" onClick={onClose} />

      <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl">
        <header className="flex items-center gap-2 border-b border-slate-100 px-6 py-4">
          <FileText className="h-5 w-5 text-brand-600" />
          <h2 className="text-lg font-bold">Издаване на фактура</h2>
        </header>

        <form onSubmit={handleSubmit} className="space-y-5 px-6 py-5">
          {error && <Alert>{error}</Alert>}

          <Field label="Резервация" required>
            <Select value={bookingId} onChange={onPickBooking}>
              <option value="">— Изберете резервация —</option>
              {bookings.map((b) => {
                const p = properties.find((x) => x.id === b.property_id)
                return (
                  <option key={b.id} value={b.id}>
                    {b.guest_name} · {p?.name ?? ''} · {formatDateBG(b.check_in)}
                  </option>
                )
              })}
            </Select>
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Номер на фактура">
              <Input value={invoiceNumber} readOnly className="bg-slate-50 font-mono" />
            </Field>
            <Field label="Дата на издаване">
              <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </Field>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Данни на получателя
            </p>
            <div className="space-y-4">
              <Field label="Име" required>
                <Input value={guestName} onChange={(e) => setGuestName(e.target.value)} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Телефон">
                  <Input value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} />
                </Field>
                <Field label="Имейл">
                  <Input type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} />
                </Field>
              </div>
            </div>
          </div>

          <Field label="Сума (€)" required>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </Field>

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
              Отказ
            </Button>
            <Button type="submit" loading={saving}>
              <FileText className="h-4 w-4" />
              Издай и свали PDF
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
