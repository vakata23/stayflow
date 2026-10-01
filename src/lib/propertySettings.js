import { supabase } from './supabase'

/**
 * Стойности по подразбиране, когато имотът още няма ред в property_settings
 * (собственикът не е посетил екрана с настройки). 15% комисиона съвпада с
 * подразбиращата се стойност в earnings_by_month() — ако изгледите не се
 * пипат, числата навсякъде остават консистентни.
 */
export const DEFAULT_SETTINGS = {
  ota_commission_pct: 15,
  tourist_tax: 0,
  cleaning_fee: 0,
  deposit_pct: 30,
}

export async function fetchPropertySettings(propertyId) {
  if (!propertyId) return { ...DEFAULT_SETTINGS }
  const { data } = await supabase
    .from('property_settings')
    .select('ota_commission_pct, tourist_tax, cleaning_fee, deposit_pct')
    .eq('property_id', propertyId)
    .maybeSingle()
  return data ? { ...DEFAULT_SETTINGS, ...data } : { ...DEFAULT_SETTINGS }
}

export async function savePropertySettings(propertyId, values) {
  const { error } = await supabase
    .from('property_settings')
    .upsert({ property_id: propertyId, ...values }, { onConflict: 'property_id' })
  if (error) throw error
}

export const CHANNEL_TYPES = [
  { value: 'phone', label: 'Телефон' },
  { value: 'sms', label: 'SMS' },
  { value: 'viber', label: 'Viber' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'messenger', label: 'Messenger' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'email', label: 'Имейл' },
]

export function channelLabel(type) {
  return CHANNEL_TYPES.find((c) => c.value === type)?.label ?? type
}
