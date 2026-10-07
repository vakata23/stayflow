import { useEffect, useState } from 'react'
import { X, ChevronLeft, ChevronRight, Images, Waves } from 'lucide-react'

export default function Gallery({ photos, alt }) {
  const [lightboxIndex, setLightboxIndex] = useState(null)

  const open = (i) => setLightboxIndex(i)
  const close = () => setLightboxIndex(null)
  const prev = () => setLightboxIndex((i) => (i - 1 + photos.length) % photos.length)
  const next = () => setLightboxIndex((i) => (i + 1) % photos.length)

  useEffect(() => {
    if (lightboxIndex === null) return
    const onKey = (e) => {
      if (e.key === 'Escape') close()
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxIndex, photos.length])

  if (photos.length === 0) {
    return (
      <div className="flex aspect-[4/3] w-full items-center justify-center bg-brand-700 sm:aspect-[21/9]">
        <Waves className="h-10 w-10 text-white/40" />
      </div>
    )
  }

  return (
    <>
      {/* Телефон: swipe лента */}
      <div className="flex snap-x snap-mandatory overflow-x-auto sm:hidden">
        {photos.map((url, i) => (
          <button
            key={i}
            onClick={() => open(i)}
            className="aspect-[4/3] w-full shrink-0 snap-center"
            aria-label={`Отвори снимка ${i + 1}`}
          >
            <img src={url} alt={`${alt} — снимка ${i + 1}`} className="h-full w-full object-cover" />
          </button>
        ))}
      </div>

      {/* Десктоп: голяма + мрежа */}
      <div className="relative hidden gap-2 sm:grid sm:aspect-[21/9] sm:grid-cols-4 sm:grid-rows-2">
        <button onClick={() => open(0)} className="col-span-2 row-span-2 overflow-hidden rounded-l-2xl">
          <img src={photos[0]} alt={alt} className="h-full w-full object-cover transition hover:brightness-95" />
        </button>
        {photos.slice(1, 5).map((url, i) => (
          <button
            key={i}
            onClick={() => open(i + 1)}
            className={`overflow-hidden ${i === 1 ? 'rounded-tr-2xl' : ''} ${i === 3 ? 'rounded-br-2xl' : ''} ${
              photos.length === 2 ? 'rounded-r-2xl' : ''
            }`}
          >
            <img src={url} alt={`${alt} — снимка ${i + 2}`} className="h-full w-full object-cover transition hover:brightness-95" />
          </button>
        ))}
        {photos.length > 1 && (
          <button
            onClick={() => open(0)}
            className="absolute bottom-4 right-4 flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow hover:bg-slate-50"
          >
            <Images className="h-3.5 w-3.5" />
            Виж всички снимки ({photos.length})
          </button>
        )}
      </div>

      {lightboxIndex !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90" onClick={close}>
          <button
            onClick={close}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="Затвори"
          >
            <X className="h-5 w-5" />
          </button>
          {photos.length > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                prev()
              }}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 sm:left-4"
              aria-label="Предишна снимка"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}
          <img
            src={photos[lightboxIndex]}
            alt={`${alt} — снимка ${lightboxIndex + 1}`}
            className="max-h-[85vh] max-w-[90vw] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          {photos.length > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                next()
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 sm:right-4"
              aria-label="Следваща снимка"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}
          <p className="absolute bottom-4 text-xs text-white/70">
            {lightboxIndex + 1} / {photos.length}
          </p>
        </div>
      )}
    </>
  )
}
