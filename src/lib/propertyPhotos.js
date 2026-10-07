import { supabase } from './supabase'
import { compressWithThumbnail } from './imageCompression'

const BUCKET = 'property-images'
export const MAX_PHOTOS_PER_PROPERTY = 30

export async function fetchPhotos(propertyId) {
  const { data, error } = await supabase
    .from('property_photos')
    .select('*')
    .eq('property_id', propertyId)
    .order('position')
  if (error) throw error
  return data ?? []
}

async function uploadOne(file, userId) {
  const ext = file.type === 'image/webp' ? 'webp' : 'jpg'
  // Пътят е {auth.uid()}/{random} — НИКОГА {property_id}/..., за да не
  // изтича property_id през имената на файловете (виж миграция 009).
  const path = `${userId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '31536000',
    contentType: file.type,
    upsert: false,
  })
  if (error) throw error
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

/**
 * Компресира (1600px + миниатюра 768px, без EXIF/GPS) и качва няколко снимки.
 * onProgress(done, total) — за брояча в интерфейса.
 */
export async function addPhotos(propertyId, files, userId, startPosition, onProgress) {
  if (startPosition + files.length > MAX_PHOTOS_PER_PROPERTY) {
    throw new Error(`Максимумът е ${MAX_PHOTOS_PER_PROPERTY} снимки на имот (имате ${startPosition}).`)
  }

  const rows = []
  for (const [i, file] of files.entries()) {
    const { full, thumb } = await compressWithThumbnail(file)
    const [photo_url, thumb_url] = await Promise.all([uploadOne(full, userId), uploadOne(thumb, userId)])
    rows.push({ property_id: propertyId, photo_url, thumb_url, position: startPosition + i })
    onProgress?.(i + 1, files.length)
  }

  const { error } = await supabase.from('property_photos').insert(rows)
  if (error) throw error
  return rows
}

/** positions: [{ id, position }] */
export async function reorderPhotos(positions) {
  await Promise.all(
    positions.map(({ id, position }) => supabase.from('property_photos').update({ position }).eq('id', id))
  )
}

function storagePath(url) {
  const marker = `/${BUCKET}/`
  const idx = url?.indexOf(marker) ?? -1
  return idx === -1 ? null : url.slice(idx + marker.length)
}

export async function deletePhoto(photo) {
  await supabase.from('property_photos').delete().eq('id', photo.id)
  const paths = [storagePath(photo.photo_url), storagePath(photo.thumb_url)].filter(Boolean)
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
}

/** room: един от ROOM_TYPES или null (маха етикета). */
export async function setPhotoRoom(photoId, room) {
  const { error } = await supabase.from('property_photos').update({ room }).eq('id', photoId)
  if (error) throw error
}

export async function setCoverPhoto(propertyId, photoUrl) {
  const { error } = await supabase.from('properties').update({ cover_image_url: photoUrl }).eq('id', propertyId)
  if (error) throw error
}
