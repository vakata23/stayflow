import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Waves,
  Wifi,
  KeyRound,
  MapPin,
  ScrollText,
  Phone,
  LogOut,
  Copy,
  Check,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'

function CopyRow({ label, value, mono }) {
  const [copied, setCopied] = useState(false)
  if (!value) return null

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* клипбордът може да е блокиран — стойността е видима за ръчно копиране */
    }
  }

  return (
    <button
      onClick={copy}
      className="flex w-full items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 text-left shadow-sm ring-1 ring-slate-100 transition-colors active:bg-slate-50"
    >
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
        <p className={`mt-0.5 truncate text-base font-semibold text-slate-900 ${mono ? 'font-mono' : ''}`}>
          {value}
        </p>
      </div>
      {copied ? (
        <Check className="h-5 w-5 shrink-0 text-emerald-500" />
      ) : (
        <Copy className="h-5 w-5 shrink-0 text-slate-300" />
      )}
    </button>
  )
}

function Section({ icon: Icon, title, children }) {
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 px-1 text-sm font-semibold text-slate-500">
        <Icon className="h-4 w-4" />
        {title}
      </h2>
      {children}
    </section>
  )
}

export default function GuestCard() {
  const { id } = useParams()
  const [card, setCard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    let cancelled = false

    supabase
      .rpc('guest_card', { p_property_id: id })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error || !data || data.length === 0) {
          setNotFound(true)
        } else {
          setCard(data[0])
        }
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [id])

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
            Линкът може да е грешен или вече да не е активен. Проверете при вашия домакин.
          </p>
        </div>
      </div>
    )
  }

  const fullAddress = [card.address, card.city].filter(Boolean).join(', ')
  const mapsUrl = fullAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`
    : null

  return (
    <div className="min-h-screen bg-slate-100 pb-12">
      {/* Hero */}
      <div className="relative h-56 bg-brand-700">
        {card.cover_image_url && (
          <img
            src={card.cover_image_url}
            alt={card.name}
            className="h-full w-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/70 to-slate-900/10" />
        <div className="absolute bottom-4 left-0 right-0 px-5">
          <div className="mx-auto max-w-md">
            <h1 className="text-2xl font-bold text-white drop-shadow">{card.name}</h1>
            {fullAddress && (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-white/90 drop-shadow">
                <MapPin className="h-4 w-4" />
                {fullAddress}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-md space-y-6 px-5 pt-6">
        <div className="rounded-xl bg-brand-50 px-4 py-3 text-center text-sm font-medium text-brand-800">
          Добре дошли! Тук е всичко необходимо за престоя ви.
        </div>

        {(card.wifi_name || card.wifi_password) && (
          <Section icon={Wifi} title="WiFi">
            <div className="space-y-2">
              <CopyRow label="Мрежа" value={card.wifi_name} />
              <CopyRow label="Парола" value={card.wifi_password} mono />
            </div>
          </Section>
        )}

        {card.access_code && (
          <Section icon={KeyRound} title="Достъп">
            <CopyRow label="Код за достъп" value={card.access_code} mono />
          </Section>
        )}

        {mapsUrl && (
          <Section icon={MapPin} title="Локация">
            <a
              href={mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-100 active:bg-slate-50"
            >
              <div>
                <p className="text-base font-semibold text-slate-900">{fullAddress}</p>
                <p className="mt-0.5 text-xs text-brand-600">Отвори в Google Maps →</p>
              </div>
              <MapPin className="h-5 w-5 shrink-0 text-slate-300" />
            </a>
          </Section>
        )}

        {card.house_rules && (
          <Section icon={ScrollText} title="Правила на къщата">
            <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">
                {card.house_rules}
              </p>
            </div>
          </Section>
        )}

        <Section icon={LogOut} title="При напускане">
          <div className="rounded-xl bg-white p-4 text-sm leading-relaxed text-slate-600 shadow-sm ring-1 ring-slate-100">
            <ul className="space-y-1.5">
              <li>• Оставете ключовете на договореното място.</li>
              <li>• Затворете прозорците и заключете вратата.</li>
              <li>• Изхвърлете боклука в контейнерите отвън.</li>
            </ul>
          </div>
        </Section>

        {card.contact_phone && (
          <Section icon={Phone} title="Контакт при спешен случай">
            <a
              href={`tel:${card.contact_phone}`}
              className="flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-100 active:bg-slate-50"
            >
              <div>
                {card.contact_name && (
                  <p className="text-base font-semibold text-slate-900">{card.contact_name}</p>
                )}
                <p className="mt-0.5 text-sm text-brand-600">{card.contact_phone}</p>
              </div>
              <Phone className="h-5 w-5 shrink-0 text-slate-300" />
            </a>
          </Section>
        )}

        <div className="flex items-center justify-center gap-1.5 pt-2 text-xs text-slate-400">
          <Waves className="h-3.5 w-3.5" />
          Изготвено със StayFlow
        </div>
      </div>
    </div>
  )
}
