import { supabase } from './supabase'
import { declarationState, attentionCounts } from './declarationLogic'

/**
 * Достъп до номера на имота и декларациите за престой (миграция 017). Докато миграцията не е пусната,
 * таблиците ги няма — тогава Гърция просто не се вижда (registryAvailable() = false), останалото работи както преди.
 */

let availability = null

const isMissing = (error) =>
  error.code === 'PGRST205' ||
  error.code === '42P01' ||
  (/(property_registry|stay_declarations)/.test(error.message ?? '') && /(schema cache|does not exist|could not find)/i.test(error.message ?? ''))

/** Има ли таблицата property_registry (веднъж на зареждане на страницата). */
export function registryAvailable() {
  availability ??= supabase
    .from('property_registry')
    .select('property_id')
    .limit(1)
    .then(({ error }) => !(error && isMissing(error)))
    .catch(() => true)
  return availability
}

/** Редът с номера на един имот или null. */
export async function loadRegistry(propertyId) {
  if (!(await registryAvailable())) return null
  const { data } = await supabase.from('property_registry').select('*').eq('property_id', propertyId).maybeSingle()
  return data ?? null
}

/** Редовете за няколко имота като карта property_id → ред. */
export async function loadRegistries(propertyIds) {
  if (!propertyIds?.length || !(await registryAvailable())) return {}
  const { data } = await supabase.from('property_registry').select('*').in('property_id', propertyIds)
  return Object.fromEntries((data ?? []).map((r) => [r.property_id, r]))
}

/** Има ли поне един имот в Гърция — за менюто. */
export async function hasGreekProperty() {
  if (!(await registryAvailable())) return false
  const { count } = await supabase.from('property_registry').select('property_id', { count: 'exact', head: true }).eq('country', 'GR')
  return (count ?? 0) > 0
}

export async function saveRegistry(propertyId, { country, kind, number, atak }) {
  const { error } = await supabase.from('property_registry').upsert(
    {
      property_id: propertyId,
      country,
      kind,
      number: number?.trim() || null,
      atak: atak?.trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'property_id' }
  )
  if (error) throw error
}

/** Видът и номерът за публичната страница (null, ако имотът не е в Гърция, няма номер или не е публикуван). */
export async function loadPublicRegistration(slug) {
  const { data, error } = await supabase.rpc('public_registration', { p_slug: slug })
  if (error || !data?.length) return null
  return data[0]
}

export async function loadDeclaration(bookingId) {
  if (!bookingId || !(await registryAvailable())) return null
  const { data } = await supabase.from('stay_declarations').select('*').eq('booking_id', bookingId).maybeSingle()
  return data ?? null
}

/** Записва данните за декларацията. Подадената остава подадена; празна форма не създава ред. */
export async function saveDeclaration(bookingId, values) {
  const payload = {
    booking_id: bookingId,
    guest_country: values.guest_country || null,
    guest_tax_id: values.guest_country === 'GR' ? values.guest_tax_id?.trim() || null : null,
    guest_passport: values.guest_country && values.guest_country !== 'GR' ? values.guest_passport?.trim() || null : null,
    guest_doc_name: values.guest_country && values.guest_country !== 'GR' ? values.guest_doc_name?.trim() || null : null,
    pay_method: values.pay_method || null,
    updated_at: new Date().toISOString(),
  }
  const empty = !payload.guest_country && !payload.pay_method
  if (empty) {
    // нищо за пазене; ако е имало ред, изтриваме го само когато не е подаден
    await supabase.from('stay_declarations').delete().eq('booking_id', bookingId).eq('status', 'pending')
    return
  }
  const { error } = await supabase.from('stay_declarations').upsert(payload, { onConflict: 'booking_id' })
  if (error) throw error
}

export async function setSubmitted(bookingId, submitted) {
  const { error } = await supabase.from('stay_declarations').upsert(
    {
      booking_id: bookingId,
      status: submitted ? 'submitted' : 'pending',
      submitted_at: submitted ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'booking_id' }
  )
  if (error) throw error
}

/**
 * Всички резервации на имоти в Гърция с изчислено състояние на декларацията.
 * Връща [] (без грешка), ако Гърция още не е включена.
 */
export async function loadDeclarationItems(today) {
  if (!(await registryAvailable())) return []
  const { data: regs } = await supabase.from('property_registry').select('*').eq('country', 'GR')
  if (!regs?.length) return []
  const ids = regs.map((r) => r.property_id)
  const [{ data: props }, { data: bookings }] = await Promise.all([
    supabase.from('properties').select('id, name').in('id', ids),
    supabase
      .from('bookings')
      .select('id, property_id, guest_name, check_in, check_out, total_price, source, status')
      .in('property_id', ids)
      .order('check_out', { ascending: false }),
  ])
  const bookingIds = (bookings ?? []).map((b) => b.id)
  const { data: decls } = bookingIds.length ? await supabase.from('stay_declarations').select('*').in('booking_id', bookingIds) : { data: [] }
  const declBy = Object.fromEntries((decls ?? []).map((d) => [d.booking_id, d]))
  const regBy = Object.fromEntries(regs.map((r) => [r.property_id, r]))
  const nameBy = Object.fromEntries((props ?? []).map((p) => [p.id, p.name]))
  return (bookings ?? []).map((b) => ({
    booking: b,
    decl: declBy[b.id] ?? null,
    registry: regBy[b.property_id],
    propertyName: nameBy[b.property_id] ?? '',
    ...declarationState(b, declBy[b.id] ?? null, today),
  }))
}

/** Броячите за таблото. */
export async function fetchDeclarationFacts(today) {
  const items = await loadDeclarationItems(today)
  const c = attentionCounts(items)
  return { declarationsOverdue: c.overdue, declarationsDue: c.due, declarationsNextDeadline: c.nextDeadline }
}
