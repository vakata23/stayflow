import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Copy, MessageCircle, Send } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { appOrigin } from '../lib/appUrl'
import { guestFacingContact } from '../lib/profileLogic'
import { guestTotals, whatsappUrl, viberForwardUrl } from '../lib/guestConfirm'
import { loadDeclaration } from '../lib/registry'
import { APP_LANGUAGES } from '../i18n/appLang'
import { todayISO, addDays, toISODate, formatDateBG } from '../lib/dates'
import {
  KINDS, LANGS, DEFAULT_TEMPLATES, buildContext, renderTemplate, templateText, unknownTags, guestLanguage, cleanOverrides, setOverride,
} from '../lib/messageTemplates'
import { PageHeader, Card, Field, Select, Segmented, Textarea, Alert, Button, Spinner } from '../components/ui'

const KIND_LABELS = {
  confirm: 'Потвърждение на резервация',
  before_arrival: 'Преди пристигане',
  declaration_data: 'Данни за декларацията',
  payment_reminder: 'Напомняне за плащане',
  after_stay: 'След напускане',
}
// имената на езиците са на самите езици и не се превеждат
const LANG_LABELS = ['bg', 'el', 'en'].map((code) => ({ value: code, label: APP_LANGUAGES.find((l) => l.code === code).name }))
const TAGS = [
  ['name', 'Име'],
  ['property', 'Имот'],
  ['checkin', 'Пристигане'],
  ['checkout', 'Напускане'],
  ['nights', 'Нощувки'],
  ['code', 'Код за входа'],
  ['wifi', 'Wi-Fi'],
  ['wifi_password', 'Парола за Wi-Fi'],
  ['address', 'Адрес'],
  ['amount', 'Остатък'],
  ['link', 'Линк към картата'],
  ['owner', 'Вашето име'],
]

const STORE_KEY = 'stayflow.msgTemplates'
const readOverrides = () => {
  try {
    return cleanOverrides(JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}'))
  } catch {
    return {}
  }
}
const writeOverrides = (o) => {
  try {
    if (Object.keys(o).length) localStorage.setItem(STORE_KEY, JSON.stringify(o))
    else localStorage.removeItem(STORE_KEY)
  } catch {
    /* без запис на това устройство — редакцията важи, докато страницата е отворена */
  }
}

/** Примерна резервация, когато още няма истинска. */
const SAMPLE = {
  booking: { guest_name: 'Anna Schmidt', check_in: '2027-05-10', check_out: '2027-05-14' },
  property: { name: 'Villa Elia', address: 'Kassandra 5', city: 'Halkidiki', access_code: '4821', wifi_name: 'Elia', wifi_password: 'sea12345' },
}

