import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import LegalLinks from '../../components/LegalLinks'
import { useLegalT } from '../../lib/legalI18n'
import { companyLines, formatLegalDate, missingCompanyFields, COMPANY } from '../../lib/legal'

/* Малки градивни елементи за документите — едно място за вид и отстъпи. */

export const H2 = ({ id, children }) => (
  <h2 id={id} className="scroll-mt-6 text-[1.375rem] font-semibold leading-snug sm:text-[1.5rem]">
    {children}
  </h2>
)
export const P = ({ children, className = '' }) => <p className={`mt-3 leading-relaxed text-ink-soft ${className}`}>{children}</p>
export const UL = ({ children }) => <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed text-ink-soft marker:text-ink-muted">{children}</ul>

/** Ред „какви данни — за какво — на какво основание“; на телефон е карта, а не широка таблица. */
export function DataRow({ title, data, purpose, basis }) {
  return (
    <li className="rounded-2xl bg-sunken p-4">
      <p className="font-semibold text-ink">{title}</p>
      <dl className="mt-2 space-y-1.5 text-[0.9375rem] leading-relaxed text-ink-soft">
        <div>
          <dt className="inline font-semibold text-ink">Данни: </dt>
          <dd className="inline">{data}</dd>
        </div>
        <div>
          <dt className="inline font-semibold text-ink">Цел: </dt>
          <dd className="inline">{purpose}</dd>
        </div>
        <div>
          <dt className="inline font-semibold text-ink">Основание: </dt>
          <dd className="inline">{basis}</dd>
        </div>
      </dl>
    </li>
  )
}

/** Данните на администратора. Непопълнено поле се вижда като „[да се попълни]“ — не се измисля нищо. */
export function CompanyBlock() {
  const lines = companyLines()
  const missing = missingCompanyFields()
  const labels = { name: 'Фирма', eik: 'ЕИК', address: 'Адрес', email: 'Имейл' }
  return (
    <dl className="mt-3 rounded-2xl bg-sunken p-4 leading-relaxed" data-testid="company-block">
      {lines.map((l) => (
        <div key={l.key}>
          <dt className="inline font-semibold">{l.label}: </dt>
          <dd className="inline text-ink-soft">
            {l.key === 'email' ? (
              <a className="font-semibold text-accent underline underline-offset-2" href={`mailto:${l.value}`}>
                {l.value}
              </a>
            ) : (
              l.value
            )}
          </dd>
        </div>
      ))}
      {missing.map((k) => (
        <div key={k}>
          <dt className="inline font-semibold">{labels[k]}: </dt>
          <dd className="inline">
            <mark className="rounded bg-warning-soft px-1.5 text-warning-ink">[да се попълни]</mark>
          </dd>
        </div>
      ))}
    </dl>
  )
}

export const contactEmail = () => (typeof COMPANY.email === 'string' && COMPANY.email.trim() ? COMPANY.email.trim() : null)

/** Рамка на документ: лого, заглавие, дата на промяната, бележка за езика, текст, долен ред. */
export default function LegalShell({ title, children }) {
  const { t, lang } = useLegalT()
  const { hash } = useLocation()

  useEffect(() => {
    document.title = `${title} — StayFlow`
    return () => {
      document.title = 'StayFlow — Управление на краткосрочни наеми'
    }
  }, [title])

  // Връзка към раздел (#cookies) — страницата сама превърта; иначе започва отгоре.
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView()
    else window.scrollTo(0, 0)
  }, [hash])

  return (
    <div className="min-h-dvh bg-surface">
      <header className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <Link to="/" aria-label="StayFlow">
          <img src="/brand/logo-horizontal.png" alt="" width="1100" height="241" className="h-9 w-auto" />
        </Link>
        <Link to="/" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-accent hover:text-accent-ink">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t('legalHome')}
        </Link>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-10 sm:px-6">
        {/* translate="no": документът е на български; превеждачът на приложението не го пипа, но <html lang> следва езика на посетителя */}
        <article className="card card-pad" translate="no">
          <h1 className="type-display">{title}</h1>
          <p className="mt-2 text-sm text-ink-muted">Последна промяна: {formatLegalDate()}</p>
          {lang !== 'bg' && (
            <p role="note" className="mt-4 rounded-xl bg-info-soft px-4 py-3 text-sm text-info-ink">
              {t('bgOnly')}
            </p>
          )}
          <div lang="bg" className="mt-8 space-y-9">
            {children}
          </div>
        </article>
      </main>
      <footer className="mx-auto max-w-3xl px-4 pb-10 text-ink-muted sm:px-6">
        <LegalLinks />
      </footer>
    </div>
  )
}
