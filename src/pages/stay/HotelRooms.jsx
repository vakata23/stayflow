import { useMemo, useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { todayISO } from '../../lib/dates'
import { formatMoney } from '../../lib/money'
import { isValidPhone, isValidEmail } from '../../lib/bookingRequestServer'
import { searchHotelRooms } from '../../lib/hotel'
import { canRequestType } from '../../lib/hotelLogic'
import { withLinks } from '../../lib/legalI18n'
import { useStayLang, serverErrorKey } from './i18n'

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

/**
 * Страницата на хотел: гостът избира дати → вижда свободните стаи по вид и цена → избира вид и изпраща заявка.
 * Заявката отива към конкретна свободна стая (адресът ѝ идва от сървъра и не се показва на госта).
 */
export default function HotelRooms({ slug, types }) {
  const { t } = useStayLang()
  const maxGuests = useMemo(() => Math.max(1, ...types.map((x) => Number(x.max_guests) || 1)), [types])
  const cheapest = useMemo(() => {
    const prices = types.map((x) => Number(x.price_from)).filter((n) => n > 0)
    return prices.length ? Math.min(...prices) : 0
  }, [types])

  const [checkIn, setCheckIn] = useState('')
  const [checkOut, setCheckOut] = useState('')
  const [guests, setGuests] = useState(2)
  const [results, setResults] = useState(null)
  const [searched, setSearched] = useState(null) // за какви дати са резултатите
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(null)
  const [chosen, setChosen] = useState(null)

  const [guestName, setGuestName] = useState('')
  const [guestPhone, setGuestPhone] = useState('')
  const [guestEmail, setGuestEmail] = useState('')
  const [message, setMessage] = useState('')
  const [company, setCompany] = useState('') // honeypot — трябва да остане празно
  const [consent, setConsent] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState(null)
  const [sent, setSent] = useState(false)

  const nights = checkIn && checkOut && checkOut > checkIn ? Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000) : 0

  const search = async (e) => {
    e.preventDefault()
    setSearchError(null)
    setResults(null)
    setChosen(null)
    setSent(false)
    if (!checkIn || !checkOut) return setSearchError(t('errPickDates'))
    if (checkOut <= checkIn) return setSearchError(t('errDateOrder'))
    setSearching(true)
    try {
      const rows = await searchHotelRooms(slug, checkIn, checkOut, guests)
      setResults(rows)
      setSearched({ checkIn, checkOut, guests: Number(guests), nights })
    } catch {
      setSearchError(t('errQuote'))
    } finally {
      setSearching(false)
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    setSendError(null)
    if (!guestName.trim()) return setSendError(t('errName'))
    if (!guestPhone.trim() && !guestEmail.trim()) return setSendError(t('errContact'))
    if (guestPhone.trim() && !isValidPhone(guestPhone.trim())) return setSendError(t('errPhone'))
    if (guestEmail.trim() && !isValidEmail(guestEmail.trim())) return setSendError(t('errEmail'))
    if (!consent) return setSendError(t('errConsent'))
    setSending(true)
    try {
      const res = await fetch('/api/booking-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: chosen.room_slug,
          check_in: searched.checkIn,
          check_out: searched.checkOut,
          num_guests: searched.guests,
          guest_name: guestName.trim(),
          guest_phone: guestPhone.trim(),
          guest_email: guestEmail.trim(),
          message: [chosen.room_type, message.trim()].filter(Boolean).join(' — '),
          company,
        }),
      })
      const result = await res.json()
      if (!res.ok || !result.ok) throw new Error(result.error || '')
      setSent(true)
    } catch (err) {
      setSendError(t(serverErrorKey(err.message)))
    } finally {
      setSending(false)
    }
  }

  const anyFree = results?.some((r) => canRequestType(r, searched?.nights ?? 0))

  return (
    <>
      <div className="stay-card">
        <h2>{t('hotel.title')}</h2>
        <p className="stay-price">
          {cheapest > 0 && (
            <>
              <small>{t('priceFrom')}</small>
              <b>{formatMoney(cheapest).replace(/\.00 €$/, ' €')}</b>
              <span>{t('perNight')}</span>
            </>
          )}
        </p>
        <p className="stay-muted" style={{ margin: '0 0 14px', fontSize: 14 }}>
          {t('hotel.intro')}
        </p>
        <form onSubmit={search} className="stay-stack" noValidate>
          <div className="stay-dates">
            <Field label={t('dateCheckIn')}>
              <input className="stay-input" type="date" min={todayISO()} value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
            </Field>
            <Field label={t('dateCheckOut')}>
              <input className="stay-input" type="date" min={checkIn || todayISO()} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
            </Field>
            <Field label={t('guestsLabel')}>
              <input className="stay-input" type="number" min={1} max={maxGuests} value={guests} onChange={(e) => setGuests(e.target.value)} />
            </Field>
          </div>
          {searchError && <Note kind="error">{searchError}</Note>}
          <button type="submit" disabled={searching} className="stay-btn stay-btn--block">
            {searching && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('hotel.search')}
          </button>
          <p className="stay-fine">{t('noCharge')}</p>
        </form>

        {results && (
          <ul className="stay-rooms" aria-label={t('hotel.title')}>
            {results.length === 0 || !anyFree ? (
              <li>
                <Note kind="error">{t('hotel.noRooms')}</Note>
              </li>
            ) : null}
            {results.map((r) => {
              const can = canRequestType(r, searched.nights)
              const isChosen = chosen?.room_type === r.room_type
              return (
                <li key={r.room_type} className={`stay-room${isChosen ? ' stay-room--on' : ''}${can ? '' : ' stay-room--off'}`}>
                  <div className="stay-room-head">
                    <b translate="no">{r.room_type}</b>
                    <span className="stay-muted">{t('guestsUpTo', { n: r.max_guests })}</span>
                  </div>
                  {r.fits_guests === false ? (
                    <p className="stay-muted stay-room-note">{t('quoteMaxGuests', { n: r.max_guests })}</p>
                  ) : r.rooms_free === 0 ? (
                    <p className="stay-muted stay-room-note">{t('hotel.none')}</p>
                  ) : searched.nights < (r.min_nights ?? 1) ? (
                    <p className="stay-muted stay-room-note">{t('quoteMinStay', { nights: t('nights', { n: r.min_nights }) })}</p>
                  ) : (
                    <>
                      <div className="stay-line">
                        <span>{t('stayLine', { nights: t('nights', { n: r.nights }) })}</span>
                        <span>{formatMoney(r.accommodation_total)}</span>
                      </div>
                      {Number(r.cleaning_fee) > 0 && (
                        <div className="stay-line">
                          <span>{t('cleaningFee')}</span>
                          <span>{formatMoney(r.cleaning_fee)}</span>
                        </div>
                      )}
                      <div className="stay-total">
                        <span>{t('total')}</span>
                        <span>{formatMoney(r.total)}</span>
                      </div>
                      <p className="stay-muted stay-room-note">{t('hotel.free', { n: r.rooms_free })}</p>
                      <button
                        type="button"
                        className="stay-btn stay-btn--block"
                        aria-pressed={isChosen}
                        onClick={() => {
                          setChosen(r)
                          setSent(false)
                          setSendError(null)
                        }}
                      >
                        {isChosen ? t('hotel.chosen') : t('hotel.choose')}
                      </button>
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {chosen && !sent && (
        <div className="stay-card">
          <h2>{t('requestTitle')}</h2>
          <p className="stay-muted" style={{ margin: '-4px 0 16px', fontSize: 14 }}>
            <span translate="no">{chosen.room_type}</span> · {searched.checkIn} → {searched.checkOut} · {formatMoney(chosen.total)}
          </p>
          <form onSubmit={submit} className="stay-stack" noValidate>
            {sendError && <Note kind="error">{sendError}</Note>}
            <Field label={t('fieldName')} required>
              <input className="stay-input" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder={t('placeholderName')} autoComplete="name" />
            </Field>
            <div className="stay-grid2">
              <Field label={t('fieldPhone')}>
                <input className="stay-input" type="tel" inputMode="tel" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} placeholder={t('placeholderPhone')} autoComplete="tel" />
              </Field>
              <Field label={t('fieldEmail')}>
                <input className="stay-input" type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} placeholder={t('placeholderEmail')} autoComplete="email" />
              </Field>
            </div>
            <Field label={t('fieldMessage')}>
              <textarea className="stay-input" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} style={{ resize: 'vertical' }} />
            </Field>
            <label className="stay-consent">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => {
                  setConsent(e.target.checked)
                  setSendError(null)
                }}
              />
              <span>
                {withLinks(t('consentRequest', { privacy: '{privacy}' }), {
                  privacy: (
                    <a href="/privacy" target="_blank" rel="noopener noreferrer">
                      {t('legalPrivacy')}
                    </a>
                  ),
                })}
              </span>
            </label>
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
  )
}
