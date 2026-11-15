import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { PLAN_KEYS, TRIAL_DAYS } from '../../lib/accessLogic'
import { useDocumentLang } from '../stay/i18n'
import RequestForm from './RequestForm'
import '../stay/stay.css'
import './demo.css'
import './landing.css'

const TITLE = 'Заявка за достъп до StayFlow'
const DESC = 'Заявете достъп до StayFlow: резервации от Airbnb и Booking на едно място, приходи и директни резервации. Отговаряме лично.'

/** /access — отделна страница със само формата (от бутоните „Заяви достъп“, от регистрацията и от екрана „Чака активиране“). */
export default function AccessRequest() {
  useDocumentLang()
  const [params] = useSearchParams()
  const plan = PLAN_KEYS.includes(params.get('plan')) ? params.get('plan') : ''
  useEffect(() => {
    const prevTitle = document.title
    const descEl = document.querySelector('meta[name="description"]')
    const prevDesc = descEl?.getAttribute('content') ?? null
    document.title = TITLE
    if (descEl) descEl.setAttribute('content', DESC)
    return () => {
      document.title = prevTitle
      if (descEl && prevDesc !== null) descEl.setAttribute('content', prevDesc)
    }
  }, [])

  return (
    <div className="stay demo lp">
      <header className="demo-top">
        <div className="stay-wrap demo-top__in">
          <Link to="/" className="demo-brand" aria-label="StayFlow — към началото">
            <img src="/brand/logo-horizontal.png" alt="" width="1100" height="241" />
          </Link>
          <nav className="demo-nav" aria-label="Вход">
            <Link to="/login" className="demo-link">
              Вход
            </Link>
          </nav>
        </div>
      </header>
      <main id="lp-main" className="stay-wrap lp-solo">
        <Link to="/" className="lp-back">
          <ArrowLeft aria-hidden="true" width="16" height="16" /> Към началото
        </Link>
        <h1>Опитайте StayFlow {TRIAL_DAYS} дни безплатно</h1>
        <p className="demo-lead">Оставете данните си и ще се свържем с вас лично, за да ви отворим достъпа. Без карта и без задължение.</p>
        <RequestForm defaultPlan={plan} idPrefix="req" />
      </main>
    </div>
  )
}
