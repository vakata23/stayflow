import { MapPin } from 'lucide-react'
import { useConsent } from '../lib/consent'
import { useLegalT } from '../lib/legalI18n'

/**
 * Вграден OpenStreetMap (iframe, без API ключ, без JS библиотека за карти).
 * showMarker=true показва точен пин (само за собственика, за да потвърди
 * избраната точка). showCircle=true рисува полупрозрачен кръг върху картата
 * вместо пин — за госта, за да е ясно, че зоната е ПРИБЛИЗИТЕЛНА, не адрес.
 *
 * Картата е външна услуга (OpenStreetMap получава IP адреса и данните на браузъра), затова не се зарежда,
 * докато посетителят не е разрешил външно съдържание в банера за бисквитки. До тогава се показва
 * място със същата височина (без скачане на страницата) и връзка „Отвори в OpenStreetMap“.
 */
export default function LocationMap({ lat, lng, showMarker = false, showCircle = false, height = 220, title = 'Местоположение' }) {
  const { allowExternal, accept } = useConsent()
  const { t } = useLegalT()
  if (lat == null || lng == null) return null

  if (!allowExternal) {
    const link = showMarker
      ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`
      : `https://www.openstreetmap.org/#map=16/${lat}/${lng}`
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 rounded-xl border border-line bg-sunken px-5 py-6 text-center"
        style={{ minHeight: height }}
      >
        <MapPin className="h-6 w-6 text-ink-muted" aria-hidden="true" />
        <p className="text-sm font-semibold">{t('mapBlockedTitle')}</p>
        <p className="max-w-sm text-sm leading-relaxed text-ink-soft">{t('mapBlockedText')}</p>
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={accept} className="btn btn-sm btn-secondary">
            {t('mapShow')}
          </button>
          <a href={link} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-secondary">
            {t('mapOpen')}
          </a>
        </div>
      </div>
    )
  }

  const d = 0.006 // ≈ 650м кутия около точката — достатъчен контекст
  const bbox = `${lng - d},${lat - d},${lng + d},${lat + d}`
  const marker = showMarker ? `&marker=${lat}%2C${lng}` : ''
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik${marker}`

  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-sunken" style={{ height }}>
      <iframe title={title} src={src} className="h-full w-full" loading="lazy" style={{ border: 0 }} />
      {showCircle && (
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-accent/20"
          style={{ width: 160, height: 160 }}
        />
      )}
    </div>
  )
}
