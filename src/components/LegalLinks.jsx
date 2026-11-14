import { Link } from 'react-router-dom'
import { useConsent } from '../lib/consent'
import { useLegalT } from '../lib/legalI18n'
import { companyShort } from '../lib/legal'

const linkClass = 'inline-flex min-h-11 items-center underline underline-offset-2 hover:no-underline'

/**
 * Долен ред на всеки екран: Политика за поверителност · Условия за ползване · Настройки за бисквитки
 * и, когато е попълнено, фирмата и ЕИК. Цветът се наследява от мястото (приложение, вход, публична страница).
 */
export default function LegalLinks({ className = '', company = true }) {
  const { t } = useLegalT()
  const { reopen } = useConsent()
  const short = company ? companyShort() : ''

  return (
    <nav aria-label={t('legalNav')} className={`text-sm ${className}`}>
      <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-0">
        <li>
          <Link to="/privacy" className={linkClass}>
            {t('legalPrivacy')}
          </Link>
        </li>
        <li>
          <Link to="/terms" className={linkClass}>
            {t('legalTerms')}
          </Link>
        </li>
        <li>
          <button type="button" onClick={reopen} className={linkClass}>
            {t('legalCookies')}
          </button>
        </li>
      </ul>
      {short && <p className="mt-1 text-center">{short}</p>}
    </nav>
  )
}
