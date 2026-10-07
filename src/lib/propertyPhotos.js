import { supabase } from './supabase'
import { compressImage } from './imageCompression'

const BUCKET = 'property-images'
const MAX_BYTES = 8 * 1024 * 1024 // преди компресия; след нея файловете са много по-малки

export async function fetchPhotos(propertyId) {
  const { data, error } = await supabase
    .from('property_photos')
    .select('*')
    .eq('property_id', propertyId)
    .order('position')
  if (error) throw error
  return data ?? []
}

/**
 * Качва няколко снимки (компресирани в браузъра) и ги добавя в галерията.
 * Пътят в storage е {auth.uid()}/{random}.jpg — НИКОГА {property_id}/..., за
 * да не изтича property_id през имената на файловете (виж миграция 009).
 */
export async function addPhotos(propertyId, files, userId, startPosition) {
  const urls = []
  for (const file of files) {
    if (file.size > MAX_BYTES) throw new Error(`"${file.name}" е твърде голям (максимум 8 MB).`)
    const compressed = await compressImage(file)
    const path = `${userId}/${crypto.randomUUID()}.jpg`
    const { error } = await supabase.storage.from(BUCKET).upload(path, compressed, {
      cacheControl: '3600',
      upsert: false,
    })
    if (error) throw error
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
    urls.push(data.publicUrl)
  }

  const rows = urls.map((photo_url, i) => ({
    property_id: propertyId,
    photo_url,
    position: startPosition + i,
  }))
  const { error } = await supabase.from('property_photos').insert(rows)
  if (error) throw error
  return urls
}

/** positions: [{ id, position }] */
export async function reorderPhotos(positions) {
  await Promise.all(
    positions.map(({ id, position }) => supabase.from('property_photos').update({ position }).eq('id', id))
  )
}

export async function deletePhoto(photo) {
  await supabase.from('property_photos').delete().eq('id', photo.id)
  const marker = `/${BUCKET}/`
  const idx = photo.photo_url.indexOf(marker)
  if (idx !== -1) {
    await supabase.storage.from(BUCKET).remove([photo.photo_url.slice(idx + marker.length)])
  }
}

export async function setCoverPhoto(propertyId, photoUrl) {
  const { error } = await supabase.from('properties').update({ cover_image_url: photoUrl }).eq('id', propertyId)
  if (error) throw error
}
