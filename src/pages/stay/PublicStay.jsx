import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2, AlertCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import ListingView from './ListingView'
import useListingSeo from './useListingSeo'

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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <Loader2 className="h-7 w-7 animate-spin text-brand-600" />
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="max-w-sm rounded-2xl bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100">
            <AlertCircle className="h-6 w-6 text-slate-400" />
          </div>
          <h1 className="mt-4 text-lg font-bold">Страницата не е намерена</h1>
          <p className="mt-1 text-sm text-slate-500">Този имот не е публикуван или адресът е грешен.</p>
        </div>
      </div>
    )
  }

  return <ListingView property={property} reviews={reviews} slug={slug} loadBusy={loadBusy} />
}
