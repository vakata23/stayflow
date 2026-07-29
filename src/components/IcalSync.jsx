import { useState } from 'react'
import { RefreshCw, Copy, Check, Link2, Download } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { parseIcs, detectSource, buildIcs } from '../lib/ical'
import { findConflictingBooking, translateBookingError } from '../lib/bookings'
import { appOrigin, apiBase } from '../lib/appUrl'
import { Card, Field, Input, Button, Alert } from './ui'

function CopyField({ value }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* клипбордът може да е блокиран — стойността се вижда и се маркира ръчно */
    }
  }

  return (
    <div className="flex gap-2">
      <input
        readOnly
        value={value}
        onFocus={(e) => e.target.select()}
        className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600 outline-none"
      />
      <Button type="button" variant="secondary" onClick={copy} className="shrink-0 !py-2">
        {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
        {copied ? 'Копирано' : 'Копирай'}
      </Button>
    </div>
  )
}

export default function IcalSync({ property, onBookingsChanged }) {
  const [icalUrl, setIcalUrl] = useState(property.ical_url ?? '')
  const [savingUrl, setSavingUrl] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  const exportUrl = `${appOrigin()}/api/ical?token=${property.ical_token}`

  const saveUrl = async () => {
    setSavingUrl(true)
    setError(null)
    setMessage(null)

    const { error } = await supabase
      .from('properties')
      .update({ ical_url: icalUrl.trim() || null })
      .eq('id', property.id)

    setSavingUrl(false)
    if (error) return setError('Неуспешно записване: ' + error.message)
    setMessage('Адресът е записан.')
  }

  const downloadIcs = async () => {
    const { data, error } = await supabase
      .from('bookings')
      .select('id, check_in, check_out')
      .eq('property_id', property.id)
      .neq('status', 'cancelled')
      .order('check_in')

    if (error) return setError('Неуспешно изтегляне: ' + error.message)

    const ics = buildIcs({
      calendarName: `${property.name} — StayFlow`,
      events: (data ?? []).map((b) => ({
        uid: `${b.id}@stayflow`,
        start: b.check_in,
        end: b.check_out,
        summary: 'Заето',
      })),
    })

    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${property.name.replace(/[^\wа-яА-Я -]/g, '')}.ics`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const sync = async () => {
    const url = icalUrl.trim()
    if (!url) return setError('Първо въведете iCal адрес.')

    setSyncing(true)
    setError(null)
    setMessage(null)

    try {
      const res = await fetch(`${apiBase()}/api/ical?url=${encodeURIComponent(url)}`)
      const text = await res.text()
      if (!res.ok) throw new Error(text)

      const events = parseIcs(text)
      if (events.length === 0) {
        setMessage('Календарът беше прочетен успешно, но не съдържа резервации.')
        return
      }

      // Кои външни събития вече са внесени?
      const { data: existing } = await supabase
        .from('bookings')
        .select('external_uid')
        .eq('property_id', property.id)
        .not('external_uid', 'is', null)

      const known = new Set((existing ?? []).map((b) => b.external_uid))
      const source = detectSource(url)

      let added = 0
      let skipped = 0
      let conflicts = 0

      for (const ev of events) {
        if (known.has(ev.uid)) {
          skipped++
          continue
        }

        // Външните календари често се застъпват с вече въведени ръчно
        // резервации — тях ги прескачаме, вместо да чупим синхронизацията.
        const conflict = await findConflictingBooking({
          propertyId: property.id,
          checkIn: ev.start,
          checkOut: ev.end,
        })
        if (conflict) {
          conflicts++
          continue
        }

        const { error } = await supabase.from('bookings').insert({
          property_id: property.id,
          guest_name: ev.summary || 'Външна резервация',
          check_in: ev.start,
          check_out: ev.end,
          num_guests: 1,
          source,
          status: 'confirmed',
          external_uid: ev.uid,
          notes: `Импортирана от ${url}`,
        })

        if (error) {
          // Състезателна заявка или застъпване, хванато от базата.
          if (error.code === '23P01' || error.code === '23505') conflicts++
          else throw error
        } else {
          added++
        }
      }

      const parts = [`Добавени: ${added}`]
      if (skipped) parts.push(`вече синхронизирани: ${skipped}`)
      if (conflicts) parts.push(`пропуснати заради застъпване: ${conflicts}`)
      setMessage(parts.join(' · '))

      if (added > 0) onBookingsChanged?.()
    } catch (err) {
      setError(err.code ? translateBookingError(err) : 'Синхронизацията не успя: ' + err.message)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <Card className="p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
        Синхронизация с Airbnb / Booking.com
      </h2>

      <div className="mt-5 space-y-6">
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-700">
            <Link2 className="h-4 w-4 text-slate-400" />
            Експорт — дайте този адрес на Airbnb/Booking
          </p>
          <CopyField value={exportUrl} />
          <p className="mt-2 text-xs text-slate-400">
            Външните платформи ще блокират тези дати автоматично. Линкът показва само заетите
            периоди — имена и контакти на гостите не се публикуват.
          </p>
          <Button type="button" variant="secondary" onClick={downloadIcs} className="mt-3 !py-2">
            <Download className="h-4 w-4" />
            Изтегли .ics файл
          </Button>
        </div>

        <div className="border-t border-slate-100 pt-6">
          <Field
            label="Импорт — iCal адрес от Airbnb/Booking"
            hint="Намира се в настройките на обявата, раздел „Наличност“ → „Синхронизиране на календари“."
          >
            <Input
              value={icalUrl}
              onChange={(e) => setIcalUrl(e.target.value)}
              placeholder="https://www.airbnb.com/calendar/ical/12345.ics?s=..."
            />
          </Field>

          <div className="mt-3 flex flex-wrap gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={saveUrl}
              loading={savingUrl}
              className="!py-2"
            >
              Запази адреса
            </Button>
            <Button type="button" onClick={sync} loading={syncing} className="!py-2">
              <RefreshCw className="h-4 w-4" />
              Синхронизирай сега
            </Button>
          </div>
        </div>

        {error && <Alert>{error}</Alert>}
        {message && <Alert kind="success">{message}</Alert>}
      </div>
    </Card>
  )
}
