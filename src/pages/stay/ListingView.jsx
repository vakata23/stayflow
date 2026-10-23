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
import { listedAmenities } from '../../lib/amenities'
import { stayThemeVars } from '../../lib/accentColor'
import { useStayLang, serverErrorKey } from './i18n'
import { lowestPrice, uncoveredDays, seasonRangeLabel } from '../../lib/seasonLogic'
import LangSwitch from './LangSwitch'
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
  const { t } = useStayLang()
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
      <span aria-live="polite">{copied ? t('shareCopied') : t('share')}</span>
    </button>
  )
}

/**
 * Изгледът на обявата — общ за публичната страница (PublicStay, данни от
 * public_property) и за „Преглед като гост“ на собственика (ListingPreview,
 * данни от собствения му имот, още непубликуван). В preview режим няма
 * проверка на цена и заявка — те минават само през публикуван slug.
 * Показва се само онова, което собственикът е попълнил: празна секция няма.
 */
export default function ListingView({ property, reviews, seasons = [], slug, loadBusy, preview = false }) {
  const { t, lang, locale } = useStayLang()
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

    if (!checkIn || !checkOut) return setQuoteError(t('errPickDates'))
    if (checkOut <= checkIn) return setQuoteError(t('errDateOrder'))

    setQuoting(true)
    const { data, error } = await supabase.rpc('quote_stay', {
      p_slug: slug,
      p_check_in: checkIn,
      p_check_out: checkOut,
      p_guests: Number(guests),
    })
    setQuoting(false)

    if (error || !data || data.length === 0) {
      return setQuoteError(t('errQuote'))
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

    if (!guestName.trim()) return setSendError(t('errName'))
    if (!guestPhone.trim() && !guestEmail.trim()) {
      return setSendError(t('errContact'))
    }
    if (guestPhone.trim() && !isValidPhone(guestPhone.trim())) {
      return setSendError(t('errPhone'))
    }
    if (guestEmail.trim() && !isValidEmail(guestEmail.trim())) {
      return setSendError(t('errEmail'))
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
        throw new Error(result.error || '')
      }
      setSent(true)
    } catch (err) {
      // Сървърът отговаря на български — показваме превода на познатото съобщение, а не чуждия текст.
      setSendError(t(serverErrorKey(err.message)))
    } finally {
      setSending(false)
    }
  }

  // Собственикът пише описание на български и (по избор) на английски. Гост на друг език получава английското,
  // а ако него го няма — българското; когато езикът на текста е различен от езика на страницата, го казваме.
  const { description, descLang } = useMemo(() => {
    if (!property) return { description: '', descLang: null }
    const bgText = property.public_description || ''
    const enText = property.public_description_en || ''
    const order = lang === 'bg' ? [['bg', bgText], ['en', enText]] : [['en', enText], ['bg', bgText]]
    const [code, text] = order.find(([, v]) => v) ?? [null, '']
    return { description: text, descLang: text ? code : null }
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
  // Заглавната цена е най-ниската, която гостът може да види — основната или на някой сезон.
  const fromPrice = lowestPrice(basePrice, seasons)
  const sortedSeasons = useMemo(
    () => [...seasons].sort((a, b) => a.start_month - b.start_month || a.start_day - b.start_day),
    [seasons]
  )
  const otherDaysLeft = basePrice > 0 && uncoveredDays(seasons) > 0
  const showDescToggle = description.length > DESCRIPTION_PREVIEW_LEN
  const visibleDescription =
    !descExpanded && showDescToggle ? description.slice(0, DESCRIPTION_PREVIEW_LEN).trimEnd() + '…' : description
  const visibleAmenities = amenitiesExpanded ? selectedAmenities : selectedAmenities.slice(0, 8)
  const hasLocation = property.public_lat != null && property.public_lng != null

  const factsLine = [
    t('guestsUpTo', { n: property.max_guests }),
    property.bedrooms ? t('bedrooms', { n: property.bedrooms }) : null,
    property.beds ? t('beds', { n: property.beds }) : null,
    property.bathrooms ? t('bathrooms', { n: Number(property.bathrooms) }) : null,
    property.area_m2 ? t('area', { n: property.area_m2 }) : null,
  ].filter(Boolean)

  const policy = ['flexible', 'moderate', 'strict'].includes(property.cancellation_policy) ? property.cancellation_policy : null
  const highlights = [
    property.checkin_time && {
      Icon: DoorOpen,
      title: t('checkInAfter', { time: property.checkin_time }),
      text: property.checkout_time ? t('checkOutBy', { time: property.checkout_time }) : null,
    },
    policy && { Icon: CalendarCheck, title: t(`cancel.${policy}.badge`), text: t(`cancel.${policy}.hint`) },
    property.city && { Icon: MapPin, title: property.city, text: t('exactAddress') },
  ].filter(Boolean)

  const reviewCount = reviews.length
  const avg = reviewCount ? reviews.reduce((s, r) => s + Number(r.rating || 0), 0) / reviewCount : null

  // Лентата се показва само когато е сигурно, че заглавието/снимките и картата за резервация са извън екрана.
  const showBar = fromPrice > 0 && headVisible === false && quoteVisible === false

  return (
    <div className="stay" style={themeVars}>
      <a href="#stay-main" className="stay-skip">
        {t('skip')}
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
            <LangSwitch />
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
            <h2 className="stay-sub">{property.city ? t('entire', { city: property.city }) : t('entireNoCity')}</h2>
            <p className="stay-facts">
              {factsLine.map((f) => (
                <span key={f}>{f}</span>
              ))}
            </p>
            {policy && (
              <ul className="stay-badges">
                <li className="stay-badge stay-badge--accent">{t(`cancel.${policy}.badge`)}</li>
              </ul>
            )}
            {avg != null && (
              <div className="stay-rating">
                <span className="stay-rating__num">{avg.toFixed(1)}</span>
                <span className="stay-rating__meta">
                  <span className="stay-stars" role="img" aria-label={t('ratingAria', { avg: avg.toFixed(1) })}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className="h-4 w-4" strokeWidth={1.6} fill={i < Math.round(avg) ? 'currentColor' : 'none'} />
                    ))}
                  </span>
                  <a href="#reviews">{t('reviewsCount', { n: reviewCount })}</a>
                </span>
              </div>
            )}
          </section>

          {highlights.length > 0 && (
            <section className="stay-sec" style={{ order: 2 }} aria-label={t('highlightsLabel')}>
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
              <h2 className="stay-h2">{t('about')}</h2>
              <p className="stay-prose">{visibleDescription}</p>
              {showDescToggle && (
                <p style={{ margin: '14px 0 0' }}>
                  <button type="button" onClick={() => setDescExpanded((v) => !v)} className="stay-link">
                    {descExpanded ? t('showLess') : t('readMore')}
                  </button>
                </p>
              )}
              {descLang !== lang && (
                <p className="stay-muted" style={{ margin: '14px 0 0', fontSize: 14 }}>
                  {t(descLang === 'bg' ? 'descNoteBg' : 'descNoteEn')}
                </p>
              )}
            </section>
          )}

          {/* Удобства */}
          {selectedAmenities.length > 0 && (
            <section className="stay-sec" style={{ order: 4 }}>
              <h2 className="stay-h2">{t('amenitiesTitle')}</h2>
              <ul className="stay-amenities">
                {visibleAmenities.map((a) => {
                  const Icon = AMENITY_ICONS[a.key] ?? CheckCircle2
                  return (
                    <li key={a.key}>
                      <Icon className="h-6 w-6" strokeWidth={1.5} aria-hidden="true" />
                      {t(`amenity.${a.key}`)}
                    </li>
                  )
                })}
              </ul>
              {selectedAmenities.length > 8 && (
                <button type="button" onClick={() => setAmenitiesExpanded((v) => !v)} className="stay-btn-outline" aria-expanded={amenitiesExpanded}>
                  {amenitiesExpanded ? t('showLess') : t('showAllAmenities', { n: selectedAmenities.length })}
                </button>
              )}
            </section>
          )}

          {/* Наличност */}
          <section className="stay-sec" style={{ order: 5 }}>
            <h2 className="stay-h2">{t('availability')}</h2>
            <AvailabilityCalendar loadBusy={loadBusy} />
          </section>

          {/* Цени по сезон — само ако собственикът е задал сезони */}
          {sortedSeasons.length > 0 && (
            <section className="stay-sec" style={{ order: 5 }}>
              <h2 className="stay-h2">{t('seasonsTitle')}</h2>
              <ul className="stay-seasons">
                {sortedSeasons.map((s, i) => (
                  <li key={`${s.start_month}-${s.start_day}-${i}`}>
                    <div>
                      <b>{s.name || seasonRangeLabel(s, locale)}</b>
                      <span>
                        {s.name ? seasonRangeLabel(s, locale) : null}
                        {Number(s.min_nights) > 1 ? `${s.name ? ' · ' : ''}${t('seasonMinStay', { nights: t('nights', { n: s.min_nights }) })}` : null}
                      </span>
                    </div>
                    <p>
                      <b>{shortPrice(s.price_per_night)}</b> {t('perNight')}
                    </p>
                  </li>
                ))}
                {otherDaysLeft && (
                  <li>
                    <div>
                      <b>{t('seasonOtherDates')}</b>
                    </div>
                    <p>
                      <b>{shortPrice(basePrice)}</b> {t('perNight')}
                    </p>
                  </li>
                )}
              </ul>
              <p className="stay-muted" style={{ margin: '12px 0 0', fontSize: 14 }}>
                {t('seasonsNote')}
              </p>
            </section>
          )}

          {/* Правила */}
          <section className="stay-sec" style={{ order: 7 }}>
            <h2 className="stay-h2">{t('rulesTitle')}</h2>
            <dl className="stay-rules">
              <div>
                <dt>{t('ruleCheckIn')}</dt>
                <dd>{t('ruleCheckInValue', { time: property.checkin_time })}</dd>
              </div>
              <div>
                <dt>{t('ruleCheckOut')}</dt>
                <dd>{t('ruleCheckOutValue', { time: property.checkout_time })}</dd>
              </div>
              <div>
                <dt>{t('ruleSmoking')}</dt>
                <dd>{property.smoking_allowed ? t('smokingYes') : t('smokingNo')}</dd>
              </div>
              <div>
                <dt>{t('ruleParties')}</dt>
                <dd>{property.parties_allowed ? t('partiesYes') : t('partiesNo')}</dd>
              </div>
              {policy && (
                <div className="wide">
                  <dt>{t('ruleCancellation')}</dt>
                  <dd>{t(`cancel.${policy}.rule`)}</dd>
                </div>
              )}
              {property.house_rules && (
                <div className="wide">
                  <dt>{t('ruleHouse')}</dt>
                  <dd className="plain">{property.house_rules}</dd>
                </div>
              )}
            </dl>
          </section>

          {/* Местоположение */}
          {hasLocation && (
            <section className="stay-sec" style={{ order: 8 }}>
              <h2 className="stay-h2">{t('whereTitle')}</h2>
              <LazyMap lat={property.public_lat} lng={property.public_lng} showCircle height={320} title={t('mapTitle')} />
              <p className="stay-muted" style={{ margin: '12px 0 0', fontSize: 14 }}>
                {t('mapNote')}
              </p>
            </section>
          )}

          {/* Отзиви — само ако има реални */}
          {reviewCount > 0 && (
            <section id="reviews" className="stay-sec" style={{ order: 9 }}>
              <h2 className="stay-h2" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Star className="h-5 w-5" fill="currentColor" strokeWidth={1.5} aria-hidden="true" />
                {avg.toFixed(1)} · {t('reviewsCount', { n: reviewCount })}
              </h2>
              <div className="stay-reviews">
                {reviews.map((r) => (
                  <figure key={r.id} className="stay-review">
                    <figcaption>
                      {r.guest_name}
                      <span className="stay-stars" role="img" aria-label={t('starsAria', { n: r.rating })}>
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
                  {fromPrice > 0 ? (
                    <>
                      <small>{t('priceFrom')}</small>
                      <b>{shortPrice(fromPrice)}</b>
                      <span>{t('perNight')}</span>
                    </>
                  ) : (
                    <b>{t('checkPrice')}</b>
                  )}
                </p>
                <form onSubmit={handleQuote} className="stay-stack" noValidate>
                  <div className="stay-dates">
                    <Field label={t('dateCheckIn')}>
                      <input className="stay-input" type="date" min={todayISO()} value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
                    </Field>
                    <Field label={t('dateCheckOut')}>
                      <input className="stay-input" type="date" min={checkIn || todayISO()} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
                    </Field>
                    <Field label={t('guestsLabel')}>
                      <input className="stay-input" type="number" min={1} max={property.max_guests} value={guests} onChange={(e) => setGuests(e.target.value)} />
                    </Field>
                  </div>
                  {quoteError && <Note kind="error">{quoteError}</Note>}
                  <button type="submit" disabled={quoting} className="stay-btn stay-btn--block">
                    {quoting && <Loader2 className="h-4 w-4 animate-spin" />}
                    {t('checkPriceBtn')}
                  </button>
                  <p className="stay-fine">{t('noCharge')}</p>
                </form>

                {quote && (
                  <div className="stay-quote">
                    {!quote.is_available ? (
                      <Note kind="error">{t('quoteTaken')}</Note>
                    ) : !quote.fits_guests ? (
                      <Note kind="error">{t('quoteMaxGuests', { n: property.max_guests })}</Note>
                    ) : quote.nights < quote.min_nights ? (
                      <Note kind="error">{t('quoteMinStay', { nights: t('nights', { n: quote.min_nights }) })}</Note>
                    ) : Number(quote.total) <= 0 ? (
                      <Note kind="error">{t('quoteNoPrice')}</Note>
                    ) : (
                      <Note kind="success">{t('quoteOk')}</Note>
                    )}

                    <div className="stay-line">
                      <span>{t('stayLine', { nights: t('nights', { n: quote.nights }) })}</span>
                      <span>{formatMoney(quote.accommodation_total)}</span>
                    </div>
                    {Number(quote.cleaning_fee) > 0 && (
                      <div className="stay-line">
                        <span>{t('cleaningFee')}</span>
                        <span>{formatMoney(quote.cleaning_fee)}</span>
                      </div>
                    )}
                    <div className="stay-total">
                      <span>{t('total')}</span>
                      <span>{formatMoney(quote.total)}</span>
                    </div>
                    {Number(quote.tourist_tax) > 0 && (
                      <p className="stay-muted" style={{ margin: 0, fontSize: 13 }}>
                        {t('touristTax', { amount: formatMoney(quote.tourist_tax) })}
                      </p>
                    )}
                    <p className="stay-muted" style={{ margin: 0, fontSize: 13 }}>
                      {t('deposit', { amount: formatMoney(quote.deposit) })}
                    </p>
                  </div>
                )}
              </div>

              {/* Заявка за резервация */}
              {canRequest && !sent && (
                <div className="stay-card">
                  <h2>{t('requestTitle')}</h2>
                  <p className="stay-muted" style={{ margin: '-4px 0 16px', fontSize: 14 }}>
                    {t('requestNote')}
                  </p>
                  <form onSubmit={handleSubmitRequest} className="stay-stack" noValidate>
                    {sendError && <Note kind="error">{sendError}</Note>}
                    <Field label={t('fieldName')} required>
                      <input className="stay-input" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder={t('placeholderName')} autoComplete="name" />
                    </Field>
                    <div className="stay-grid2">
                      <Field label={t('fieldPhone')}>
                        <input
                          className="stay-input"
                          type="tel"
                          inputMode="tel"
                          value={guestPhone}
                          onChange={(e) => setGuestPhone(e.target.value)}
                          placeholder={t('placeholderPhone')}
                          autoComplete="tel"
                        />
                      </Field>
                      <Field label={t('fieldEmail')}>
                        <input
                          className="stay-input"
                          type="email"
                          value={guestEmail}
                          onChange={(e) => setGuestEmail(e.target.value)}
                          placeholder={t('placeholderEmail')}
                          autoComplete="email"
                        />
                      </Field>
                    </div>
                    <Field label={t('fieldMessage')}>
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
                      {t('requestBtn')}
                    </button>
                  </form>
                </div>
              )}

              {sent && (
                <div className="stay-card" style={{ textAlign: 'center' }} role="status">
                  <CheckCircle2 className="mx-auto h-8 w-8" style={{ color: 'var(--stay-accent-text)' }} strokeWidth={1.5} />
                  <h2 style={{ margin: '10px 0 4px' }}>{t('sentTitle')}</h2>
                  <p className="stay-muted" style={{ margin: 0, fontSize: 15 }}>
                    {t('sentText')}
                  </p>
                </div>
              )}
            </>
          )}

          {channels.length > 0 && (
            <div>
              <p className="stay-contact-title">{t('contactTitle')}</p>
              <div className="stay-contact" style={{ justifyContent: 'center' }}>
                {channels.map((ch, i) => {
                  const Icon = CHANNEL_ICONS[ch.type] ?? MessageCircle
                  const href = channelHref(ch.type, ch.value)
                  return (
                    <a key={i} href={href ?? undefined} target={href?.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
                      <Icon className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" />
                      {t(`channel.${ch.type}`) === `channel.${ch.type}` ? channelLabel(ch.type) : t(`channel.${ch.type}`)}
                    </a>
                  )
                })}
              </div>
            </div>
          )}
        </aside>
      </main>

      <footer className="stay-foot">{t('footer')}</footer>

      {/* Залепена лента на телефона — показва се, когато заглавието и картата за резервация са извън екрана */}
      {fromPrice > 0 && (
        <div className={`stay-bar ${showBar ? 'is-on' : ''}`} aria-hidden={!showBar}>
          <div>
            <b>{shortPrice(fromPrice)}</b>
            <small>{t('barNight')}</small>
          </div>
          <button type="button" className="stay-btn" onClick={scrollToQuote} tabIndex={showBar ? 0 : -1}>
            {t('barDates')}
          </button>
        </div>
      )}

      {lightbox !== null && items.length > 0 && (
        <Lightbox photos={items} index={lightbox} alt={property.name} onClose={() => setLightbox(null)} onChange={setLightbox} />
      )}
    </div>
  )
}
