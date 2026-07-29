import { supabase } from './supabase'

/**
 * Генерира следващия номер на фактура (10-цифрен, с водещи нули).
 * Понеже номерата са zero-padded, лексикографското сортиране съвпада с
 * числовото — затова взимаме най-големия и добавяме 1.
 * RLS гарантира, че виждаме само собствените си фактури.
 */
export async function nextInvoiceNumber() {
  const { data } = await supabase
    .from('invoices')
    .select('invoice_number')
    .order('invoice_number', { ascending: false })
    .limit(1)

  const last = data?.[0]?.invoice_number
  const next = last ? parseInt(last, 10) + 1 : 1
  return String(next).padStart(10, '0')
}
