import { supabase } from './supabase'

/**
 * Иска от сървъра линк за плащане с карта (Stripe) за капаро или остатък по резервацията. Сумата се смята на сървъра.
 * Връща { ok, url, amount, kind, mode } или { ok:false, configured?, error } — никога не хвърля.
 */
export async function requestPaymentLink(bookingId, kind) {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const res = await fetch('/api/stripe-checkout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session?.access_token ?? ''}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ booking_id: bookingId, kind }),
    })
    const data = await res.json().catch(() => null)
    if (data && typeof data === 'object') return { ok: false, ...data }
    return { ok: false, error: 'Неочакван отговор от сървъра.' }
  } catch {
    return { ok: false, error: 'Няма връзка със сървъра. Опитайте пак.' }
  }
}
