import { supabase } from './supabase'

export const TASK_STATUSES = [
  { value: 'pending', label: 'Предстои' },
  { value: 'in_progress', label: 'В процес' },
  { value: 'done', label: 'Завършена' },
]

export const TASK_STATUS_STYLES = {
  pending: 'bg-sunken text-ink-soft',
  in_progress: 'bg-warning-soft text-warning-ink',
  done: 'bg-success-soft text-success-ink',
}

// Следващият статус при клик върху toggle бутона (кръгова смяна).
export const NEXT_STATUS = {
  pending: 'in_progress',
  in_progress: 'done',
  done: 'pending',
}

export const ISSUE_TYPES = [
  { value: 'damage', label: 'Щета' },
  { value: 'missing_item', label: 'Липсваща вещ' },
  { value: 'other', label: 'Друго' },
]

export const ISSUE_STYLES = {
  damage: 'bg-danger-soft text-danger-ink',
  missing_item: 'bg-warning-soft text-warning-ink',
  other: 'bg-sunken text-ink-soft',
}

export function taskStatusLabel(v) {
  return TASK_STATUSES.find((s) => s.value === v)?.label ?? v
}

export function issueTypeLabel(v) {
  return ISSUE_TYPES.find((s) => s.value === v)?.label ?? v
}

const NOTES_BUCKET = 'cleaning-photos'
const MAX_BYTES = 5 * 1024 * 1024

/**
 * Качва снимка към забележка. Bucket-ът е ЧАСТЕН, затова връщаме
 * пътя (не публичен URL) — снимката се показва през signed URL.
 * Пътят започва с auth.uid() заради storage policy-ите от Етап 1.
 */
export async function uploadCleaningPhoto(file, userId) {
  if (!file.type.startsWith('image/')) throw new Error('Файлът трябва да е изображение.')
  if (file.size > MAX_BYTES) throw new Error('Снимката е твърде голяма (максимум 5 MB).')

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `${userId}/${crypto.randomUUID()}.${ext}`

  const { error } = await supabase.storage.from(NOTES_BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  })
  if (error) throw error
  return path
}

/** Временен подписан URL за преглед на частна снимка (1 час валидност). */
export async function signedPhotoUrl(path) {
  if (!path) return null
  const { data, error } = await supabase.storage
    .from(NOTES_BUCKET)
    .createSignedUrl(path, 3600)
  if (error) return null
  return data.signedUrl
}
