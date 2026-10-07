import { supabase } from './supabase'
import { compressImage } from './imageCompression'

const BUCKET = 'property-images'

/**
 * Качва снимка на имот в Storage — винаги през compressImage(), която маха
 * EXIF/GPS (bucket-ът е публичен; оригиналният файл от телефон издава адреса).
 * Пътят започва с auth.uid(), защото storage policy-ите от Етап 1
 * разрешават запис само в собствената папка на потребителя.
 */
export async function uploadPropertyImage(original, userId) {
  const file = await compressImage(original)
  const ext = file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${userId}/${crypto.randomUUID()}.${ext}`

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    contentType: file.type,
    upsert: false,
  })
  if (error) throw error

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}

/** Изтрива снимка по публичен URL (тихо — провалът не блокира основното действие). */
export async function removePropertyImage(publicUrl) {
  if (!publicUrl) return
  const marker = `/${BUCKET}/`
  const idx = publicUrl.indexOf(marker)
  if (idx === -1) return
  const path = publicUrl.slice(idx + marker.length)
  await supabase.storage.from(BUCKET).remove([path])
}
