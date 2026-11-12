import { Link } from 'react-router-dom'
import { Cookie } from 'lucide-react'
import { useConsent } from '../lib/consent'
import { useLegalT } from '../lib/legalI18n'

/**
 * Банер за бисквитки и външно съдържание. „Откажи“ и „Приемам“ са еднакви по размер и вид — отказът е също
 * толкова лесен, колкото съгласието. Показва се при първо посещение и когато се отвори от „Настройки за бисквитки“.
 * Не закрива съдържанието за постоянно: щом изборът е направен, изчезва; докато няма избор, външно съдържание
 * (картата) не се зарежда.
 */
export default function CookieBanner() {
  const { bannerOpen, accept, decline } = useConsent()
  const { t } = useLegalT()
  if (!bannerOpen) return null

  return (
    <section
      aria-labelledby="cookie-title"
      className="fixed inset-x-3 bottom-3 z-[70] mx-auto max-w-xl rounded-2xl border border-line bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:inset-x-auto sm:bottom-5 sm:right-5 sm:mx-0 sm:w-[26rem]"
    >
      <h2 id="cookie-title" className="flex items-center gap-2 text-base font-semibold">
        <Cookie className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
        {t('cookieTitle')}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        {t('cookieText')}{' '}
        <Link to="/privacy#cookies" className="font-semibold text-accent underline underline-offset-2 hover:text-accent-ink">
          {t('cookieMore')}
        </Link>
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button type="button" onClick={decline} className="btn btn-secondary">
          {t('cookieDecline')}
        </button>
        <button type="button" onClick={accept} className="btn btn-secondary">
          {t('cookieAccept')}
        </button>
      </div>
    </section>
  )
}
