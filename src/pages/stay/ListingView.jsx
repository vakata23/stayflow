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
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { todayISO } from '../../lib/dates'
import { formatMoney } from '../../lib/money'
import { channelLabel, channelHref } from '../../lib/propertySettings'
import { isValidPhone, isValidEmail } from '../../lib/bookingRequestServer'
import { AMENITIES, cancellationLabel } from '../../lib/amenities'
import { stayThemeVars } from '../../lib/accentColor'
import StayHero from './StayHero'
import Gallery from './Gallery'
import Lightbox from './Lightbox'
import AvailabilityCalendar from './AvailabilityCalendar'
import LocationMap from '../../components/LocationMap'
import { Reveal, prefersReducedMotion, shortPrice, useInView, useStayFonts } from './useStayEffects'
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

/**
 * Изгледът на обявата — общ за публичната страница (PublicStay, данни от
 * public_property) и за „Преглед като гост“ на собственика (ListingPreview,
 * данни от собствения му имот, още непубликуван). В preview режим няма
 * проверка на цена и заявка — те минават само през публикуван slug.
 */
export default function ListingView({ property, reviews, slug, loadBusy, preview = false }) {
  useStayFonts()

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

  const [heroWatch, heroVisible] = useInView({ threshold: 0.15 })
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

  const selectedAmenities = useMemo(
    () => AMENITIES.filter((a) => property?.amenities?.includes(a.key)),
    [property]
  )

  const themeVars = useMemo(
    () => stayThemeVars(property.accent_color),
    [property.accent_color]
  )

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

  // Номерата на секциите следват реда, в който наистина се показват.
  let n = 0
  const num = () => String(++n).padStart(2, '0')
  const numDesc = description ? num() : null
  const numAmenities = selectedAmenities.length > 0 ? num() : null
  const numAvail = num()
  const numRules = num()
  const numMap = hasLocation ? num() : null
  const numReviews = reviews.length > 0 ? num() : null

  // Лентата се показва само когато е сигурно, че hero-то и формата са извън екрана (без мигване при зареждане).
  const showBar = basePrice > 0 && heroVisible === false && quoteVisible === false

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

      <div ref={heroWatch}>
        <StayHero
          property={property}
          hero={items[0] ?? null}
          photoCount={items.length}
          facts={factsLine}
          basePrice={basePrice}
          lang={lang}
          canToggleLang={Boolean(property.public_description_en && property.public_description)}
          onToggleLang={() => setLang((l) => (l === 'bg' ? 'en' : 'bg'))}
          onOpenGallery={() => setLightbox(0)}
          onCheckDates={scrollToQuote}
        />
      </div>

      <Gallery items={items} alt={property.name} onOpen={setLightbox} />

      <main id="stay-main" className="stay-shell">
        {/* Описание */}
        {description && (
          <Reveal as="section" className="stay-block">
            <h2 className="stay-h2">
              <span className="stay-kicker">{numDesc}</span>
              За имота
            </h2>
            <p className="stay-prose">{visibleDescription}</p>
            {showDescToggle && (
              <p style={{ margin: '14px 0 0' }}>
                <button type="button" onClick={() => setDescExpanded((v) => !v)} className="stay-link">
                  {descExpanded ? 'Покажи по-малко' : 'Прочети повече'}
                </button>
              </p>
            )}
          </Reveal>
        )}

        {/* Удобства */}
        {selectedAmenities.length > 0 && (
          <Reveal as="section" className="stay-block">
            <h2 className="stay-h2">
              <span className="stay-kicker">{numAmenities}</span>
              Удобства
            </h2>
            <ul className="stay-list">
              {visibleAmenities.map((a) => {
                const Icon = AMENITY_ICONS[a.key] ?? CheckCircle2
                return (
                  <li key={a.key}>
                    <Icon className="h-[18px] w-[18px]" strokeWidth={1.5} />
                    {a.label}
                  </li>
                )
              })}
            </ul>
            {selectedAmenities.length > 8 && (
              <p style={{ margin: '16px 0 0' }}>
                <button type="button" onClick={() => setAmenitiesExpanded((v) => !v)} className="stay-link">
                  {amenitiesExpanded ? 'Скрий' : `Виж всички (${selectedAmenities.length})`}
                </button>
              </p>
            )}
          </Reveal>
        )}

        {/* Наличност */}
        <Reveal as="section" className="stay-block">
          <h2 className="stay-h2">
            <span className="stay-kicker">{numAvail}</span>
            Наличност
          </h2>
          <AvailabilityCalendar loadBusy={loadBusy} />
        </Reveal>

        {/* Проверка на цена, заявка, връзка — на голям екран е залепена отстрани */}
        <aside id="quote-section" ref={quoteWatch} className="stay-booking">
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
                <h2>Провери цена и наличност</h2>
                <form onSubmit={handleQuote} className="stay-stack" noValidate>
                  <div className="stay-grid2">
                    <Field label="Настаняване">
                      <input
                        className="stay-input"
                        type="date"
                        min={todayISO()}
                        value={checkIn}
                        onChange={(e) => setCheckIn(e.target.value)}
                      />
                    </Field>
                    <Field label="Напускане">
                      <input
                        className="stay-input"
                        type="date"
                        min={checkIn || todayISO()}
                        value={checkOut}
                        onChange={(e) => setCheckOut(e.target.value)}
                      />
                    </Field>
                  </div>
                  <Field label="Брой гости">
                    <input
                      className="stay-input"
                      type="number"
                      min={1}
                      max={property.max_guests}
                      value={guests}
                      onChange={(e) => setGuests(e.target.value)}
                    />
                  </Field>
                  {quoteError && <Note kind="error">{quoteError}</Note>}
                  <button type="submit" disabled={quoting} className="stay-btn stay-btn--block">
                    {quoting && <Loader2 className="h-4 w-4 animate-spin" />}
                    Провери цена
                  </button>
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
                  <p className="stay-muted" style={{ margin: '-6px 0 16px', fontSize: 14 }}>
                    Това е заявка, не плащане. Собственикът ще се свърже с вас за потвърждение.
                  </p>
                  <form onSubmit={handleSubmitRequest} className="stay-stack" noValidate>
                    {sendError && <Note kind="error">{sendError}</Note>}
                    <Field label="Име" required>
                      <input
                        className="stay-input"
                        value={guestName}
                        onChange={(e) => setGuestName(e.target.value)}
                        placeholder="Иван Иванов"
                        autoComplete="name"
                      />
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
                      <textarea
                        className="stay-input"
                        rows={3}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        style={{ resize: 'vertical' }}
                      />
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
            <div className="stay-contact">
              {channels.map((ch, i) => {
                const Icon = CHANNEL_ICONS[ch.type] ?? MessageCircle
                const href = channelHref(ch.type, ch.value)
                return (
                  <a
                    key={i}
                    href={href ?? undefined}
                    target={href?.startsWith('http') ? '_blank' : undefined}
                    rel="noreferrer"
                  >
                    <Icon className="h-4 w-4" strokeWidth={1.6} />
                    {channelLabel(ch.type)}
                  </a>
                )
              })}
            </div>
          )}
        </aside>

        {/* Правила */}
        <Reveal as="section" className="stay-block">
          <h2 className="stay-h2">
            <span className="stay-kicker">{numRules}</span>
            Правила
          </h2>
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
                <dd style={{ font: '500 16px/1.6 var(--stay-body)', whiteSpace: 'pre-line' }}>{property.house_rules}</dd>
              </div>
            )}
          </dl>
        </Reveal>

        {/* Местоположение */}
        {hasLocation && (
          <Reveal as="section" className="stay-block">
            <h2 className="stay-h2">
              <span className="stay-kicker">{numMap}</span>
              Местоположение
            </h2>
            <LazyMap lat={property.public_lat} lng={property.public_lng} showCircle height={280} />
            <p className="stay-muted" style={{ margin: '12px 0 0', fontSize: 13 }}>
              Показаната зона е приблизителна. Точният адрес се предоставя след потвърждение на резервацията.
            </p>
          </Reveal>
        )}

        {/* Отзиви — само ако има реални */}
        {reviews.length > 0 && (
          <Reveal as="section" className="stay-block">
            <h2 className="stay-h2">
              <span className="stay-kicker">{numReviews}</span>
              Какво казват гостите
            </h2>
            {reviews.map((r) => (
              <figure key={r.id} className="stay-review">
                <blockquote>{r.comment}</blockquote>
                <figcaption>
                  {r.guest_name}
                  <span className="stay-stars" role="img" aria-label={`${r.rating} от 5 звезди`}>
                    {Array.from({ length: r.rating }).map((_, i) => (
                      <Star key={i} className="h-3.5 w-3.5 fill-current" strokeWidth={1.5} />
                    ))}
                  </span>
                </figcaption>
              </figure>
            ))}
          </Reveal>
        )}
      </main>

      <footer className="stay-foot">Изготвено със StayFlow</footer>

      {/* Залепена лента на телефона — показва се, когато hero-то и формата са извън екрана */}
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
