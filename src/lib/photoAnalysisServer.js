/**
 * Сървърна част на „Качи снимки → страницата се прави сама“: Claude (vision)
 * класифицира снимките, избира корица, предлага ВИДИМИ удобства и пише
 * чернова на описание BG/EN. Ползва се само от Netlify background функцията
 * (netlify/functions/analyze-photos.mjs) и dev middleware-а — никога от
 * браузъра (ANTHROPIC_API_KEY живее само в Netlify env).
 *
 * Нищо не се пише в имота: резултатът отива в ai_runs.result и собственикът
 * го приема или поправя. Всяка грешка се записва в ai_runs и функцията
 * завършва нормално — Netlify повтаря хвърлилите background функции, а
 * повторен опит би платил втори път.
 */
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { verifyOwnerProfile } from './outboxProcessor.js'
import { ROOM_TYPES, VISIBLE_AMENITY_KEYS, MODEL_ID, orderPhotos, filterAmenitySuggestions, costUsd } from './photoAnalysis.js'

const AnalysisSchema = z.object({
  photos: z.array(
    z.object({
      index: z.number().int(),
      room: z.enum(ROOM_TYPES),
      quality: z.number().int(),
    })
  ),
  cover_index: z.number().int(),
  amenities: z.array(
    z.object({
      key: z.enum(VISIBLE_AMENITY_KEYS),
      confidence: z.enum(['high', 'medium', 'low']),
      photo_index: z.number().int(),
    })
  ),
  description_bg: z.string(),
  description_en: z.string(),
})

const SYSTEM = `You analyze photos of a short-term rental listing in Bulgaria for its owner, who will review everything before it is published.
Be literal. Describe only what is clearly visible in the photos. Never invent features, views, distances, neighbourhood details, services or amenities that you cannot see.`

function instructions({ name, city, maxGuests, count }) {
  return `Property: "${name}"${city ? `, ${city}` : ''}, up to ${maxGuests} guests. There are ${count} photos above, numbered from 0.

1. For every photo give its number as "index", a "room" and a "quality" from 1 to 10 for use as a listing photo (sharpness, light, composition, tidiness).
   Rooms: living (living room / lounge), bedroom, kitchen, bathroom, terrace (balcony, terrace, yard), view (mainly the view out of the property), exterior (building, entrance, street), other.
2. "cover_index": the single best photo to lead the listing - bright, wide, inviting, representative. Prefer a living room or a strong terrace/view shot. Never a bathroom, never a dark or blurry photo.
3. "amenities": only items that are clearly visible, each with the photo_index where it is seen. Use confidence "high" only when the object itself is unambiguous in that photo; otherwise leave it out entirely.
   ac = wall or split air-conditioning unit; heating = radiator, heater or fireplace; kitchen = cooking area with a hob or stove; fridge = refrigerator; washer = washing machine; balcony = balcony or terrace; tv = television; crib = baby cot; parking = a parking space that clearly belongs to the property.
4. "description_bg" (natural Bulgarian) and "description_en": 3 to 5 short sentences for guests, factual and calm, based only on what is visible plus the name and city above. No superlatives (no "уникален", "луксозен", "невероятен", "perfect", "stunning"), no claims about distances, location, transport or services.`
}