export default function Messages() {
  const { profile } = useAuth()
  const [params, setParams] = useSearchParams()
  const [bookings, setBookings] = useState(null)
  const [properties, setProperties] = useState([])
  const [bookingId, setBookingId] = useState(params.get('booking') ?? '')
  const [kind, setKind] = useState(KINDS.includes(params.get('kind')) ? params.get('kind') : 'before_arrival')
  const [lang, setLang] = useState('bg')
  const [langTouched, setLangTouched] = useState(false)
  const [overrides, setOverrides] = useState(readOverrides)
  const [payments, setPayments] = useState([])
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(null)
  const textRef = useRef(null)

  useEffect(() => {
    let off = false
    const from = toISODate(addDays(new Date(`${todayISO()}T12:00:00`), -14))
    Promise.all([
      supabase
        .from('bookings')
        .select('id, property_id, guest_name, guest_phone, check_in, check_out, total_price, tourist_tax, source, status')
        .neq('status', 'cancelled')
        .gte('check_out', from)
        .order('check_in')
        .limit(80),
      supabase.from('properties').select('id, name, address, city, access_code, wifi_name, wifi_password'),
    ]).then(([b, p]) => {
      if (off) return
      setBookings(b.data ?? [])
      setProperties(p.data ?? [])
    })
    return () => {
      off = true
    }
  }, [])

  // без избрана резервация (или с непозната) — най-близката предстояща
  useEffect(() => {
    if (!bookings) return
    if (bookingId && bookings.some((b) => b.id === bookingId)) return
    const today = todayISO()
    const next = bookings.find((b) => b.check_out >= today) ?? bookings[0]
    setBookingId(next?.id ?? '')
  }, [bookings, bookingId])

  const booking = useMemo(() => bookings?.find((b) => b.id === bookingId) ?? null, [bookings, bookingId])
  const property = useMemo(() => (booking ? properties.find((p) => p.id === booking.property_id) ?? {} : SAMPLE.property), [booking, properties])

  // плащания и език на госта (от гражданството в данните за декларацията — само при имот в Гърция)
  useEffect(() => {
    if (!booking) return setPayments([])
    let off = false
    Promise.all([supabase.from('payments').select('kind, amount').eq('booking_id', booking.id), loadDeclaration(booking.id)]).then(([pay, decl]) => {
      if (off) return
      setPayments(pay.data ?? [])
      if (!langTouched) setLang(guestLanguage(decl?.guest_country))
    })
    return () => {
      off = true
    }
  }, [booking?.id, langTouched])

  const owner = guestFacingContact(profile)
  const balance = useMemo(() => (booking ? guestTotals(booking, payments).balance : null), [booking, payments])
  const text = templateText(kind, lang, overrides)
  const overridden = Boolean(overrides[kind]?.[lang])
  const ctx = useMemo(
    () =>
      buildContext({
        booking: booking ?? SAMPLE.booking,
        property,
        owner,
        balance,
        link: booking ? `${appOrigin()}/guest/${booking.property_id}` : `${appOrigin()}/guest/…`,
        lang,
      }),
    [booking, property, owner.name, balance, lang]
  )
  const message = useMemo(() => renderTemplate(text, ctx), [text, ctx])
  const unknown = unknownTags(text)

  const edit = (value) => {
    const next = setOverride(overrides, kind, lang, value)
    setOverrides(next)
    writeOverrides(next)
  }
  const reset = () => edit(DEFAULT_TEMPLATES[kind][lang])

  const insertTag = (key) => {
    const el = textRef.current
    const tag = `{${key}}`
    if (!el) return edit(text + tag)
    const start = el.selectionStart ?? text.length
    const end = el.selectionEnd ?? text.length
    edit(text.slice(0, start) + tag + text.slice(end))
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + tag.length, start + tag.length)
    })
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setError('Не успях да копирам. Маркирайте текста ръчно.')
    }
  }

  const pickKind = (v) => {
    setKind(v)
    const p = new URLSearchParams(params)
    p.set('kind', v)
    setParams(p, { replace: true })
  }

  if (bookings === null) return <Spinner />

  const btn = 'btn btn-secondary btn-sm'
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Гости"
        title="Съобщения"
        description="Готови съобщения към гостите на български, гръцки и английски. Изберете резервация и етикетите се попълват сами."
      />

      {error && <Alert>{error}</Alert>}

      <Card className="space-y-5 p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Резервация">
            <Select value={bookingId} onChange={(e) => setBookingId(e.target.value)}>
              {bookings.length === 0 && <option value="">Пример (още няма резервации)</option>}
              {bookings.map((b) => (
                <option key={b.id} value={b.id}>
                  {`${b.guest_name} · ${properties.find((p) => p.id === b.property_id)?.name ?? ''} · ${formatDateBG(b.check_in)}`}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Съобщение">
            <Select value={kind} onChange={(e) => pickKind(e.target.value)}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            label="Език на съобщението"
            value={lang}
            onChange={(v) => {
              setLangTouched(true)
              setLang(v)
            }}
            options={LANG_LABELS}
          />
          {!booking && <p className="text-xs text-ink-muted">Показани са примерни данни.</p>}
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-3">
            <Field label="Шаблон" hint="Етикетите в скоби се попълват от резервацията.">
              <Textarea ref={textRef} rows={9} value={text} onChange={(e) => edit(e.target.value)} />
            </Field>
            <div>
              <p className="mb-2 text-xs font-semibold text-ink-soft">Вмъкни</p>
              <div className="flex flex-wrap gap-1.5">
                {TAGS.map(([key, label]) => (
                  <button key={key} type="button" className="btn btn-soft btn-sm" onClick={() => insertTag(key)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {unknown.length > 0 && <Alert kind="warning">{`Непознат етикет: ${unknown.map((u) => `{${u}}`).join(', ')}. Той ще остане в съобщението както е написан.`}</Alert>}
            <div className="flex flex-wrap items-center gap-3">
              {overridden && (
                <Button type="button" variant="ghost" size="sm" onClick={reset}>
                  Върни по подразбиране
                </Button>
              )}
              <p className="text-xs text-ink-muted">Промените се пазят на това устройство.</p>
            </div>
          </div>

          <div className="space-y-3">
            <p className="field-label">Как ще го получи гостът</p>
            <div className="min-h-[14rem] whitespace-pre-wrap rounded-2xl border border-line bg-sunken/50 p-4 text-[0.9375rem] leading-relaxed" data-testid="msg-preview">
              {message}
            </div>
            <div className="flex flex-wrap gap-2">
              <a className={btn} href={viberForwardUrl(message)}>
                <Send className="h-4 w-4" aria-hidden="true" /> Viber
              </a>
              <a className={btn} href={whatsappUrl(booking?.guest_phone, message)} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-4 w-4" aria-hidden="true" /> WhatsApp
              </a>
              <button type="button" className={btn} onClick={copy}>
                <Copy className="h-4 w-4" aria-hidden="true" /> {copied ? 'Копирано' : 'Копирай'}
              </button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
