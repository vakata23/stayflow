import { useCallback, useEffect, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import ListingView from '../stay/ListingView'
import { useStayLang, useDocumentLang } from '../stay/i18n'
import { findDemo, demoBusyNights, demoQuote } from '../../lib/demoData'

/** Демо на страницата за гости: същият ListingView като /stay/:slug, но с примерни данни и без запис никъде. */
export default function DemoStay() {
  const { slug } = useParams()
  const { t } = useStayLang()
  useDocumentLang()
  const demo = findDemo(slug)

  // Примерните страници не бива да попадат в търсачките като истински обяви.
  useEffect(() => {
    const prevTitle = document.title
    document.title = `${demo ? demo.property.name : 'Демо'} — демо | StayFlow`
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex'
    document.head.appendChild(meta)
    return () => {
      document.title = prevTitle
      meta.remove()
    }
  }, [demo])

  const loadBusy = useCallback(async (from, to) => (demo ? demoBusyNights(demo, from, to) : []), [demo])
  const demoApi = useMemo(() => (demo ? { quote: (checkIn, checkOut, guests) => demoQuote(demo, checkIn, checkOut, guests) } : null), [demo])

  if (!demo) {
    return (
      <div className="stay" style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
        <main style={{ maxWidth: 440 }}>
          <p style={{ margin: 0, color: 'var(--stay-accent-text)', fontWeight: 700 }}>404</p>
          <h1 className="stay-title" style={{ marginTop: 8 }}>
            {t('notFoundTitle')}
          </h1>
          <p className="stay-prose" style={{ marginTop: 12 }}>
            <Link to="/demo" className="stay-link">
              Към примерите
            </Link>
          </p>
        </main>
      </div>
    )
  }

  return (
    <ListingView property={demo.property} reviews={[]} seasons={demo.seasons} packages={demo.packages} slug={demo.slug} loadBusy={loadBusy} demo={demoApi} />
  )
}
