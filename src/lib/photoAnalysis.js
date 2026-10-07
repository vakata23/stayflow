/**
 * Чиста логика около AI анализа на снимки — без SDK, ползва се и от браузъра
 * (прегледа на собственика), и от сървъра (photoAnalysisServer.js).
 * Подредбата се прави тук, детерминирано — AI-ът само класифицира и оценява.
 */

export const ROOM_TYPES = ['living', 'bedroom', 'kitchen', 'bathroom', 'terrace', 'view', 'exterior', 'other']

export const ROOM_LABELS = {
  living: 'Дневна',
  bedroom: 'Спалня',
  kitchen: 'Кухня',
  bathroom: 'Баня',
  terrace: 'Тераса',
  view: 'Гледка',
  exterior: 'Сграда/отвън',
  other: 'Друго',
}

// Ред като в Airbnb: дневна → спални → кухня → баня → тераса/гледка → отвън.
const ROOM_RANK = { living: 0, bedroom: 1, kitchen: 2, bathroom: 3, terrace: 4, view: 4, exterior: 5, other: 6 }

// Само удобства, които реално се виждат на снимка. WiFi, домашни любимци и
// достъп без стъпала не могат да се потвърдят от снимка — AI-ът не ги предлага.
export const VISIBLE_AMENITY_KEYS = ['ac', 'heating', 'kitchen', 'fridge', 'washer', 'balcony', 'tv', 'crib', 'parking']

/**
 * photos: [{ id, url }] в текущия ред; analysis.photos: [{ index, room, quality }]
 * (index е позицията в подадения масив). Връща нов масив снимки:
 * корицата първа, после по стая, в стаята по качество.
 */
export function orderPhotos(photos, analysis) {
  const byIndex = new Map((analysis?.photos ?? []).map((p) => [p.index, p]))
  const coverIndex = Number.isInteger(analysis?.cover_index) && photos[analysis.cover_index] ? analysis.cover_index : null

  const ranked = photos.map((photo, i) => {
    const a = byIndex.get(i)
    return {
      photo,
      i,
      rank: ROOM_RANK[a?.room] ?? ROOM_RANK.other,
      quality: Number(a?.quality) || 0,
    }
  })

  const rest = ranked
    .filter((r) => r.i !== coverIndex)
    .sort((a, b) => a.rank - b.rank || b.quality - a.quality || a.i - b.i)

  const cover = coverIndex === null ? [] : [ranked[coverIndex]]
  return [...cover, ...rest].map((r) => r.photo)
}

/** Оставя само видими удобства с висока увереност, без повторения. */
export function filterAmenitySuggestions(suggestions) {
  const seen = new Set()
  return (suggestions ?? [])
    .filter((s) => s && VISIBLE_AMENITY_KEYS.includes(s.key) && s.confidence === 'high')
    .filter((s) => (seen.has(s.key) ? false : seen.add(s.key)))
    .map((s) => s.key)
}

// Цени на Claude Opus 5.5 от platform.claude.com/docs (проверени 2026-10):
// $4 / 1M входни токена, $20 / 1M изходни (thinking токените са изходни).
export const MODEL_ID = 'claude-opus-5-5'
const PRICE_INPUT_PER_MTOK = 4
const PRICE_OUTPUT_PER_MTOK = 20

export function costUsd(usage) {
  const input = (usage?.input_tokens ?? 0) + (usage?.cache_creation_input_tokens ?? 0) + (usage?.cache_read_input_tokens ?? 0)
  const output = usage?.output_tokens ?? 0
  return Math.round(((input * PRICE_INPUT_PER_MTOK + output * PRICE_OUTPUT_PER_MTOK) / 1e6) * 10000) / 10000
}
