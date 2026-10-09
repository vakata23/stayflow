import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import ListingView from './ListingView'
import useListingSeo from './useListingSeo'

/** Скелет с формата на страницата: докато идват данните, не се показва завъртащ се кръг. */
function StayLoading() {
  const bar = (w, h) => (
    <div className="stay-skel" style={{ width: w, height: h, background: 'rgba(255,255,255,0.14)', borderRadius: 12 }} />
  )
  return (
    <div className="stay" aria-busy="true" aria-label="Зареждане">
      <div className="stay-hero">
        <div className="stay-hero__fallback" aria-hidden="true" />
        <div className="stay-hero__shade" aria-hidden="true" />
        <span />
        <div className="stay-hero__content">
          <div style={{ display: 'grid', gap: 16 }}>
            {bar(120, 22)}
            {bar('72%', 84)}
            {bar('48%', 18)}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PublicStay() {
  const { slug } = useParams()
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

  useListingSeo(property)

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
          <p className="stay-kicker" style={{ margin: 0 }}>
            404
          </p>
          <h1 className="stay-h2" style={{ marginTop: 8 }}>
            Страницата не е намерена
          </h1>
          <p className="stay-prose" style={{ fontSize: 16 }}>
            Този имот не е публикуван или адресът е грешен. Проверете линка, който сте получили от собственика.
          </p>
        </main>
      </div>
    )
  }

  return <ListingView property={property} reviews={reviews} slug={slug} loadBusy={loadBusy} />
}
