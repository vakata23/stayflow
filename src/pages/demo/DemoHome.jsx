import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { DEMO_PROPERTIES, demoFromPrice } from '../../lib/demoData'
import { shortPrice } from '../stay/useStayEffects'
import { useDocumentLang } from '../stay/i18n'
import '../stay/stay.css'
import './demo.css'

const FEATURES = [
  ['Страница за гости на 6 езика', 'Български, английски, македонски, сръбски, гръцки и румънски — гостът избира език сам.'],
  ['Сезонни цени и оферти', 'Различна цена за зима и лято, „6+1“, отстъпка за седмица, ранно записване или последна минута.'],
  ['Запитване с дати', 'Гостът вижда сумата още преди да пише. Заетите дати се пазят от календара, без застъпващи се резервации.'],
  ['Известие при ново запитване', 'Научавате веднага, а календарът, плащанията и приходите са в същото приложение.'],
]

const PAGE_TITLE = 'Демо — как изглежда страницата на вашия имот | StayFlow'
const PAGE_DESC = 'Разгледайте примерни обяви, направени със StayFlow: снимки, цена, сезонни цени, оферти и запитване с дати. Без регистрация.'

/** /demo — достъпна без регистрация: примерни страници на имоти, които собственикът получава със StayFlow. */
export default function DemoHome() {
  useDocumentLang()
  useEffect(() => {
    const prevTitle = document.title
    const descEl = document.querySelector('meta[name="description"]')
    const prevDesc = descEl?.getAttribute('content') ?? null
    document.title = PAGE_TITLE
    if (descEl) descEl.setAttribute('content', PAGE_DESC)
    return () => {
      document.title = prevTitle
      if (descEl && prevDesc !== null) descEl.setAttribute('content', prevDesc)
    }
  }, [])

  return (
    <div className="stay demo">
      <a href="#demo-main" className="stay-skip">
        Към съдържанието
      </a>
      <header className="demo-top">
        <div className="stay-wrap demo-top__in">
          <Link to="/demo" className="demo-brand" aria-label="StayFlow — демо">
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
          <p className="demo-eyebrow">Демо, без регистрация</p>
          <h1>Така изглежда страницата на вашия имот</h1>
          <p>
            Разгледайте три примерни обяви, направени със StayFlow — със снимки, цена, сезонни цени, оферти и запитване с дати. Цената се
            смята като при истинските, но нищо не се изпраща и не се записва.
          </p>
        </section>

        <section className="stay-wrap" aria-labelledby="demo-list">
          <h2 id="demo-list" className="sr-only">
            Примерни имоти
          </h2>
          <ul className="demo-grid">
            {DEMO_PROPERTIES.map((d, i) => {
              const p = d.property
              const chips = [...d.seasons.map((s) => s.name), ...d.packages.map((x) => x.name)].filter(Boolean)
              return (
                <li key={d.slug}>
                  <Link to={`/demo/${d.slug}`} className="demo-card">
                    <div className="demo-card__media">
                      <img src={p.photo_thumbs[0]} alt="" width="480" height="640" loading={i === 0 ? 'eager' : 'lazy'} decoding="async" />
                      <span className="demo-card__tag">Демо</span>
                    </div>
                    <div>
                      <p className="demo-card__loc">{p.city}</p>
                      <h3>{p.name}</h3>
                      <p className="demo-card__facts">
                        <span>до {p.max_guests} гости</span>
                        <span>{p.bedrooms} {p.bedrooms === 1 ? 'спалня' : 'спални'}</span>
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
        </section>

        <section className="demo-sec demo-sec--soft" style={{ marginTop: 'clamp(44px, 7vw, 84px)' }} aria-labelledby="demo-feats">
          <div className="stay-wrap">
            <h2 id="demo-feats">Какво получавате</h2>
            <ul className="demo-feats">
              {FEATURES.map(([t, d]) => (
                <li key={t}>
                  <b>{t}</b>
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="demo-sec demo-cta" aria-labelledby="demo-cta">
          <div className="stay-wrap">
            <h2 id="demo-cta">Искате такава страница за вашия имот?</h2>
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

      <footer className="stay-foot">StayFlow — управление на имоти за краткосрочно настаняване. Примерните обяви са за илюстрация.</footer>
    </div>
  )
}
