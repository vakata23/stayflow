import { useMemo, useState } from 'react'
import {
  Eye,
  CheckCircle2,
  Phone,
  MessageSquare,
  MessageCircle,
  Smartphone,
  Send,
  Instagram,
  Mail,
  Star,
  Wifi,
  ParkingCircle,
  ParkingMeter,
  Car,
  Warehouse,
  PlugZap,
  Snowflake,
  Flame,
  CookingPot,
  Refrigerator,
  WashingMachine,
  Trees,
  Tv,
  PawPrint,
  Baby,
  Accessibility,
  Loader2,
  Share2,
  DoorOpen,
  CalendarCheck,
  MapPin,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { todayISO } from '../../lib/dates'
import { formatMoney } from '../../lib/money'
import { channelLabel, channelHref } from '../../lib/propertySettings'
import { isValidPhone, isValidEmail } from '../../lib/bookingRequestServer'
import { listedAmenities, CANCELLATION_POLICIES, cancellationLabel } from '../../lib/amenities'
import { stayThemeVars } from '../../lib/accentColor'
import PhotoMosaic from './PhotoMosaic'
import Lightbox from './Lightbox'
import AvailabilityCalendar from './AvailabilityCalendar'
import LocationMap from '../../components/LocationMap'
import { prefersReducedMotion, shortPrice, useInView } from './useStayEffects'
import './stay.css'

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

const AMENITY_ICONS = {
  wifi: Wifi,
  parking: ParkingCircle,
  parking_free: ParkingCircle,
  parking_paid: ParkingMeter,
  parking_street: Car,
  garage: Warehouse,
  ev_charger: PlugZap,
  ac: Snowflake,
  heating: Flame,
  kitchen: CookingPot,
  fridge: Refrigerator,
  washer: WashingMachine,
  balcony: Trees,
  tv: Tv,
  pets: PawPrint,
  crib: Baby,
  step_free: Accessibility,
}

const DESCRIPTION_PREVIEW_LEN = 380

const scrollToQuote = () =>
  document.getElementById('quote-section')?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })

function Note({ kind = 'info', children }) {
  return (
    <div className={`stay-note ${kind === 'error' ? 'stay-note--error' : kind === 'success' ? 'stay-note--ok' : ''}`} role={kind === 'error' ? 'alert' : undefined}>
      {children}
    </div>
  )
}

function Field({ label, required, children }) {
  return (
    <label className="stay-field">
      <span>
        {label}
        {required && ' *'}
      </span>
      {children}
    </label>
  )
}

/** Картата се зарежда чак когато секцията наближи екрана — без външен iframe при първо зареждане. */
function LazyMap(props) {
  const [ref, near] = useInView({ rootMargin: '400px', once: true })
  return (
    <div ref={ref} className="stay-mapbox" style={{ minHeight: props.height }}>
      {near && <LocationMap {...props} />}
    </div>
  )
}

