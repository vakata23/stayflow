import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Loader2, ArrowLeft } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Alert } from '../../components/ui'
import ListingView from './ListingView'

/**
 * „Преглед като гост“ за собственика: същият изглед като /stay/:slug, но от
 * собствения имот (RLS — само собственикът), дори да не е публикуван.
 * Точната точка на картата е видима само тук; гостите виждат размазаната.
 */
export default function ListingPreview() {
  const { id } = useParams()
  const [property, setProperty] = useState(null)
  const [reviews, setReviews] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      supabase.from('properties').select('*').eq('id', id).maybeSingle(),
      supabase.from('property_photos').select('photo_url, thumb_url').eq('property_id', id).order('position').order('id'),
      supabase.from('property_settings').select('base_price').eq('property_id', id).maybeSingle(),
      supabase.from('reviews').select('*').eq('property_id', id).order('created_at', { ascending: false }),
    ]).then(([p, photos, settings, revs]) => {
      if (cancelled) return
      if (p.error || !p.data) return setError('Имотът не е намерен или нямате достъп до него.')
      setProperty({
        ...p.data,
        photos: (photos.data ?? []).map((x) => x.photo_url),
        photo_thumbs: (photos.data ?? []).map((x) => x.thumb_url || x.photo_url),
        base_price: settings.data?.base_price ?? 0,
        public_lat: p.data.lat,
        public_lng: p.data.lng,
      })
      setReviews(revs.data ?? [])
    })
    return () => {
      cancelled = true
    }
  }, [id])

  const loadBusy = useCallback(
    async (from, to) => {
      const { data } = await supabase
        .from('bookings')
        .select('check_in, check_out')
        .eq('property_id', id)
        .neq('status', 'cancelled')
        .lte('check_in', to)
        .gt('check_out', from)
      const nights = []
      for (const b of data ?? []) {
        // UTC навсякъде — 'YYYY-MM-DD' се парсва като UTC полунощ; локалното setDate би се объркало около смяната на часа.
        for (let d = new Date(b.check_in); d.toISOString().slice(0, 10) < b.check_out; d.setUTCDate(d.getUTCDate() + 1)) {
          nights.push(d.toISOString().slice(0, 10))
        }
      }
      return nights
    },
    [id]
  )

  if (error) {
    return (
      <div className="mx-auto max-w-md p-6">
        <Alert>{error}</Alert>
      </div>
    )
  }
  if (!property) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sunken">
        <Loader2 className="h-7 w-7 animate-spin text-accent" />
      </div>
    )
  }

  return (
    <>
      <Link
        to={`/properties/${id}/setup`}
        className="fixed bottom-24 left-4 z-50 flex items-center gap-1.5 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-white shadow-lg sm:bottom-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Обратно към редакцията
      </Link>
      <ListingView property={property} reviews={reviews} slug={property.slug} loadBusy={loadBusy} preview />
    </>
  )
}
