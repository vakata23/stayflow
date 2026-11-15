import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Check, MessageCircle } from 'lucide-react'
import { PLANS, PLAN_KEYS, yearlyPrice, FREE_MONTHS_YEARLY } from '../../lib/accessLogic'
import { PAINS, FEATURES, STEPS, PLAN_FEATURES, FAQ, TESTIMONIALS } from '../../lib/landingContent'
import { viberUrl, telUrl, mailtoUrl, contactPhone, contactEmail } from '../../lib/contact'
import { COMPANY } from '../../lib/legal'
import { useDocumentLang } from '../stay/i18n'
import DemoTour from './DemoTour'
import Calculator from './Calculator'
import RequestForm from './RequestForm'
import useWide from './useWide'
import '../stay/stay.css'
import './demo.css'
import './landing.css'

/** Началната страница „/“ за невлезли: полза → болки → какво получавате → сметка → цени → стъпки → екрани → въпроси → заявка. */
export default function Landing({ title, description }) {
  useDocumentLang()
  const wide = useWide('(min-width: 1000px)')
  useEffect(() => {
    const prevTitle = document.title
    const descEl = document.querySelector('meta[name="description"]')
    const prevDesc = descEl?.getAttribute('content') ?? null
    document.title = title
    if (descEl) descEl.setAttribute('content', description)
    return () => {
      document.title = prevTitle
      if (descEl && prevDesc !== null) descEl.setAttribute('content', prevDesc)
    }
  }, [title, description])

  return (
    <div className="stay demo lp">
      <a href="#lp-main" className="stay-skip">
        Към съдържанието
      </a>
      <header className="demo-top">
        <div className="stay-wrap demo-top__in">
          <Link to="/" className="demo-brand" aria-label="StayFlow">
            <img src="/brand/logo-horizontal.png" alt="" width="1100" height="241" />
          </Link>
          <nav className="demo-nav" aria-label="Вход и достъп">
            <a href="#ceni" className="demo-link lp-hide-s">
              Цени
            </a>
            <Link to="/login" className="demo-link">
              Вход
            </Link>
            <Link to="/access" className="stay-btn">
              Заяви достъп
            </Link>
          </nav>
        </div>
      </header>

      <main id="lp-main">
        {/* 1. Полза */}
        <section className="stay-wrap demo-hero lp-hero">
          <div className="demo-hero__text">
            <p className="demo-eyebrow">За имоти под наем</p>
            <h1>Резервациите от Airbnb и Booking на едно място — без двойни резервации</h1>
            <p>
              StayFlow събира в един календар резервациите от Airbnb, Booking и директните от гостите и смята колко печелите след комисионите.
              На български, от телефона ви.
            </p>
            <div className="demo-hero__row">
              <Link to="/access" className="stay-btn">
                Заяви достъп
              </Link>
              <a href="#tour" className="stay-btn-outline">
                Разгледай приложението
              </a>
            </div>
            <ul className="lp-trust">
              <li>Airbnb и Booking.com през iCal</li>
              <li>Български, гръцки, македонски</li>
              <li>Работи от телефона</li>
            </ul>
          </div>
          {wide ? (
            <div className="demo-hero__art tour-shots" aria-hidden="true">
              <div className="tour-win">
                <div className="tour-win__bar">
                  <i />
                  <i />
                  <i />
                </div>
                <img src="/demo/tour/desktop-calendar.webp" width="1440" height="900" alt="" decoding="async" fetchPriority="high" />
              </div>
              <div className="tour-phone">
                <img src="/demo/tour/phone-dashboard.webp" width="780" height="1688" alt="" decoding="async" />
              </div>
            </div>
          ) : null}
        </section>

        {/* 2. Болки */}
        <section className="demo-sec demo-sec--soft" aria-labelledby="lp-pains">
          <div className="stay-wrap">
            <h2 id="lp-pains">Познато ли ви е?</h2>
            <ul className="lp-pains">
              {PAINS.map((p, i) => (
                <li key={p.title}>
                  <span aria-hidden="true">{i + 1}</span>
                  <div>
                    <b>{p.title}</b>
                    <p>{p.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 3. Какво получавате */}
        <section className="demo-sec" aria-labelledby="lp-feat">
          <div className="stay-wrap">
            <h2 id="lp-feat">Всичко на един екран</h2>
            <p className="demo-lead">Само неща, които вече работят в приложението.</p>
            <ul className="lp-feat">
              {FEATURES.map((f) => (
                <li key={f.title}>
                  <div className="lp-feat__img">
                    <img src={f.img} alt={f.alt} width="1440" height="900" loading="lazy" decoding="async" />
                  </div>
                  <div className="lp-feat__txt">
                    <h3>
                      {f.title}
                      {f.tag && <span className="lp-tag">{f.tag}</span>}
                    </h3>
                    <p>{f.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 4. Сметка */}
        <section className="demo-sec demo-sec--soft" aria-labelledby="lp-calc">
          <div className="stay-wrap">
            <h2 id="lp-calc">Колко комисиона плащате на платформите?</h2>
            <p className="demo-lead">Въведете своите числа — сметката е само във вашия браузър, нищо не се изпраща.</p>
            <Calculator />
          </div>
        </section>

        {/* 5. Цени */}
        <section id="ceni" className="demo-sec" aria-labelledby="lp-price">
          <div className="stay-wrap">
            <h2 id="lp-price">Цени</h2>
            <p className="demo-lead">
              Месечен абонамент, хостингът е включен. При плащане за година — {FREE_MONTHS_YEARLY} месеца безплатно.
            </p>
            <ul className="lp-plans">
              {PLAN_KEYS.map((k) => (
                <li key={k} className={k === 'plus' ? 'lp-plan lp-plan--hot' : 'lp-plan'}>
                  {k === 'plus' && <span className="lp-plan__badge">Най-изгоден</span>}
                  <h3>{PLANS[k].name}</h3>
                  <p className="lp-plan__for">{PLANS[k].blurb}</p>
                  <p className="lp-plan__price">
                    <b>{PLANS[k].monthly} €</b> / месец
                  </p>
                  <p className="lp-plan__year">или {yearlyPrice(k)} € на година</p>
                  <ul>
                    {PLAN_FEATURES[k].map((t) => (
                      <li key={t}>
                        <Check aria-hidden="true" width="16" height="16" /> {t}
                      </li>
                    ))}
                  </ul>
                  <Link to={`/access?plan=${k}`} className={k === 'plus' ? 'stay-btn stay-btn--block' : 'stay-btn-outline stay-btn--block'}>
                    Заяви {PLANS[k].name}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="lp-fine">StayFlow е в пилотна версия — пакетите се включват ръчно. Над 30 имота: пишете ни за оферта.</p>
          </div>
        </section>

        {/* 6. Как започвате */}
        <section className="demo-sec demo-sec--soft" aria-labelledby="lp-steps">
          <div className="stay-wrap">
            <h2 id="lp-steps">Как започвате</h2>
            <ol className="lp-steps">
              {STEPS.map((s) => (
                <li key={s.title}>
                  <b>{s.title}</b>
                  <p>{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* 7. Екраните */}
        <DemoTour />

        {/* 8. Реални отзиви — само ако има */}
        {TESTIMONIALS.length > 0 && (
          <section className="demo-sec demo-sec--soft" aria-labelledby="lp-say">
            <div className="stay-wrap">
              <h2 id="lp-say">Какво казват собствениците</h2>
              <ul className="lp-say">
                {TESTIMONIALS.map((t) => (
                  <li key={t.name}>
                    <blockquote>{t.quote}</blockquote>
                    <p>
                      — {t.name}
                      {t.place ? `, ${t.place}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* 9. Въпроси */}
        <section className="demo-sec demo-sec--soft" aria-labelledby="lp-faq">
          <div className="stay-wrap lp-narrow">
            <h2 id="lp-faq">Въпроси, които задават всички</h2>
            <div className="lp-faq">
              {FAQ.map((f, i) => (
                <details key={f.q} open={i === 0}>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* 10. Заявка */}
        <section id="dostap" className="demo-sec" aria-labelledby="lp-req">
          <div className="stay-wrap lp-req">
            <div>
              <h2 id="lp-req">Заявете достъп</h2>
              <p className="demo-lead">Оставете данните си и ще се свържем с вас лично. Без плащане и без задължение.</p>
              <ul className="lp-contact">
                {viberUrl && (
                  <li>
                    <a href={viberUrl}>
                      <MessageCircle aria-hidden="true" width="18" height="18" /> Viber {contactPhone}
                    </a>
                  </li>
                )}
                {telUrl && (
                  <li>
                    <a href={telUrl}>Обадете се: {contactPhone}</a>
                  </li>
                )}
                {mailtoUrl() && (
                  <li>
                    <a href={mailtoUrl('Заявка за достъп до StayFlow')}>{contactEmail}</a>
                  </li>
                )}
              </ul>
            </div>
            <div className="lp-req__form">
              <RequestForm idPrefix="home" />
            </div>
          </div>
        </section>
      </main>

      <footer className="stay-foot lp-foot">
        <p>
          StayFlow · {COMPANY.name}
          {contactEmail ? ` · ${contactEmail}` : ''}
        </p>
        <p>
          <Link to="/privacy">Поверителност</Link> · <Link to="/terms">Условия</Link> · <Link to="/demo">Демо</Link>
        </p>
      </footer>

      {/* залепена лента на телефон: „Заяви достъп“ винаги под палеца */}
      <aside aria-label="Бърза връзка">
      <div className="lp-sticky">
        <Link to="/access" className="stay-btn">
          Заяви достъп
        </Link>
        {viberUrl && (
          <a href={viberUrl} className="stay-btn-outline" aria-label="Пишете ни във Viber">
            <MessageCircle aria-hidden="true" width="20" height="20" />
          </a>
        )}
      </div>
      {viberUrl && (
        <a href={viberUrl} className="lp-fab" aria-label="Пишете ни във Viber">
          <MessageCircle aria-hidden="true" width="24" height="24" />
          <span>Viber</span>
        </a>
      )}
      </aside>
    </div>
  )
}
