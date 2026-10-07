/**
 * Вграден OpenStreetMap (iframe, без API ключ, без JS библиотека за карти).
 * showMarker=true показва точен пин (само за собственика, за да потвърди
 * избраната точка). showCircle=true рисува полупрозрачен кръг върху картата
 * вместо пин — за госта, за да е ясно, че зоната е ПРИБЛИЗИТЕЛНА, не адрес.
 */
export default function LocationMap({ lat, lng, showMarker = false, showCircle = false, height = 220 }) {
  if (lat == null || lng == null) return null

  const d = 0.006 // ≈ 650м кутия около точката — достатъчен контекст
  const bbox = `${lng - d},${lat - d},${lng + d},${lat + d}`
  const marker = showMarker ? `&marker=${lat}%2C${lng}` : ''
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik${marker}`

  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100" style={{ height }}>
      <iframe title="Местоположение" src={src} className="h-full w-full" loading="lazy" style={{ border: 0 }} />
      {showCircle && (
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-brand-600 bg-brand-500/20"
          style={{ width: 160, height: 160 }}
        />
      )}
    </div>
  )
}
