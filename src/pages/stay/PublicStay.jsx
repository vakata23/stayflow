import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Waves,
  MapPin,
  ScrollText,
  Users,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Phone,
  MessageSquare,
  MessageCircle,
  Smartphone,
  Send,
  Instagram,
  Mail,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { todayISO } from '../../lib/dates'
import { formatMoney } from '../../lib/money'
import { channelLabel, channelHref } from '../../lib/propertySettings'
import { isValidPhone } from '../../lib/bookingRequestServer'
import { Field, Input, Textarea, Button, Alert } from '../../components/ui'

const CHANNEL_ICONS = {
  phone: Phone,
  sms: MessageSquare,
  viber: MessageCircle,
  whatsapp: Smartphone,
  telegram: Send,
  messenger: MessageCircle,
  instagram: Instagram,
  email: Mail,
}

export default function PublicStay() {
  const { slug } = useParams()
  const [property, setProperty] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [checkIn, setCheckIn] = useState('')
  const [checkOut, setCheckOut] = useState('')
  const [guests, setGuests] = useState(2)

  const [quote, setQuote] = useState(null)
  const [quoting, setQuoting] = useState(false)
  const [quoteError, setQuoteError] = useState(null)

  const [guestName, setGuestName] = useState('')
  const [guestPhone, setGuestPhone] = useState('')
  const [guestEmail, setGuestEmail] = useState('')
  const [message, setMessage] = useState('')
  const [company, setCompany] = useState('') // honeypot — трябва да остане празно
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState(null)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    let cancelled = false

    supabase
      .rpc('public_property', { p_slug: slug })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error || !data || data.length === 0) setNotFound(true)
        else setProperty(data[0])
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  const handleQuote = async (e) => {
    e.preventDefault()
    setQuoteError(null)
    setQuote(null)
    setSent(false)

    if (!checkIn || !checkOut) return setQuoteError('Изберете дата на настаняване и напускане.')
    if (checkOut <= checkIn) return setQuoteError('Датата на напускане трябва да е след настаняването.')

    setQuoting(true)
    const { data, error } = await supabase.rpc('quote_stay', {
      p_slug: slug,
      p_check_in: checkIn,
      p_check_out: checkOut,
      p_guests: Number(guests),
    })
    setQuoting(false)

    if (error || !data || data.length === 0) {
      return setQuoteError('Не можахме да изчислим цена за тези дати. Опитайте с друг период.')
    }
    setQuote(data[0])
  }

  const canRequest =
    quote &&
    quote.is_available &&
    quote.fits_guests &&
    quote.nights >= quote.min_nights &&
    Number(quote.total) > 0

  const handleSubmitRequest = async (e) => {
    e.preventDefault()
    setSendError(null)

    if (!guestName.trim()) return setSendError('Името е задължително.')
    if (!guestPhone.trim() && !guestEmail.trim()) {
      return setSendError('Въведете телефон или имейл за връзка.')
    }
    if (guestPhone.trim() && !isValidPhone(guestPhone.trim())) {
      return setSendError('Невалиден телефонен номер (само цифри, интервали и +, поне 8 цифри).')
    }

    setSending(true)
    try {
      const res = await fetch('/api/booking-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          check_in: checkIn,
          check_out: checkOut,
          num_guests: Number(guests),
          guest_name: guestName.trim(),
          guest_phone: guestPhone.trim(),
          guest_email: guestEmail.trim(),
          message: message.trim(),
          company, // honeypot
        }),
      })
      const result = await res.json()
      if (!res.ok || !result.ok) {
        throw new Error(result.error || 'Неуспешно изпращане. Опитайте отново.')
      }
      setSent(true)
    } catch (err) {
      setSendError(err.message)
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <Loader2 className="h-7 w-7 animate-spin text-brand-600" />
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="max-w-sm rounded-2xl bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100">
            <AlertCircle className="h-6 w-6 text-slate-400" />
          </div>
          <h1 className="mt-4 text-lg font-bold">Страницата не е намерена</h1>
          <p className="mt-1 text-sm text-slate-500">
            Този имот не е публикуван или адресът е грешен.
          </p>
        </div>
      </div>
    )
  }

  const channels = Array.isArray(property.channels) ? property.channels : []

  return (
    <div className="min-h-screen bg-slate-100 pb-16">
      {/* Hero */}
      <div className="relative h-56 bg-brand-700 sm:h-72">
        {property.cover_image_url && (
          <img src={property.cover_image_url} alt={property.name} className="h-full w-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/70 to-slate-900/10" />
        <div className="absolute bottom-4 left-0 right-0 px-5">
          <div className="mx-auto max-w-lg">
            <h1 className="text-2xl font-bold text-white drop-shadow sm:text-3xl">{property.name}</h1>
            {property.city && (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-white/90 drop-shadow">
                <MapPin className="h-4 w-4" />
                {property.city}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-lg space-y-6 px-5 pt-6">
        {property.public_description && (
          <p className="text-sm leading-relaxed text-slate-600">{property.public_description}</p>
        )}

        <div className="flex items-center gap-1.5 text-sm text-slate-500">
          <Users className="h-4 w-4" />
          До {property.max_guests} гости
        </div>

        {channels.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {channels.map((ch, i) => {
              const Icon = CHANNEL_ICONS[ch.type] ?? MessageCircle
              const href = channelHref(ch.type, ch.value)
              return (
                <a
                  key={i}
                  href={href ?? undefined}
                  target={href?.startsWith('http') ? '_blank' : undefined}
                  rel="noreferrer"
                  className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 active:bg-slate-50"
                >
                  <Icon className="h-3.5 w-3.5 text-brand-600" />
                  {channelLabel(ch.type)}
                </a>
              )
            })}
          </div>
        )}

        {/* Проверка на цена */}
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Проверка на цена и наличност</h2>
          <form onSubmit={handleQuote} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Настаняване">
                <Input type="date" min={todayISO()} value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
              </Field>
              <Field label="Напускане">
                <Input
                  type="date"
                  min={checkIn || todayISO()}
                  value={checkOut}
                  onChange={(e) => setCheckOut(e.target.value)}
                />
              </Field>
            </div>
            <Field label="Брой гости">
              <Input
                type="number"
                min={1}
                max={property.max_guests}
                value={guests}
                onChange={(e) => setGuests(e.target.value)}
              />
            </Field>
            {quoteError && <Alert>{quoteError}</Alert>}
            <Button type="submit" loading={quoting} className="w-full">
              Провери цена
            </Button>
          </form>

          {quote && (
            <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
              {!quote.is_available ? (
                <Alert>Тези дати вече са заети. Опитайте с друг период.</Alert>
              ) : !quote.fits_guests ? (
                <Alert>Имотът побира максимум {property.max_guests} гости.</Alert>
              ) : quote.nights < quote.min_nights ? (
                <Alert>Минималният престой за тези дати е {quote.min_nights} нощувки.</Alert>
              ) : Number(quote.total) <= 0 ? (
                <Alert>Цената за тези дати не е зададена — свържете се със собственика.</Alert>
              ) : (
                <Alert kind="success">Свободно е за избрания период.</Alert>
              )}

              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between text-slate-500">
                  <span>Настаняване ({quote.nights} {quote.nights === 1 ? 'нощувка' : 'нощувки'})</span>
                  <span>{formatMoney(quote.accommodation_total)}</span>
                </div>
                {Number(quote.cleaning_fee) > 0 && (
                  <div className="flex justify-between text-slate-500">
                    <span>Такса почистване</span>
                    <span>{formatMoney(quote.cleaning_fee)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-slate-100 pt-1.5 text-base font-semibold text-slate-900">
                  <span>Общо</span>
                  <span>{formatMoney(quote.total)}</span>
                </div>
                {Number(quote.tourist_tax) > 0 && (
                  <p className="text-xs text-slate-400">
                    + туристически данък {formatMoney(quote.tourist_tax)} (плаща се на място)
                  </p>
                )}
                <p className="text-xs text-slate-400">
                  Капаро при потвърждение: {formatMoney(quote.deposit)}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Заявка за резервация */}
        {canRequest && !sent && (
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Изпрати заявка за резервация</h2>
            <p className="mb-4 text-xs text-slate-400">
              Това е заявка, не плащане. Собственикът ще се свърже с вас за потвърждение.
            </p>
            <form onSubmit={handleSubmitRequest} className="space-y-4">
              {sendError && <Alert>{sendError}</Alert>}
              <Field label="Име" required>
                <Input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Иван Иванов" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Телефон">
                  <Input
                    type="tel"
                    inputMode="tel"
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
                    placeholder="+359 88…"
                  />
                </Field>
                <Field label="Имейл">
                  <Input type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} placeholder="вие@примерен.бг" />
                </Field>
              </div>
              <Field label="Съобщение (по избор)">
                <Textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
              </Field>
              {/* Honeypot — скрито поле, невидимо за хора, но ботовете го попълват. */}
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', opacity: 0 }}
              />
              <Button type="submit" loading={sending} className="w-full">
                Изпрати заявка
              </Button>
            </form>
          </div>
        )}

        {sent && (
          <div className="flex flex-col items-center gap-2 rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-100">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            <p className="font-semibold text-slate-900">Заявката е изпратена!</p>
            <p className="text-sm text-slate-500">Собственикът ще се свърже с вас за потвърждение.</p>
          </div>
        )}

        {property.house_rules && (
          <div>
            <h2 className="mb-2 flex items-center gap-2 px-1 text-sm font-semibold text-slate-500">
              <ScrollText className="h-4 w-4" />
              Правила на къщата
            </h2>
            <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">
                {property.house_rules}
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-center gap-1.5 pt-2 text-xs text-slate-400">
          <Waves className="h-3.5 w-3.5" />
          Изготвено със StayFlow
        </div>
      </div>
    </div>
  )
}
