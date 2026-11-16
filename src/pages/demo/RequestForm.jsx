import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, MessageCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { BANDS, PLANS, PLAN_KEYS, TRIAL_DAYS, planForBand, validateAccessRequest, requestErrorMessage } from '../../lib/accessLogic'
import { viberUrl, mailtoUrl, contactPhone } from '../../lib/contact'

/**
 * Форма „Заяви достъп“ — на началната страница и на /access. Заявката отива през request_access() (миграция 016),
 * която я записва за екрана „Клиенти“. Скрито поле „website“ е капан за ботове; съгласие е задължително.
 * Ако базата още няма функцията (016 непусната), показваме честно съобщение и връзките за директна връзка.
 */
export default function RequestForm({ defaultPlan = '', idPrefix = 'rf' }) {
  const [v, setV] = useState({ name: '', phone: '', email: '', band: '', plan: defaultPlan, note: '', consent: false, trial: true, website: '' })
  const [errors, setErrors] = useState({})
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)
  const [serverError, setServerError] = useState(null)
  const alertRef = useRef(null)

  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setV((s) => ({ ...s, [key]: value }))
    if (errors[key] || errors.contact) setErrors((er) => ({ ...er, [key]: undefined, contact: key === 'phone' || key === 'email' ? undefined : er.contact }))
    setServerError(null)
  }

  const submit = async (e) => {
    e.preventDefault()
    const { errors: errs, values } = validateAccessRequest(v)
    setErrors(errs)
    if (Object.keys(errs).length) {
      // фокус и превъртане към ПЪРВОТО грешно поле — иначе на телефон грешката остава извън екрана
      const first = ['name', 'phone', 'contact', 'email', 'note', 'consent'].find((k) => errs[k])
      const target = document.getElementById(`${idPrefix}-${first === 'contact' ? 'phone' : first}`)
      target?.focus()
      target?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
      return
    }
    setSending(true)
    setServerError(null)
    const { error } = await supabase.rpc('request_access', {
      p_name: values.name,
      p_phone: values.phone,
      p_email: values.email,
      p_band: values.band,
      p_plan: values.plan ?? planForBand(values.band),
      p_note: values.note,
      p_consent: true,
      p_hp: v.website,
      p_trial: !!v.trial,
    })
    setSending(false)
    if (error) {
      setServerError(requestErrorMessage(error.message))
      setTimeout(() => alertRef.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }), 50)
      return
    }
    setDone(true)
  }

  if (done) {
    return (
      <div className="lp-done" role="status">
        <CheckCircle2 aria-hidden="true" />
        <h3>Получихме заявката ви</h3>
        <p>
          Ще се свържем с вас лично и ще ви отворим достъпа{v.trial ? ` — първо за ${TRIAL_DAYS} дни безплатна проба` : ''}. Ако бързате, пишете ни директно:
        </p>
        <div className="lp-row">
          {viberUrl && (
            <a className="stay-btn" href={viberUrl}>
              <MessageCircle aria-hidden="true" width="18" height="18" /> Viber {contactPhone}
            </a>
          )}
          <Link className="stay-btn-outline" to="/">
            Към началото
          </Link>
        </div>
      </div>
    )
  }

  const id = (n) => `${idPrefix}-${n}`
  const err = (k) => errors[k] && (
    <p className="lp-err" id={id(k + '-err')} role="alert">
      {errors[k]}
    </p>
  )

  return (
    <form className="lp-form" onSubmit={submit} noValidate>
      {serverError && (
        <p className="lp-alert" role="alert" ref={alertRef}>
          {serverError}
          {viberUrl && (
            <>
              {' '}
              <a href={viberUrl}>Viber {contactPhone}</a>
              {mailtoUrl() && (
                <>
                  {' · '}
                  <a href={mailtoUrl('Заявка за достъп до StayFlow')}>имейл</a>
                </>
              )}
            </>
          )}
        </p>
      )}

      <div className="lp-field">
        <label htmlFor={id('name')}>Име</label>
        <input id={id('name')} value={v.name} onChange={set('name')} autoComplete="name" placeholder="Иван Иванов" aria-invalid={!!errors.name} aria-describedby={errors.name ? id('name-err') : undefined} maxLength={100} />
        {err('name')}
      </div>

      <div className="lp-two">
        <div className="lp-field">
          <label htmlFor={id('phone')}>Телефон / Viber</label>
          <input id={id('phone')} value={v.phone} onChange={set('phone')} type="tel" inputMode="tel" autoComplete="tel" placeholder="+359 888 123 456" aria-invalid={!!errors.phone} aria-describedby={errors.phone ? id('phone-err') : undefined} />
          {err('phone')}
        </div>
        <div className="lp-field">
          <label htmlFor={id('email')}>Имейл <span className="lp-opt">(по желание)</span></label>
          <input id={id('email')} value={v.email} onChange={set('email')} type="email" autoComplete="email" placeholder="ime@primer.bg" aria-invalid={!!errors.email} aria-describedby={errors.email ? id('email-err') : undefined} />
          {err('email')}
        </div>
      </div>
      {err('contact')}

      <div className="lp-two">
        <div className="lp-field">
          <label htmlFor={id('band')}>Колко имота имате?</label>
          <select id={id('band')} value={v.band} onChange={set('band')}>
            <option value="">Изберете</option>
            {BANDS.map((b) => (
              <option key={b.key} value={b.key}>
                {b.label}
              </option>
            ))}
          </select>
        </div>
        <div className="lp-field">
          <label htmlFor={id('plan')}>Пакет <span className="lp-opt">(по желание)</span></label>
          <select id={id('plan')} value={v.plan} onChange={set('plan')}>
            <option value="">Още не знам</option>
            {PLAN_KEYS.map((k) => (
              <option key={k} value={k}>
                {PLANS[k].name} — {PLANS[k].monthly} €/мес.
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="lp-field">
        <label htmlFor={id('note')}>Нещо, което да знаем <span className="lp-opt">(по желание)</span></label>
        <textarea id={id('note')} value={v.note} onChange={set('note')} rows={3} maxLength={520} placeholder="Например: имам 4 апартамента във Варна и ползвам Airbnb и Booking" />
        {err('note')}
      </div>

      {/* капан за ботове: човек не го вижда и не стига до него с Tab */}
      <div className="lp-hp" aria-hidden="true">
        <label htmlFor={id('website')}>Уебсайт</label>
        <input id={id('website')} value={v.website} onChange={set('website')} tabIndex={-1} autoComplete="off" />
      </div>

      <div className="lp-check">
        <input id={id('trial')} type="checkbox" checked={v.trial} onChange={set('trial')} />
        <label htmlFor={id('trial')}>Искам първо да опитам {TRIAL_DAYS} дни безплатно, без карта.</label>
      </div>

      <div className="lp-check">
        <input id={id('consent')} type="checkbox" checked={v.consent} onChange={set('consent')} aria-invalid={!!errors.consent} aria-describedby={errors.consent ? id('consent-err') : undefined} />
        <label htmlFor={id('consent')}>
          Съгласен съм да се свържете с мен по телефона или имейла, който оставих. Запознат съм с{' '}
          <Link to="/privacy" target="_blank" rel="noopener noreferrer">
            Политиката за поверителност
          </Link>
          .
        </label>
      </div>
      {err('consent')}

      <button type="submit" className="stay-btn stay-btn--block" disabled={sending}>
        {sending ? 'Изпращане…' : v.trial ? `Искам ${TRIAL_DAYS} дни безплатно` : 'Изпрати заявката'}
      </button>
      <p className="stay-fine">Без карта и без задължение. Свързваме се лично.</p>
    </form>
  )
}
