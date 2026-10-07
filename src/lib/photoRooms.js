/**
 * Етикети на снимки и всичко, което се извежда от тях — чиста логика, без
 * мрежа и без AI. Собственикът маркира всяка снимка с един клик; подредбата,
 * подсказките за удобства и предложената корица идват от етикетите.
 */

export const ROOM_CHIPS = [
  { key: 'living', label: 'Дневна' },
  { key: 'bedroom', label: 'Спалня' },
  { key: 'kitchen', label: 'Кухня' },
  { key: 'bathroom', label: 'Баня' },
  { key: 'terrace', label: 'Тераса/балкон' },
  { key: 'view', label: 'Гледка' },
  { key: 'exterior', label: 'Отвън' },
  { key: 'other', label: 'Друго' },
]

export const ROOM_TYPES = ROOM_CHIPS.map((c) => c.key)
export const ROOM_LABELS = Object.fromEntries(ROOM_CHIPS.map((c) => [c.key, c.label]))

// Ред като в Airbnb: дневна → спални → кухня → баня → тераса/гледка → отвън.
// Неетикетираните отиват накрая — собственикът още не е решил къде са.
const RANK = { living: 0, bedroom: 1, kitchen: 2, bathroom: 3, terrace: 4, view: 4, exterior: 5, other: 6 }
const UNLABELED_RANK = 7

/** Стабилна подредба по етикет; вътре в една стая запазва текущия ред. */
export function orderByRooms(photos) {
  return photos
    .map((photo, i) => ({ photo, i, rank: RANK[photo.room] ?? UNLABELED_RANK }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((x) => x.photo)
}

/**
 * Подсказки за удобства — САМО там, където етикетът е почти същото нещо:
 * „Кухня“ → Кухня, „Тераса/балкон“ → Тераса/балкон. Нищо друго не се
 * подсказва (дневна не значи телевизор, баня не значи пералня).
 */
const ROOM_AMENITY_HINTS = { kitchen: 'kitchen', terrace: 'balcony' }

export function amenityHintsFromRooms(photos) {
  const keys = new Set()
  for (const p of photos) if (ROOM_AMENITY_HINTS[p.room]) keys.add(ROOM_AMENITY_HINTS[p.room])
  return [...keys]
}

export function roomCounts(photos) {
  const counts = Object.fromEntries(ROOM_TYPES.map((k) => [k, 0]))
  let unlabeled = 0
  for (const p of photos) {
    if (counts[p.room] !== undefined) counts[p.room]++
    else unlabeled++
  }
  return { counts, unlabeled }
}

/**
 * Предложена корица: сред кадрите от дневна/тераса/гледка/отвън (иначе — от
 * всички, но никога баня или спалня, ако има друг избор) взима тази с
 * осветеност най-близо до 0.62 — нито тъмна, нито преекспонирана.
 * brightness: { [photoId]: 0..1 }. Връща id или null.
 */
export function suggestCoverId(photos, brightness) {
  const pools = [
    photos.filter((p) => ['living', 'terrace', 'view', 'exterior'].includes(p.room)),
    photos.filter((p) => !['bathroom', 'bedroom', 'kitchen'].includes(p.room)),
    photos,
  ]
  const pool = pools.find((p) => p.length > 0)
  if (!pool) return null
  const score = (p) => Math.abs((brightness[p.id] ?? 0.5) - 0.62)
  return pool.reduce((best, p) => (score(p) < score(best) ? p : best)).id
}

/** Средна осветеност 0..1 от RGBA пиксели (относителна яркост). */
export function meanBrightness(data) {
  let sum = 0
  let n = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue
    sum += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255
    n++
  }
  return n ? sum / n : 0.5
}

/** Браузър: URL → осветеност 0..1 (върху умалено копие). */
export async function brightnessFromImage(url) {
  const res = await fetch(url)
  const bitmap = await createImageBitmap(await res.blob())
  const scale = Math.min(1, 64 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close?.()
  return meanBrightness(ctx.getImageData(0, 0, canvas.width, canvas.height).data)
}
