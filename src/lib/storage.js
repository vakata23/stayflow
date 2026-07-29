import { supabase } from './supabase'

const BUCKET = 'property-images'
const MAX_BYTES = 5 * 1024 * 1024

/**
 * Качва снимка на имот в Storage.
 * Пътят започва с auth.uid(), защото storage policy-ите от Етап 1
 * разрешават запис само в собствената папка на потребителя.
 */
export async function uploadPropertyImage(file, userId) {
  if (!file.type.startsWith('image/')) {
    throw new Error('Файлът трябва да е изображение.')
  }
  if (file.size > MAX_BYTES) {
    throw new Error('Снимката е твърде голяма (максимум 5 MB).')
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `${userId}/${crypto.randomUUID()}.${ext}`

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
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
