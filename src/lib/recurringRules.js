import { supabase } from './supabase'

/** Тънки Supabase обвивки; чистата логика е в ruleLogic.js. */
export * from './ruleLogic.js'

// ---------------------------------------------------------------- Supabase

export async function fetchRules() {
  const { data, error } = await supabase
    .from('recurring_rules')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function createRules(rules) {
  if (rules.length === 0) return
  const { error } = await supabase.from('recurring_rules').insert(rules)
  if (error) throw error
}

export async function updateRule(id, values) {
  const { error } = await supabase.from('recurring_rules').update(values).eq('id', id)
  if (error) throw error
}

/** Колко автоматични записа има правилото (за въпроса при изтриване). */
export async function countAutoEntries(ruleId) {
  const { count, error } = await supabase
    .from('money_entries')
    .select('id', { count: 'exact', head: true })
    .eq('rule_id', ruleId)
    .eq('is_auto', true)
  if (error) throw error
  return count ?? 0
}

export async function deleteRule(id, removeEntries) {
  const { data, error } = await supabase.rpc('delete_recurring_rule', {
    p_rule_id: id,
    p_remove_entries: removeEntries,
  })
  if (error) throw error
  return data ?? 0
}

/** Пуска генератора за текущия собственик (без параметри — само негови правила). */
export async function generateMyAutoEntries() {
  const { data, error } = await supabase.rpc('generate_my_auto_entries')
  if (error) throw error
  return data ?? 0
}

export async function countAutoEntriesInRange(from, to) {
  const { count, error } = await supabase
    .from('money_entries')
    .select('id', { count: 'exact', head: true })
    .eq('is_auto', true)
    .gte('entry_date', from)
    .lte('entry_date', to)
  if (error) throw error
  return count ?? 0
}