/** „Сподели“: системното меню за споделяне, а където го няма — копира връзката. */
function ShareButton({ title }) {
  const [copied, setCopied] = useState(false)
  const share = async () => {
    const url = window.location.href
    try {
      if (navigator.share) {
        await navigator.share({ title, url })
        return
      }
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    } catch {
      /* отказано от потребителя — нищо за правене */
    }
  }
  return (
    <button type="button" className="stay-chip" onClick={share}>
      <Share2 className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
      <span aria-live="polite">{copied ? 'Връзката е копирана' : 'Сподели'}</span>
    </button>
  )
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

/**
 * Изгледът на обявата — общ за публичната страница (PublicStay, данни от
 * public_property) и за „Преглед като гост“ на собственика (ListingPreview,
 * данни от собствения му имот, още непубликуван). В preview режим няма
 * проверка на цена и заявка — те минават само през публикуван slug.
 * Показва се само онова, което собственикът е попълнил: празна секция няма.
 */
export default function ListingView({ property, reviews, slug, loadBusy, preview = false }) {
  const [lang, setLang] = useState('bg')
  const [descExpanded, setDescExpanded] = useState(false)
  const [amenitiesExpanded, setAmenitiesExpanded] = useState(false)
  const [lightbox, setLightbox] = useState(null)

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

  const [headWatch, headVisible] = useInView({ threshold: 0.15 })
  const [quoteWatch, quoteVisible] = useInView({ threshold: 0.1 })

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
    if (guestEmail.trim() && !isValidEmail(guestEmail.trim())) {
      return setSendError('Невалиден имейл адрес (нужен е домейн, напр. .bg или .com).')
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

  const description = useMemo(() => {
    if (!property) return ''
    if (lang === 'en' && property.public_description_en) return property.public_description_en
    return property.public_description || property.public_description_en || ''
  }, [property, lang])

  // Корицата (звездата в галерията на собственика) винаги е първа, после
  // останалите в реда, който собственикът е задал. Всяка снимка е с миниатюра
  // (photo_thumbs, ако са налични; иначе — самата снимка).
  const items = useMemo(() => {
    const photos = property?.photos ?? []
    const thumbs = property?.photo_thumbs ?? []
    const list = photos.map((url, i) => ({ url, thumb: thumbs[i] || url }))
    const cover = property?.cover_image_url
    const at = cover ? list.findIndex((p) => p.url === cover) : -1
    if (at <= 0) return list
    return [list[at], ...list.filter((_, i) => i !== at)]
  }, [property])

  const selectedAmenities = useMemo(() => listedAmenities(property?.amenities), [property])

  // От темата на имота ползваме само акцента (бутони и връзки); всичко останало е неутрално.
  const themeVars = useMemo(() => {
    const v = stayThemeVars(property.accent_color)
    return { '--stay-accent': v['--stay-accent'], '--stay-accent-text': v['--stay-accent-text'] }
  }, [property.accent_color])

  const channels = Array.isArray(property.channels) ? property.channels : []
  const basePrice = Number(property.base_price) || 0
  const showDescToggle = description.length > DESCRIPTION_PREVIEW_LEN
  const visibleDescription =
    !descExpanded && showDescToggle ? description.slice(0, DESCRIPTION_PREVIEW_LEN).trimEnd() + '…' : description
  const visibleAmenities = amenitiesExpanded ? selectedAmenities : selectedAmenities.slice(0, 8)
  const hasLocation = property.public_lat != null && property.public_lng != null

  const factsLine = [
    `до ${property.max_guests} ${property.max_guests === 1 ? 'гост' : 'гости'}`,
    property.bedrooms ? `${property.bedrooms} ${property.bedrooms === 1 ? 'спалня' : 'спални'}` : null,
    property.beds ? `${property.beds} ${property.beds === 1 ? 'легло' : 'легла'}` : null,
    property.bathrooms ? `${property.bathrooms} ${Number(property.bathrooms) === 1 ? 'баня' : 'бани'}` : null,
    property.area_m2 ? `${property.area_m2} м²` : null,
  ].filter(Boolean)

  const policy = CANCELLATION_POLICIES.find((p) => p.value === property.cancellation_policy)
  const highlights = [
    property.checkin_time && { Icon: DoorOpen, title: `Настаняване след ${property.checkin_time}`, text: property.checkout_time ? `Напускане до ${property.checkout_time}` : null },
    policy && { Icon: CalendarCheck, title: `${policy.label} анулация`, text: policy.hint },
    property.city && { Icon: MapPin, title: property.city, text: 'Точният адрес получавате след потвърждение на резервацията.' },
  ].filter(Boolean)

  const reviewCount = reviews.length
  const avg = reviewCount ? reviews.reduce((s, r) => s + Number(r.rating || 0), 0) / reviewCount : null

  // Лентата се показва само когато е сигурно, че заглавието/снимките и картата за резервация са извън екрана.
  const showBar = basePrice > 0 && headVisible === false && quoteVisible === false

  return (
    <div className="stay" style={themeVars}>
      <a href="#stay-main" className="stay-skip">
        Към съдържанието
      </a>

      {preview && (
        <div className="stay-preview-bar">
          <Eye className="h-4 w-4 shrink-0" />
          Преглед като гост — {property.is_listed ? 'страницата е публикувана' : 'още НЕ е публикувана, никой друг не я вижда'}
        </div>
      )}

      <header className="stay-wrap stay-head" ref={headWatch}>
        <div className="stay-titlebar">
          <div>
            <h1 className="stay-title">{property.name}</h1>
            {property.city && <p className="stay-loc">{property.city}</p>}
          </div>
          <div className="stay-actions">
            <ShareButton title={property.name} />
            {Boolean(property.public_description_en && property.public_description) && (
              <button
                type="button"
                className="stay-chip"
                onClick={() => setLang((l) => (l === 'bg' ? 'en' : 'bg'))}
                aria-label={lang === 'bg' ? 'Покажи описанието на английски' : 'Покажи описанието на български'}
              >
                <b className={lang === 'bg' ? '' : 'is-off'}>BG</b>
                {' · '}
                <b className={lang === 'en' ? '' : 'is-off'}>EN</b>
              </button>
            )}
          </div>
        </div>
        <div className="stay-gallery-wrap">
          <PhotoMosaic items={items} alt={property.name} onOpen={setLightbox} />
        </div>
      </header>

      <main id="stay-main" className="stay-wrap stay-body">
        <div className="stay-main">
          {/* Накратко за имота */}
          <section className="stay-sec" style={{ order: 1 }}>
            <h2 className="stay-sub">{property.city ? `Цял имот в ${property.city}` : 'Цял имот'}</h2>
            <p className="stay-facts">
              {factsLine.map((f) => (
                <span key={f}>{f}</span>
              ))}
            </p>
            {policy && (
              <ul className="stay-badges">
                <li className="stay-badge stay-badge--accent">{policy.label} анулация</li>
              </ul>
            )}
            {avg != null && (
              <div className="stay-rating">
                <span className="stay-rating__num">{avg.toFixed(1)}</span>
                <span className="stay-rating__meta">
                  <span className="stay-stars" role="img" aria-label={`Средна оценка ${avg.toFixed(1)} от 5`}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className="h-4 w-4" strokeWidth={1.6} fill={i < Math.round(avg) ? 'currentColor' : 'none'} />
                    ))}
                  </span>
                  <a href="#reviews">{plural(reviewCount, 'отзив', 'отзива')}</a>
                </span>
              </div>
            )}
          </section>

          {highlights.length > 0 && (
            <section className="stay-sec" style={{ order: 2 }} aria-label="Накратко">
              <ul className="stay-hl">
                {highlights.map(({ Icon, title, text }) => (
                  <li key={title}>
                    <Icon className="h-6 w-6" strokeWidth={1.5} aria-hidden="true" />
                    <div>
                      <b>{title}</b>
                      {text && <span>{text}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Описание */}
          {description && (
            <section className="stay-sec" style={{ order: 3 }}>
              <h2 className="stay-h2">За това място</h2>
              <p className="stay-prose">{visibleDescription}</p>
              {showDescToggle && (
                <p style={{ margin: '14px 0 0' }}>
                  <button type="button" onClick={() => setDescExpanded((v) => !v)} className="stay-link">
                    {descExpanded ? 'Покажи по-малко' : 'Прочети повече'}
                  </button>
                </p>
              )}
            </section>
          )}

          {/* Удобства */}
          {selectedAmenities.length > 0 && (
            <section className="stay-sec" style={{ order: 4 }}>
              <h2 className="stay-h2">Какво предлага имотът</h2>
              <ul className="stay-amenities">
                {visibleAmenities.map((a) => {
                  const Icon = AMENITY_ICONS[a.key] ?? CheckCircle2
                  return (
                    <li key={a.key}>
                      <Icon className="h-6 w-6" strokeWidth={1.5} aria-hidden="true" />
                      {a.label}
                    </li>
                  )
                })}
              </ul>
              {selectedAmenities.length > 8 && (
                <button type="button" onClick={() => setAmenitiesExpanded((v) => !v)} className="stay-btn-outline" aria-expanded={amenitiesExpanded}>
                  {amenitiesExpanded ? 'Покажи по-малко' : `Покажи всички ${selectedAmenities.length} удобства`}
                </button>
              )}
            </section>
          )}

          {/* Наличност */}
          <section className="stay-sec" style={{ order: 5 }}>
            <h2 className="stay-h2">Наличност</h2>
            <AvailabilityCalendar loadBusy={loadBusy} />
          </section>

          {/* Правила */}
          <section className="stay-sec" style={{ order: 7 }}>
            <h2 className="stay-h2">Правила на имота</h2>
            <dl className="stay-rules">
              <div>
                <dt>Настаняване</dt>
                <dd>след {property.checkin_time}</dd>
              </div>
              <div>
                <dt>Напускане</dt>
                <dd>до {property.checkout_time}</dd>
              </div>
              <div>
                <dt>Пушене</dt>
                <dd>{property.smoking_allowed ? 'Разрешено' : 'Не се пуши'}</dd>
              </div>
              <div>
                <dt>Партита</dt>
                <dd>{property.parties_allowed ? 'Разрешени' : 'Без партита'}</dd>
              </div>
              <div className="wide">
                <dt>Анулиране</dt>
                <dd>{cancellationLabel(property.cancellation_policy)} политика</dd>
              </div>
              {property.house_rules && (
                <div className="wide">
                  <dt>Домашни правила</dt>
                  <dd className="plain">{property.house_rules}</dd>
                </div>
              )}
            </dl>
          </section>

          {/* Местоположение */}
          {hasLocation && (
            <section className="stay-sec" style={{ order: 8 }}>
              <h2 className="stay-h2">Къде ще бъдете</h2>
              <LazyMap lat={property.public_lat} lng={property.public_lng} showCircle height={320} />
              <p className="stay-muted" style={{ margin: '12px 0 0', fontSize: 14 }}>
                Показаната зона е приблизителна. Точният адрес се предоставя след потвърждение на резервацията.
              </p>
            </section>
          )}

          {/* Отзиви — само ако има реални */}
          {reviewCount > 0 && (
            <section id="reviews" className="stay-sec" style={{ order: 9 }}>
              <h2 className="stay-h2" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Star className="h-5 w-5" fill="currentColor" strokeWidth={1.5} aria-hidden="true" />
                {avg.toFixed(1)} · {plural(reviewCount, 'отзив', 'отзива')}
              </h2>
              <div className="stay-reviews">
                {reviews.map((r) => (
                  <figure key={r.id} className="stay-review">
                    <figcaption>
                      {r.guest_name}
                      <span className="stay-stars" role="img" aria-label={`${r.rating} от 5 звезди`}>
                        {Array.from({ length: r.rating }).map((_, i) => (
                          <Star key={i} className="h-3.5 w-3.5" fill="currentColor" strokeWidth={1.5} />
                        ))}
                      </span>
                    </figcaption>
                    <blockquote>{r.comment}</blockquote>
                  </figure>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Проверка на цена, заявка, връзка — на голям екран е залепена отстрани, на телефон е след наличността */}
        <aside id="quote-section" ref={quoteWatch} className="stay-booking" style={{ order: 6 }}>
          {preview ? (
            <div className="stay-card">
              <h2>Цена и заявка</h2>
              <p className="stay-muted" style={{ margin: 0, fontSize: 15 }}>
                Тук гостите проверяват цена за дати и изпращат заявка. В прегледа е изключено — работи, след като публикувате
                страницата.
              </p>
            </div>
          ) : (
            <>
              <div className="stay-card">
                <p className="stay-price">
                  {basePrice > 0 ? (
                    <>
                      <small>от</small>
                      <b>{shortPrice(basePrice)}</b>
                      <span>/ нощувка</span>
                    </>
                  ) : (
                    <b>Проверете цена</b>
                  )}
                </p>
                <form onSubmit={handleQuote} className="stay-stack" noValidate>
                  <div className="stay-dates">
                    <Field label="Настаняване">
                      <input className="stay-input" type="date" min={todayISO()} value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
                    </Field>
                    <Field label="Напускане">
                      <input className="stay-input" type="date" min={checkIn || todayISO()} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
                    </Field>
                    <Field label="Брой гости">
                      <input className="stay-input" type="number" min={1} max={property.max_guests} value={guests} onChange={(e) => setGuests(e.target.value)} />
                    </Field>
                  </div>
                  {quoteError && <Note kind="error">{quoteError}</Note>}
                  <button type="submit" disabled={quoting} className="stay-btn stay-btn--block">
                    {quoting && <Loader2 className="h-4 w-4 animate-spin" />}
                    Провери цена
                  </button>
                  <p className="stay-fine">Няма да бъдете таксувани сега.</p>
                </form>

                {quote && (
                  <div className="stay-quote">
                    {!quote.is_available ? (
                      <Note kind="error">Тези дати вече са заети. Опитайте с друг период.</Note>
                    ) : !quote.fits_guests ? (
                      <Note kind="error">Имотът побира максимум {property.max_guests} гости.</Note>
                    ) : quote.nights < quote.min_nights ? (
                      <Note kind="error">Минималният престой за тези дати е {quote.min_nights} нощувки.</Note>
                    ) : Number(quote.total) <= 0 ? (
                      <Note kind="error">Цената за тези дати не е зададена — свържете се със собственика.</Note>
                    ) : (
                      <Note kind="success">Свободно е за избрания период.</Note>
                    )}

                    <div className="stay-line">
                      <span>
                        Настаняване ({quote.nights} {quote.nights === 1 ? 'нощувка' : 'нощувки'})
                      </span>
                      <span>{formatMoney(quote.accommodation_total)}</span>
                    </div>
                    {Number(quote.cleaning_fee) > 0 && (
                      <div className="stay-line">
                        <span>Такса почистване</span>
                        <span>{formatMoney(quote.cleaning_fee)}</span>
                      </div>
                    )}
                    <div className="stay-total">
                      <span>Общо</span>
                      <span>{formatMoney(quote.total)}</span>
                    </div>
                    {Number(quote.tourist_tax) > 0 && (
                      <p className="stay-muted" style={{ margin: 0, fontSize: 13 }}>
                        + туристически данък {formatMoney(quote.tourist_tax)} (плаща се на място)
                      </p>
                    )}
                    <p className="stay-muted" style={{ margin: 0, fontSize: 13 }}>
                      Капаро при потвърждение: {formatMoney(quote.deposit)}
                    </p>
                  </div>
                )}
              </div>

              {/* Заявка за резервация */}
              {canRequest && !sent && (
                <div className="stay-card">
                  <h2>Изпрати заявка</h2>
                  <p className="stay-muted" style={{ margin: '-4px 0 16px', fontSize: 14 }}>
                    Това е заявка, не плащане. Собственикът ще се свърже с вас за потвърждение.
                  </p>
                  <form onSubmit={handleSubmitRequest} className="stay-stack" noValidate>
                    {sendError && <Note kind="error">{sendError}</Note>}
                    <Field label="Име" required>
                      <input className="stay-input" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Иван Иванов" autoComplete="name" />
                    </Field>
                    <div className="stay-grid2">
                      <Field label="Телефон">
                        <input
                          className="stay-input"
                          type="tel"
                          inputMode="tel"
                          value={guestPhone}
                          onChange={(e) => setGuestPhone(e.target.value)}
                          placeholder="+359 88…"
                          autoComplete="tel"
                        />
                      </Field>
                      <Field label="Имейл">
                        <input
                          className="stay-input"
                          type="email"
                          value={guestEmail}
                          onChange={(e) => setGuestEmail(e.target.value)}
                          placeholder="вие@примерен.бг"
                          autoComplete="email"
                        />
                      </Field>
                    </div>
                    <Field label="Съобщение (по избор)">
                      <textarea className="stay-input" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} style={{ resize: 'vertical' }} />
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
                    <button type="submit" disabled={sending} className="stay-btn stay-btn--block">
                      {sending && <Loader2 className="h-4 w-4 animate-spin" />}
                      Изпрати заявка
                    </button>
                  </form>
                </div>
              )}

              {sent && (
                <div className="stay-card" style={{ textAlign: 'center' }} role="status">
                  <CheckCircle2 className="mx-auto h-8 w-8" style={{ color: 'var(--stay-accent-text)' }} strokeWidth={1.5} />
                  <h2 style={{ margin: '10px 0 4px' }}>Заявката е изпратена</h2>
                  <p className="stay-muted" style={{ margin: 0, fontSize: 15 }}>
                    Собственикът ще се свърже с вас за потвърждение.
                  </p>
                </div>
              )}
            </>
          )}

          {channels.length > 0 && (
            <div>
              <p className="stay-contact-title">Предпочитате да пишете директно?</p>
              <div className="stay-contact" style={{ justifyContent: 'center' }}>
                {channels.map((ch, i) => {
                  const Icon = CHANNEL_ICONS[ch.type] ?? MessageCircle
                  const href = channelHref(ch.type, ch.value)
                  return (
                    <a key={i} href={href ?? undefined} target={href?.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
                      <Icon className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" />
                      {channelLabel(ch.type)}
                    </a>
                  )
                })}
              </div>
            </div>
          )}
        </aside>
      </main>

      <footer className="stay-foot">Изготвено със StayFlow</footer>

      {/* Залепена лента на телефона — показва се, когато заглавието и картата за резервация са извън екрана */}
      {basePrice > 0 && (
        <div className={`stay-bar ${showBar ? 'is-on' : ''}`} aria-hidden={!showBar}>
          <div>
            <b>{shortPrice(basePrice)}</b>
            <small>на нощувка</small>
          </div>
          <button type="button" className="stay-btn" onClick={scrollToQuote} tabIndex={showBar ? 0 : -1}>
            Провери дати
          </button>
        </div>
      )}

      {lightbox !== null && items.length > 0 && (
        <Lightbox photos={items} index={lightbox} alt={property.name} onClose={() => setLightbox(null)} onChange={setLightbox} />
      )}
    </div>
  )
}
