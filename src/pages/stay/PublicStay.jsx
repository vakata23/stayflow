import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import ListingView from './ListingView'
import useListingSeo from './useListingSeo'
import { useStayLang, useDocumentLang } from './i18n'

/** Скелет с формата на страницата: докато идват данните, не се показва завъртащ се кръг. */
function StayLoading() {
  const { t } = useStayLang()
  return (
    <div className="stay" aria-busy="true" aria-label={t('loading')}>
      <div className="stay-wrap stay-head">
        <div className="stay-titlebar">
          <div className="stay-skel" style={{ width: 'min(420px, 70%)', height: 40 }} />
        </div>
        <div className="stay-gallery-wrap">
          <div className="stay-skel stay-gallery--skel" />
        </div>
      </div>
    </div>
  )
}

export default function PublicStay() {
  const { slug } = useParams()
  const { t, lang } = useStayLang()
  useDocumentLang()
  const [property, setProperty] = useState(null)
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      supabase.rpc('public_property', { p_slug: slug }),
      supabase.rpc('public_reviews', { p_slug: slug }),
    ]).then(([propRes, reviewsRes]) => {
      if (cancelled) return
      if (propRes.error || !propRes.data || propRes.data.length === 0) setNotFound(true)
      else setProperty(propRes.data[0])
      setReviews(reviewsRes.data ?? [])
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [slug])

  useListingSeo(property, lang)

  const loadBusy = useCallback(
    async (from, to) => {
      const { data } = await supabase.rpc('busy_nights', { p_slug: slug, p_from: from, p_to: to })
      return (data ?? []).map((r) => r.night)
    },
    [slug]
  )

  if (loading) return <StayLoading />

  if (notFound) {
    return (
      <div className="stay" style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
        <main style={{ maxWidth: 440 }}>
          <p style={{ margin: 0, color: 'var(--stay-accent-text)', fontWeight: 700 }}>404</p>
          <h1 className="stay-title" style={{ marginTop: 8 }}>
            {t('notFoundTitle')}
          </h1>
          <p className="stay-prose" style={{ marginTop: 12 }}>
            {t('notFoundText')}
          </p>
        </main>
      </div>
    )
  }

  return <ListingView property={property} reviews={reviews} slug={slug} loadBusy={loadBusy} />
}
