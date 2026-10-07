import { supabase } from './supabase'

export const EXPENSE_CATEGORIES = [
  'Почистване',
  'Ток',
  'Вода',
  'Интернет/ТВ',
  'Ремонт',
  'Консумативи',
  'Данъци и такси',
  'Счетоводство',
  'Реклама',
  'Друго',
]

export const INCOME_CATEGORIES = ['Допълнителна услуга', 'Наем извън платформа', 'Друго']

export function categoriesFor(kind) {
  return kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
}

export async function fetchMoneyEntries({ from, to }) {
  const { data, error } = await supabase
    .from('money_entries')
    .select('*')
    .gte('entry_date', from)
    .lte('entry_date', to)
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createMoneyEntry(values) {
  const { error } = await supabase.from('money_entries').insert(values)
  if (error) throw error
}

export async function updateMoneyEntry(id, values) {
  const { error } = await supabase.from('money_entries').update(values).eq('id', id)
  if (error) throw error
}

export async function deleteMoneyEntry(id) {
  const { error } = await supabase.from('money_entries').delete().eq('id', id)
  if (error) throw error
}

const RECEIPTS_BUCKET = 'receipts'
const MAX_BYTES = 5 * 1024 * 1024

/**
 * Качва снимка на касова бележка. Bucket-ът е ЧАСТЕН (виж миграция 008),
 * затова връщаме пътя, не публичен URL — показва се през signed URL.
 */
export async function uploadReceiptImage(file, userId) {
  if (!file.type.startsWith('image/')) throw new Error('Файлът трябва да е изображение.')
  if (file.size > MAX_BYTES) throw new Error('Снимката е твърде голяма (максимум 5 MB).')

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `${userId}/${crypto.randomUUID()}.${ext}`

  const { error } = await supabase.storage.from(RECEIPTS_BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  })
  if (error) throw error
  return path
}

/** Временен подписан URL за преглед на частна снимка (1 час валидност). */
export async function signedReceiptUrl(path) {
  if (!path) return null
  const { data, error } = await supabase.storage.from(RECEIPTS_BUCKET).createSignedUrl(path, 3600)
  if (error) return null
  return data.signedUrl
}

/** Изтрива снимка по път (тихо — провалът не блокира основното действие). */
export async function removeReceiptImage(path) {
  if (!path) return
  await supabase.storage.from(RECEIPTS_BUCKET).remove([path])
}
