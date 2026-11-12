import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { DEMO_PROPERTIES, demoFromPrice } from '../../lib/demoData'
import { MORE } from '../../lib/demoTour'
import { shortPrice } from '../stay/useStayEffects'
import { useDocumentLang } from '../stay/i18n'
import DemoTour from './DemoTour'
import useWide from './useWide'
import '../stay/stay.css'
import './demo.css'

// На „/“ (началната страница за невлезли) заглавието е на продукта; на /demo — на демото. Същите текстове са в
// netlify/edge-functions/page-meta.js (scripts/test-site-meta.mjs ги сверява).
const HOME_TITLE = 'StayFlow — Управление на краткосрочни наеми'
const HOME_DESC = 'Управление на краткосрочни наеми — резервации, календар, почистване, фактури.'
const PAGE_TITLE = 'Вижте какво има вътре — демо на StayFlow, без регистрация'
const PAGE_DESC =
  'Разгледайте StayFlow преди да се регистрирате: истинските екрани — табло, календар, резервации, приходи — и примерни страници за гости със сезонни цени и оферти.'

/** /demo — достъпна без регистрация: какво има в приложението на собственика и как изглежда страницата за гостите. */
export default function DemoHome({ home = false }) {
  useDocumentLang()
  const wide = useWide('(min-width: 1000px)')
  useEffect(() => {
    const prevTitle = document.title
    const descEl = document.querySelector('meta[name="description"]')
    const prevDesc = descEl?.getAttribute('content') ?? null
    document.title = home ? HOME_TITLE : PAGE_TITLE
    if (descEl) descEl.setAttribute('content', home ? HOME_DESC : PAGE_DESC)
    return () => {
      document.title = prevTitle
      if (descEl && prevDesc !== null) descEl.setAttribute('content', prevDesc)
    }
  }, [home])

  return (
    <div className="stay demo">
      <a href="#demo-main" className="stay-skip">
        Към съдържанието
      </a>
      <header className="demo-top">
        <div className="stay-wrap demo-top__in">
          <Link to={home ? '/' : '/demo'} className="demo-brand" aria-label={home ? 'StayFlow' : 'StayFlow — демо'}>
            <img src="/brand/logo-horizontal.png" alt="" width="1100" height="241" />
          </Link>
          <nav className="demo-nav" aria-label="Вход и регистрация">
            <Link to="/login" className="demo-link">
              Вход
            </Link>
            <Link to="/signup" className="stay-btn">
              Създай профил
            </Link>
          </nav>
        </div>
      </header>

      <main id="demo-main">
        <section className="stay-wrap demo-hero">
          <div className="demo-hero__text">
            <p className="demo-eyebrow">Демо, без регистрация</p>
            <h1>Вижте какво има вътре, преди да се регистрирате</h1>
            <p>
              StayFlow е приложение за собственици на имоти за краткосрочно наемане: календар, резервации, приходи, почистване и страница за
              гости със снимки, цена и запитване с дати. Тук са истинските екрани — с примерни данни. Нищо не се изпраща и не се записва.
            </p>
            <div className="demo-hero__row">
              <a href="#tour" className="stay-btn">
                Какво има вътре
              </a>
              <a href="#primeri" className="stay-btn-outline">
                Страница за гости
              </a>
            </div>
          </div>
          {wide && (
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
          )}
        </section>

        <DemoTour />

        <section id="primeri" className="demo-sec demo-sec--soft" aria-labelledby="demo-list">
          <div className="stay-wrap">
            <h2 id="demo-list">Страницата, която виждат гостите ви</h2>
            <p className="demo-lead">
              Три примерни обяви — със сезонни цени, оферти и запитване с дати. Опитайте: изберете дати и вижте цената. Нищо не се изпраща.
            </p>
            <ul className="demo-grid">
              {DEMO_PROPERTIES.map((d, i) => {
                const p = d.property
                const chips = [...d.seasons.map((s) => s.name), ...d.packages.map((x) => x.name)].filter(Boolean)
                return (
                  <li key={d.slug}>
                    <Link to={`/demo/${d.slug}`} className="demo-card">
                      <div className="demo-card__media">
                        <img src={p.photo_thumbs[0]} alt="" width="480" height="640" loading="lazy" decoding="async" />
                        <span className="demo-card__tag">Демо</span>
                      </div>
                      <div>
                        <p className="demo-card__loc">{p.city}</p>
                        <h3>{p.name}</h3>
                        <p className="demo-card__facts">
                          <span>до {p.max_guests} гости</span>
                          <span>
                            {p.bedrooms} {p.bedrooms === 1 ? 'спалня' : 'спални'}
                          </span>
                          <span>{p.photos.length} снимки</span>
                        </p>
                        {chips.length > 0 && (
                          <ul className="demo-card__chips" aria-label="Сезони и оферти">
                            {chips.map((c) => (
                              <li key={c}>{c}</li>
                            ))}
                          </ul>
                        )}
                        <p className="demo-card__price">
                          от <b>{shortPrice(demoFromPrice(d))}</b> / нощ
                        </p>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        </section>

        <section className="demo-sec" aria-labelledby="demo-more">
          <div className="stay-wrap">
            <h2 id="demo-more">И още в приложението</h2>
            <ul className="demo-feats">
              {MORE.map(([t, d]) => (
                <li key={t}>
                  <b>{t}</b>
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="demo-sec demo-sec--soft demo-cta" aria-labelledby="demo-cta">
          <div className="stay-wrap">
            <h2 id="demo-cta">Искате го за вашите имоти?</h2>
            <p>Създайте профил, добавете имота си и публикувайте страницата — линкът можете да сложите в Instagram, Viber или в обявата си.</p>
            <div className="demo-cta__row">
              <Link to="/signup" className="stay-btn">
                Създай профил
              </Link>
              <Link to="/login" className="stay-btn-outline">
                Вече имам профил
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="stay-foot">StayFlow — управление на имоти за краткосрочно настаняване. Екраните и обявите в демото са с примерни данни.</footer>
    </div>
  )
}