async function supa(path, { supabaseUrl, serviceKey, method = 'GET', body, prefer }) {
  const res = await fetch(`${supabaseUrl}${path}`, {
    method,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`Supabase ${res.status} при ${method} ${path.split('?')[0]}`)
  return res.status === 204 ? null : res.json()
}

/**
 * config: { token, runId, supabaseUrl, serviceKey, anthropicApiKey, client? }
 * client — инжектира се в тестовете; иначе нов Anthropic клиент.
 * Връща { status, ... } за логове/тестове; HTTP отговорът на background
 * функцията и без това е 202.
 */
export async function handleAnalyzePhotos(config) {
  const { token, runId, supabaseUrl, serviceKey, anthropicApiKey } = config
  const db = { supabaseUrl, serviceKey }
  if (!supabaseUrl || !serviceKey) return { status: 'skipped', reason: 'Сървърът не е конфигуриран.' }
  if (!runId || !/^[0-9a-f-]{36}$/.test(runId)) return { status: 'skipped', reason: 'Невалидна обработка.' }

  const profileId = await verifyOwnerProfile({ token, supabaseUrl, serviceKey })
  if (!profileId) return { status: 'skipped', reason: 'Unauthorized' }

  // Атомарно „вземане“ на обработката: само queued → running и само за
  // собственика ѝ. Повторно извикване (Netlify retry, двоен клик) не намира
  // ред и не плаща втори път.
  const claimed = await supa(
    `/rest/v1/ai_runs?id=eq.${runId}&status=eq.queued&profile_id=eq.${profileId}`,
    { ...db, method: 'PATCH', body: { status: 'running' }, prefer: 'return=representation' }
  )
  const run = claimed?.[0]
  if (!run) return { status: 'skipped', reason: 'Обработката вече е взета или не е ваша.' }

  const finish = (patch) =>
    supa(`/rest/v1/ai_runs?id=eq.${runId}`, {
      ...db,
      method: 'PATCH',
      body: { finished_at: new Date().toISOString(), ...patch },
      prefer: 'return=minimal',
    })

  let usage = null
  try {
    if (!anthropicApiKey) throw new Error('ANTHROPIC_API_KEY не е конфигуриран.')

    const [property] = await supa(
      `/rest/v1/properties?id=eq.${run.property_id}&select=name,city,max_guests,ai_assistant`,
      db
    )
    // Второ заключване освен ключа: без изрично включен асистент нищо не се плаща.
    if (!property?.ai_assistant) throw new Error('AI асистентът е изключен за този имот.')
    const photos = await supa(
      `/rest/v1/property_photos?property_id=eq.${run.property_id}&select=id,photo_url,thumb_url&order=position&limit=30`,
      db
    )
    if (!photos.length) throw new Error('Няма качени снимки.')

    const content = []
    photos.forEach((p, i) => {
      content.push({ type: 'text', text: `Photo ${i}:` })
      content.push({ type: 'image', source: { type: 'url', url: p.thumb_url || p.photo_url } })
    })
    content.push({
      type: 'text',
      text: instructions({ name: property.name, city: property.city, maxGuests: property.max_guests, count: photos.length }),
    })

    const client = config.client ?? new Anthropic({ apiKey: anthropicApiKey })
    const response = await client.messages.parse({
      model: MODEL_ID,
      max_tokens: 8000,
      system: SYSTEM,
      // Класификация + кратък текст: ниско effort е достатъчно и е по-евтино.
      output_config: { effort: 'low', format: zodOutputFormat(AnalysisSchema) },
      messages: [{ role: 'user', content }],
    })
    usage = response.usage

    if (response.stop_reason === 'refusal') throw new Error('Claude отказа да обработи снимките.')
    if (response.stop_reason === 'max_tokens') throw new Error('Отговорът на Claude беше прекъснат (max_tokens).')
    const analysis = response.parsed_output
    if (!analysis) throw new Error('Claude не върна валиден резултат.')

    const ordered = orderPhotos(photos, analysis)
    const rooms = Object.fromEntries(
      analysis.photos.filter((a) => photos[a.index]).map((a) => [photos[a.index].id, a.room])
    )

    await finish({
      status: 'done',
      model: MODEL_ID,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      cost_usd: costUsd(usage),
      result: {
        order: ordered.map((p) => p.id),
        cover_id: ordered[0]?.id ?? null,
        rooms,
        amenities: filterAmenitySuggestions(analysis.amenities),
        description_bg: analysis.description_bg.trim(),
        description_en: analysis.description_en.trim(),
      },
    })
    return { status: 'done' }
  } catch (err) {
    const message =
      err instanceof Anthropic.APIError ? `Claude API грешка ${err.status ?? ''}`.trim() : String(err.message || err)
    await finish({
      status: 'failed',
      error: message.slice(0, 500),
      model: MODEL_ID,
      ...(usage ? { input_tokens: usage.input_tokens, output_tokens: usage.output_tokens, cost_usd: costUsd(usage) } : {}),
    }).catch(() => {})
    return { status: 'failed', error: message }
  }
}
