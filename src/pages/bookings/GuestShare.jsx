import { useEffect, useMemo, useState } from 'react'
import { Copy, FileDown, MessageCircle, Send } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { appOrigin } from '../../lib/appUrl'
import { guestFacingContact } from '../../lib/profileLogic'
import { guestTotals, guestMessage, whatsappUrl, viberForwardUrl, confirmationData } from '../../lib/guestConfirm'
import { Alert, Textarea } from '../../components/ui'

/**
 * „Прати на госта“ — в редакцията на запазена резервация: готово съобщение за Viber/WhatsApp (дати, остатък, линк към картата
 * на госта с адрес, Wi-Fi и код) и PDF „Потвърждение“. Платеното и остатъкът идват от плащанията по резервацията.
 */
export default function GuestShare({ booking }) {
  const { profile } = useAuth()
  const [property, setProperty] = useState(null)
  const [payments, setPayments] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let off = false
    Promise.all([
      supabase.from('properties').select('id, name, address, city, checkin_time, checkout_time').eq('id', booking.property_id).maybeSingle(),
      supabase.from('payments').select('kind, amount').eq('booking_id', booking.id),
    ]).then(([p, pay]) => {
      if (off) return
      setProperty(p.data ?? null)
      setPayments(pay.data ?? [])
    })
    return () => {
      off = true
    }
  }, [booking.id, booking.property_id])

  const owner = guestFacingContact(profile)
  const balance = useMemo(() => guestTotals(booking, payments).balance, [booking, payments])
  const text = useMemo(
    () => guestMessage({ booking, property, owner, balance, link: `${appOrigin()}/guest/${booking.property_id}` }),
    [booking, property, owner.name, owner.phone, balance]
  )

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setError('Не успях да копирам. Маркирайте текста ръчно.')
    }
  }

  const pdf = async () => {
    setBusy(true)
    setError(null)
    try {
      const [{ generateConfirmationPdf }, { downloadBlob }] = await Promise.all([import('../../lib/confirmationPdf'), import('../../lib/invoicePdf')])
      const { blob, filename } = await generateConfirmationPdf(confirmationData({ booking, property, owner, payments }), booking)
      downloadBlob(blob, filename)
    } catch (e) {
      setError('PDF не се създаде: ' + (e.message ?? e))
    }
    setBusy(false)
  }

  const btn = 'btn btn-secondary btn-sm'
  return (
    <section aria-labelledby="guest-share" className="rounded-2xl border border-line bg-sunken/50 p-4">
      <h3 id="guest-share" className="type-heading">
        Прати на госта
      </h3>
      <p className="mt-1 text-sm text-ink-soft">Готово съобщение с датите, остатъка и линк към картата на госта.</p>
      <label className="mt-3 block">
        <span className="sr-only">Текст на съобщението</span>
        <Textarea readOnly rows={6} value={text} />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <a className={btn} href={viberForwardUrl(text)}>
          <Send className="h-4 w-4" aria-hidden="true" /> Viber
        </a>
        <a className={btn} href={whatsappUrl(booking.guest_phone, text)} target="_blank" rel="noopener noreferrer">
          <MessageCircle className="h-4 w-4" aria-hidden="true" /> WhatsApp
        </a>
        <button type="button" className={btn} onClick={copy}>
          <Copy className="h-4 w-4" aria-hidden="true" /> {copied ? 'Копирано' : 'Копирай'}
        </button>
        <button type="button" className={btn} onClick={pdf} disabled={busy}>
          <FileDown className="h-4 w-4" aria-hidden="true" /> {busy ? 'Създавам PDF…' : 'Потвърждение (PDF)'}
        </button>
      </div>
      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}
    </section>
  )
}
