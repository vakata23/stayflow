import { useEffect } from 'react'

/**
 * SEO за /stay/:slug — заглавие, meta description, OG таг-ове, JSON-LD
 * (LodgingBusiness). Чисто CSR (без SSR), затова ботовете, които не
 * изпълняват JS, няма да видят тези тагове — ограничение на SPA-то, не
 * бъг тук. При размонтиране връща заглавието/описанието, добавените
 * тагове се трият изцяло (не замърсяват следващата страница в SPA-то).
 */
export default function useListingSeo(property) {
  useEffect(() => {
    if (!property) return

    const prevTitle = document.title
    document.title = `${property.name}${property.city ? ` — ${property.city}` : ''} | StayFlow`

    const descriptionEl = document.querySelector('meta[name="description"]')
    const prevDescription = descriptionEl?.getAttribute('content') ?? null
    const description = (property.public_description || property.public_description_en || '').slice(0, 160)
    if (descriptionEl && description) descriptionEl.setAttribute('content', description)

    const created = []
    const setOg = (prop, content) => {
      if (!content) return
      const el = document.createElement('meta')
      el.setAttribute('property', prop)
      el.setAttribute('content', content)
      document.head.appendChild(el)
      created.push(el)
    }

    const image = property.photos?.[0] || property.cover_image_url || ''
    setOg('og:title', document.title)
    setOg('og:description', description)
    setOg('og:type', 'website')
    setOg('og:url', window.location.href)
    setOg('og:image', image)

    const script = document.createElement('script')
    script.type = 'application/ld+json'
    script.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'LodgingBusiness',
      name: property.name,
      ...(image ? { image: [image] } : {}),
      ...(property.city
        ? { address: { '@type': 'PostalAddress', addressLocality: property.city, addressCountry: 'BG' } }
        : {}),
      ...(property.public_lat != null && property.public_lng != null
        ? { geo: { '@type': 'GeoCoordinates', latitude: property.public_lat, longitude: property.public_lng } }
        : {}),
      url: window.location.href,
    })
    document.head.appendChild(script)
    created.push(script)

    return () => {
      document.title = prevTitle
      if (descriptionEl && prevDescription !== null) descriptionEl.setAttribute('content', prevDescription)
      created.forEach((el) => el.remove())
    }
  }, [property])
}
