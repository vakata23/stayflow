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
  base_price: 0,
}

export async function fetchPropertySettings(propertyId) {
  if (!propertyId) return { ...DEFAULT_SETTINGS }
  const { data } = await supabase
    .from('property_settings')
    .select('ota_commission_pct, tourist_tax, cleaning_fee, deposit_pct, base_price')
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

/** Как да отворим даден канал от публичната страница — използваемо href. */
export function channelHref(type, value) {
  const v = (value ?? '').trim()
  if (!v) return null
  const digits = v.replace(/[^\d+]/g, '')
  switch (type) {
    case 'phone':
    case 'viber':
      return `tel:${digits}`
    case 'sms':
      return `sms:${digits}`
    case 'whatsapp':
      return `https://wa.me/${digits.replace(/^\+/, '')}`
    case 'telegram':
      return `https://t.me/${v.replace(/^@/, '')}`
    case 'messenger':
      return `https://m.me/${v.replace(/^@/, '')}`
    case 'instagram':
      return `https://instagram.com/${v.replace(/^@/, '')}`
    case 'email':
      return `mailto:${v}`
    default:
      return null
  }
}
