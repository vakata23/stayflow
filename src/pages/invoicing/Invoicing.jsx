import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Plus, Building2, Download, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { formatDateBG, nightsBetween } from '../../lib/dates'
import { formatMoney } from '../../lib/money'
import { generateInvoicePdf, downloadBlob } from '../../lib/invoicePdf'
import { PageHeader, Card, Button, Alert, Spinner, EmptyState } from '../../components/ui'
import InvoiceModal from './InvoiceModal'

export default function Invoicing() {
  const { profile } = useAuth()
  const [invoices, setInvoices] = useState([])
  const [bookings, setBookings] = useState([])
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [downloadingId, setDownloadingId] = useState(null)

  const [modalOpen, setModalOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    const [invRes, bookRes, propRes] = await Promise.all([
      supabase
        .from('invoices')
        .select('*, bookings(id, property_id, check_in, check_out, guest_name)')
        .order('created_at', { ascending: false }),
      supabase
        .from('bookings')
        .select('id, property_id, guest_name, guest_phone, guest_email, check_in, check_out, total_price')
        .neq('status', 'cancelled')
        .order('check_in', { ascending: false }),
      supabase.from('properties').select('id, name').order('name'),
    ])

    if (invRes.error) setError('Неуспешно зареждане: ' + invRes.error.message)
    setInvoices(invRes.data ?? [])
    setBookings(bookRes.data ?? [])
    setProperties(propRes.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const propertyName = (id) => properties.find((p) => p.id === id)?.name ?? '—'

  // Повторно генериране на PDF от запазените данни на фактурата.
  const redownload = async (invoice) => {
    setDownloadingId(invoice.id)
    setError(null)
    try {
      const b = invoice.bookings
      const { blob, filename } = await generateInvoicePdf({
        invoiceNumber: invoice.invoice_number,
        issueDate: invoice.issue_date,
        business: {
          name: profile?.company_name || profile?.full_name || 'StayFlow',
          phone: profile?.phone || '',
        },
        guest: invoice.guest_details ?? {},
        property: { name: b ? propertyName(b.property_id) : '' },
        period: b
          ? {
              checkIn: b.check_in,
              checkOut: b.check_out,
              nights: nightsBetween(b.check_in, b.check_out),
            }
          : { checkIn: '', checkOut: '', nights: 0 },
        amount: invoice.amount,
      })
      downloadBlob(blob, filename)
    } catch (err) {
      setError('Неуспешно сваляне: ' + err.message)
    } finally {
      setDownloadingId(null)
    }
  }

  const canCreate = bookings.length > 0

  return (
    <div>
      <PageHeader
        icon={FileText}
        title="Издаване на фактура към гост"
        description="Генерирайте PDF фактури от резервации."
        action={
          <Button onClick={() => setModalOpen(true)} disabled={!canCreate}>
            <Plus className="h-4 w-4" />
            Нова фактура
          </Button>
        }
      />

      <div className="mt-8">
        {error && <Alert>{error}</Alert>}

        {loading ? (
          <Card>
            <Spinner />
          </Card>
        ) : properties.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="Първо добавете имот и резервация"
            description="Фактурите се издават от съществуващи резервации."
            action={
              <Link to="/properties/new">
                <Button>
                  <Plus className="h-4 w-4" />
                  Добави имот
                </Button>
              </Link>
            }
          />
        ) : invoices.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Още няма издадени фактури"
            description={
              canCreate
                ? 'Издайте първата си фактура от съществуваща резервация.'
                : 'Първо добавете резервация, за да можете да издадете фактура.'
            }
            action={
              canCreate ? (
                <Button onClick={() => setModalOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Нова фактура
                </Button>
              ) : (
                <Link to="/bookings">
                  <Button variant="secondary">Към резервациите</Button>
                </Link>
              )
            }
          />
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-5 py-3 font-semibold">Номер</th>
                    <th className="px-5 py-3 font-semibold">Гост</th>
                    <th className="px-5 py-3 font-semibold">Имот</th>
                    <th className="px-5 py-3 font-semibold">Дата</th>
                    <th className="px-5 py-3 font-semibold">Сума</th>
                    <th className="px-5 py-3 font-semibold text-right">PDF</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50/60">
                      <td className="px-5 py-3.5 font-mono text-slate-700">{inv.invoice_number}</td>
                      <td className="px-5 py-3.5 font-medium text-slate-900">
                        {inv.guest_details?.name ?? inv.bookings?.guest_name ?? '—'}
                      </td>
                      <td className="px-5 py-3.5 text-slate-600">
                        {inv.bookings ? propertyName(inv.bookings.property_id) : '—'}
                      </td>
                      <td className="px-5 py-3.5 text-slate-600">{formatDateBG(inv.issue_date)}</td>
                      <td className="px-5 py-3.5 font-semibold text-slate-900">
                        {formatMoney(inv.amount)}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={() => redownload(inv)}
                          disabled={downloadingId === inv.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                        >
                          {downloadingId === inv.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="h-3.5 w-3.5" />
                          )}
                          Свали
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      <InvoiceModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={load}
        bookings={bookings}
        properties={properties}
        profile={profile}
      />
    </div>
  )
}
