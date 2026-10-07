import { supabase } from './supabase'

export async function fetchReviews(propertyId) {
  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('property_id', propertyId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createReview(values) {
  const { error } = await supabase.from('reviews').insert(values)
  if (error) throw error
}

export async function deleteReview(id) {
  const { error } = await supabase.from('reviews').delete().eq('id', id)
  if (error) throw error
}
