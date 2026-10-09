// Реалистични тестови данни (български), с дати спрямо „днес“ по Europe/Sofia.
// Ползва се само от тестовата среда в scratchpad — нищо от това не е в репото и не отива в базата.
const sofiaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Sofia' }).format(new Date())
export const TODAY = sofiaToday()
const iso = (offset) => {
  const d = new Date(TODAY + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}
const ts = (offset, hh = 10) => `${iso(offset)}T${String(hh).padStart(2, '0')}:00:00+00:00`

const U = '0f0f0f0f-0000-4000-8000-000000000001' // auth user
export const PROFILE = '11111111-0000-4000-8000-000000000001'
const P1 = '21111111-0000-4000-8000-000000000001'
const P2 = '22222222-0000-4000-8000-000000000002'
const P3 = '23333333-0000-4000-8000-000000000003'
const id = (n) => `b${String(n).padStart(7, '0')}-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`
const PHOTO = (name, kind = 'full') => `/photos/${kind}-${name}.webp`

export const USER = {
  id: U,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'ivan.petrov@example.bg',
  app_metadata: { provider: 'email' },
  user_metadata: {},
  created_at: '2026-01-10T08:00:00Z',
}

const properties = [
  {
    id: P1, owner_id: PROFILE, name: 'Вила „Тихи бряг“', address: 'ул. Крайбрежна 12', city: 'Царево', property_type: 'house', max_guests: 6,
    wifi_name: 'TihiBryag', wifi_password: '********', access_code: '4821', house_rules: 'Тишина след 22:00.', cover_image_url: PHOTO(116),
    created_at: '2026-02-01T08:00:00Z', ical_token: 'c1111111-0000-4000-8000-000000000001', ical_url: null,
    channels: [{ type: 'viber', value: '+359 88 712 4093' }, { type: 'phone', value: '+359 88 712 4093' }],
    slug: 'tihi-bryag', is_listed: true, public_description: 'Двуетажна къща на 200 метра от плажа.', bedrooms: 3, beds: 5, bathrooms: 2, area_m2: 94,
    amenities: ['wifi', 'parking', 'ac', 'kitchen', 'balcony'], checkin_time: '14:00', checkout_time: '11:00', smoking_allowed: false, parties_allowed: false,
    cancellation_policy: 'moderate', lat: 42.1667, lng: 27.8667, public_description_en: null, accent_color: '#a8652a', ai_assistant: false,
  },
  {
    id: P2, owner_id: PROFILE, name: 'Студио „Морски бриз“', address: 'ул. Аполония 5', city: 'Созопол', property_type: 'apartment', max_guests: 2,
    wifi_name: 'MorskiBriz', wifi_password: '********', access_code: '1976', house_rules: null, cover_image_url: PHOTO(37),
    created_at: '2026-03-05T08:00:00Z', ical_token: 'c2222222-0000-4000-8000-000000000002', ical_url: 'https://www.airbnb.com/calendar/ical/123.ics',
    channels: [], slug: 'morski-briz', is_listed: false, public_description: null, bedrooms: 1, beds: 1, bathrooms: 1, area_m2: 32,
    amenities: ['wifi', 'ac'], checkin_time: '14:00', checkout_time: '11:00', smoking_allowed: false, parties_allowed: false,
    cancellation_policy: 'flexible', lat: null, lng: null, public_description_en: null, accent_color: null, ai_assistant: false,
  },
  {
    id: P3, owner_id: PROFILE, name: 'Апартамент „Витоша Вю“', address: 'бул. Черни връх 40', city: 'София', property_type: 'apartment', max_guests: 4,
    wifi_name: 'VitoshaView', wifi_password: '********', access_code: '3355', house_rules: 'Без пушене.', cover_image_url: PHOTO(164),
    created_at: '2026-04-12T08:00:00Z', ical_token: 'c3333333-0000-4000-8000-000000000003', ical_url: null,
    channels: [], slug: null, is_listed: false, public_description: null, bedrooms: 2, beds: 3, bathrooms: 1, area_m2: 61,
    amenities: ['wifi', 'parking', 'heating', 'washer'], checkin_time: '15:00', checkout_time: '11:00', smoking_allowed: false, parties_allowed: false,
    cancellation_policy: 'strict', lat: null, lng: null, public_description_en: null, accent_color: null, ai_assistant: false,
  },
]

const b = (n, property_id, guest_name, inOff, outOff, source, status, total, commission, guests = 2, extra = {}) => ({
  id: id(n), property_id, guest_name, guest_phone: '+359 88 ' + String(1000000 + n * 7919).slice(0, 3) + ' ' + String(1000 + n * 37), guest_email: null,
  check_in: iso(inOff), check_out: iso(outOff), num_guests: guests, total_price: total, source, status, notes: null,
  created_at: ts(inOff - 20), external_uid: null, commission, tourist_tax: guests * (outOff - inOff) * 2, ...extra,
})

const bookings = [
  b(1, P1, 'Мария Петрова', -2, 2, 'direct', 'confirmed', 520, 0, 4),
  b(2, P2, 'Георги Димитров', -1, 1, 'booking', 'confirmed', 180, 27, 2),
  b(3, P1, 'Anna Schmidt', 0, 3, 'airbnb', 'confirmed', 390, 58.5, 3),
  b(4, P3, 'Николай Иванов', 1, 5, 'manual', 'confirmed', 360, 0, 2),
  b(5, P2, 'Елена Стоянова', 2, 4, 'direct', 'confirmed', 170, 0, 2),
  b(6, P1, 'Peter van Dijk', 4, 9, 'booking', 'confirmed', 650, 97.5, 5),
  b(7, P3, 'Виктория Колева', 6, 8, 'airbnb', 'pending', 190, 28.5, 2),
  b(8, P2, 'Стефан Маринов', 9, 12, 'booking', 'confirmed', 255, 38.25, 2),
  b(9, P1, 'Ралица Тодорова', 13, 17, 'direct', 'confirmed', 480, 0, 4),
  b(10, P3, 'Daniel Rossi', 19, 24, 'airbnb', 'confirmed', 500, 75, 3),
  b(11, P1, 'Борис Костов', -12, -8, 'direct', 'confirmed', 470, 0, 4),
  b(12, P2, 'Katarina Novak', -20, -16, 'booking', 'confirmed', 330, 49.5, 2),
  b(13, P3, 'Мартин Георгиев', -15, -11, 'manual', 'cancelled', 400, 0, 2),
  b(14, P1, 'Силвия Йорданова', -28, -23, 'airbnb', 'confirmed', 610, 91.5, 5),
]

const payments = [
  { id: 'd0000001-0000-4000-8000-000000000001', booking_id: id(1), kind: 'deposit', amount: 156, method: 'bank', paid_at: ts(-22), external_ref: null, note: null },
  { id: 'd0000002-0000-4000-8000-000000000002', booking_id: id(1), kind: 'balance', amount: 364, method: 'cash', paid_at: ts(-2), external_ref: null, note: null },
  { id: 'd0000003-0000-4000-8000-000000000003', booking_id: id(6), kind: 'deposit', amount: 200, method: 'card', paid_at: ts(-3), external_ref: null, note: null },
]

const photos = [
  ...[116, 42, 10, 37, 1018, 1043, 164, 1015].map((n, i) => ({
    id: `e1000000-0000-4000-8000-0000000000${String(i).padStart(2, '0')}`, property_id: P1, photo_url: PHOTO(n), position: i, created_at: ts(-90), thumb_url: PHOTO(n, 'thumb'),
    room: ['exterior', 'kitchen', 'view', 'terrace', 'view', 'exterior', 'living', 'view'][i],
  })),
]

const requests = [
  { id: 'f0000001-0000-4000-8000-000000000001', property_id: P1, check_in: iso(21), check_out: iso(25), num_guests: 4, guest_name: 'Ивайло Христов', guest_phone: '+359 88 712 4093', guest_email: null,
    message: 'Здравейте, имате ли място за малко куче?', quoted_total: 348, quoted_deposit: 104.4, status: 'pending', decided_at: null, ip_address: null, created_at: ts(-1, 9) },
  { id: 'f0000002-0000-4000-8000-000000000002', property_id: P3, check_in: iso(30), check_out: iso(33), num_guests: 2, guest_name: 'Teodora Lazarova', guest_phone: null, guest_email: 'teodora@example.bg',
    message: null, quoted_total: 210, quoted_deposit: 63, status: 'pending', decided_at: null, ip_address: null, created_at: ts(0, 7) },
  { id: 'f0000003-0000-4000-8000-000000000003', property_id: P1, check_in: iso(-30), check_out: iso(-26), num_guests: 2, guest_name: 'Радостин Пенев', guest_phone: '+359 87 420 1188', guest_email: null,
    message: null, quoted_total: 300, quoted_deposit: 90, status: 'accepted', decided_at: ts(-33), ip_address: null, created_at: ts(-34) },
]

const cleaning_tasks = [
  { id: 'a0000001-0000-4000-8000-000000000001', property_id: P1, booking_id: id(1), assigned_to: 'Донка', due_date: iso(2), status: 'pending', notes: 'Смяна на бельо и кърпи', created_at: ts(-3) },
  { id: 'a0000002-0000-4000-8000-000000000002', property_id: P2, booking_id: id(2), assigned_to: 'Донка', due_date: iso(1), status: 'in_progress', notes: null, created_at: ts(-3) },
  { id: 'a0000003-0000-4000-8000-000000000003', property_id: P3, booking_id: null, assigned_to: 'Цвета', due_date: iso(-1), status: 'pending', notes: 'Просрочена: генерално почистване', created_at: ts(-6) },
  { id: 'a0000004-0000-4000-8000-000000000004', property_id: P1, booking_id: id(11), assigned_to: 'Цвета', due_date: iso(-8), status: 'done', notes: null, created_at: ts(-12) },
]

const cleaning_notes = [
  { id: 'a1000001-0000-4000-8000-000000000001', property_id: P1, task_id: 'a0000004-0000-4000-8000-000000000004', note_text: 'Счупена чаша за вино в кухнята, останалите са цели.', photo_url: null, issue_type: 'damage', created_at: ts(-8) },
  { id: 'a1000002-0000-4000-8000-000000000002', property_id: P2, task_id: null, note_text: 'Липсва дистанционното на климатика.', photo_url: null, issue_type: 'missing_item', created_at: ts(-4) },
]

const pricing_rules = [
  { id: 'c0000001-0000-4000-8000-000000000001', property_id: P1, start_date: iso(-60), end_date: iso(40), price_per_night: 87, min_nights: 2, created_at: ts(-70) },
  { id: 'c0000002-0000-4000-8000-000000000002', property_id: P1, start_date: iso(41), end_date: iso(120), price_per_night: 65, min_nights: 3, created_at: ts(-70) },
  { id: 'c0000003-0000-4000-8000-000000000003', property_id: P2, start_date: iso(-30), end_date: iso(60), price_per_night: 58, min_nights: 1, created_at: ts(-40) },
]

const money_entries = [
  { id: '10000001-0000-4000-8000-000000000001', profile_id: PROFILE, property_id: P1, kind: 'expense', category: 'Ток', amount: 84.2, entry_date: iso(-9), note: 'Сметка за септември', receipt_path: null, created_at: ts(-9), rule_id: null, booking_id: null, is_auto: false, auto_period: null },
  { id: '10000002-0000-4000-8000-000000000002', profile_id: PROFILE, property_id: P2, kind: 'expense', category: 'Интернет/ТВ', amount: 20, entry_date: iso(-3), note: 'Интернет', receipt_path: null, created_at: ts(-3), rule_id: 'e0000001-0000-4000-8000-000000000001', booking_id: null, is_auto: true, auto_period: iso(-3).slice(0, 8) + '01' },
  { id: '10000003-0000-4000-8000-000000000003', profile_id: PROFILE, property_id: P1, kind: 'expense', category: 'Почистване', amount: 25, entry_date: iso(-8), note: 'Почистване', receipt_path: null, created_at: ts(-8), rule_id: 'e0000002-0000-4000-8000-000000000002', booking_id: id(11), is_auto: true, auto_period: null },
  { id: '10000004-0000-4000-8000-000000000004', profile_id: PROFILE, property_id: P3, kind: 'expense', category: 'Ремонт', amount: 140, entry_date: iso(-14), note: 'Смесител в банята', receipt_path: null, created_at: ts(-14), rule_id: null, booking_id: null, is_auto: false, auto_period: null },
  { id: '10000005-0000-4000-8000-000000000005', profile_id: PROFILE, property_id: P1, kind: 'income', category: 'Допълнителна услуга', amount: 35, entry_date: iso(-2), note: 'Късно напускане', receipt_path: null, created_at: ts(-2), rule_id: null, booking_id: null, is_auto: false, auto_period: null },
  { id: '10000006-0000-4000-8000-000000000006', profile_id: PROFILE, property_id: null, kind: 'expense', category: 'Счетоводство', amount: 60, entry_date: iso(-5), note: null, receipt_path: null, created_at: ts(-5), rule_id: null, booking_id: null, is_auto: false, auto_period: null },
]

const recurring_rules = [
  { id: 'e0000001-0000-4000-8000-000000000001', profile_id: PROFILE, property_id: P2, kind: 'expense', category: 'Интернет/ТВ', label: 'Интернет', amount: 20, frequency: 'monthly', day_of_month: 5, starts_on: iso(-80), ends_on: null, active: true, created_at: ts(-80) },
  { id: 'e0000002-0000-4000-8000-000000000002', profile_id: PROFILE, property_id: null, kind: 'expense', category: 'Почистване', label: 'Почистване', amount: 25, frequency: 'per_stay', day_of_month: null, starts_on: iso(-80), ends_on: null, active: true, created_at: ts(-80) },
  { id: 'e0000003-0000-4000-8000-000000000003', profile_id: PROFILE, property_id: P1, kind: 'income', category: 'Допълнителна услуга', label: 'Закуска', amount: 8, frequency: 'per_night', day_of_month: null, starts_on: iso(-80), ends_on: null, active: false, created_at: ts(-80) },
]

const invoices = [
  { id: '30000001-0000-4000-8000-000000000001', booking_id: id(11), invoice_number: '0000000012', guest_details: { name: 'Борис Костов', address: 'гр. Варна, ул. Хан Аспарух 8' }, amount: 470, issue_date: iso(-8), pdf_url: null, created_at: ts(-8) },
  { id: '30000002-0000-4000-8000-000000000002', booking_id: id(14), invoice_number: '0000000011', guest_details: { name: 'Силвия Йорданова' }, amount: 610, issue_date: iso(-23), pdf_url: null, created_at: ts(-23) },
]

const notification_targets = [
  { id: '40000001-0000-4000-8000-000000000001', profile_id: PROFILE, channel: 'telegram', address: '123456789', events: ['new_booking_request'], is_enabled: true, created_at: ts(-12) },
]

const outbox = [
  { id: '41000001-0000-4000-8000-000000000001', profile_id: PROFILE, target_id: '40000001-0000-4000-8000-000000000001', channel: 'telegram', recipient: '123456789', event: 'new_booking_request', payload: { guest_name: 'Teodora Lazarova' }, status: 'sent', attempts: 1, last_error: null, created_at: ts(0, 7), sent_at: ts(0, 7) },
  { id: '41000002-0000-4000-8000-000000000002', profile_id: PROFILE, target_id: '40000001-0000-4000-8000-000000000001', channel: 'telegram', recipient: '123456789', event: 'new_booking_request', payload: { guest_name: 'Ивайло Христов' }, status: 'sent', attempts: 2, last_error: null, created_at: ts(-1, 9), sent_at: ts(-1, 9) },
  { id: '41000003-0000-4000-8000-000000000003', profile_id: PROFILE, target_id: '40000001-0000-4000-8000-000000000001', channel: 'telegram', recipient: '123456789', event: 'test', payload: {}, status: 'failed', attempts: 5, last_error: 'Telegram: Bad Request: chat not found', created_at: ts(-12), sent_at: null },
]

const reviews = [
  { id: '50000001-0000-4000-8000-000000000001', property_id: P1, guest_name: 'Мария К.', rating: 5, comment: 'Невероятен изглед към морето и много чисто.', stayed_on: iso(-60), created_at: ts(-58) },
  { id: '50000002-0000-4000-8000-000000000002', property_id: P1, guest_name: 'Georg P.', rating: 4, comment: 'Удобно разположена къща, домакинът отговаря бързо.', stayed_on: iso(-40), created_at: ts(-38) },
]

const property_settings = [
  { property_id: P1, ota_commission_pct: 15, tourist_tax: 2, cleaning_fee: 25, deposit_pct: 30, created_at: ts(-90), base_price: 87 },
  { property_id: P2, ota_commission_pct: 15, tourist_tax: 2, cleaning_fee: 15, deposit_pct: 30, created_at: ts(-90), base_price: 58 },
  { property_id: P3, ota_commission_pct: 15, tourist_tax: 1, cleaning_fee: 20, deposit_pct: 30, created_at: ts(-90), base_price: 72 },
]

const booking_balances = bookings.map((x) => {
  const paid = payments.filter((p) => p.booking_id === x.id).reduce((a, p) => a + (p.kind === 'refund' ? -p.amount : p.amount), 0)
  const due = (x.total_price ?? 0) + x.tourist_tax - x.commission
  return { booking_id: x.id, property_id: x.property_id, guest_name: x.guest_name, check_in: x.check_in, check_out: x.check_out, status: x.status, source: x.source, due, paid, outstanding: due - paid }
})

export const TABLES = {
  profiles: [{ id: PROFILE, user_id: U, full_name: 'Иван Петров', company_name: 'Морски имоти ЕООД', phone: '+359 88 712 4093', created_at: '2026-01-10T08:00:00Z' }],
  properties, bookings, payments, property_photos: photos, booking_requests: requests, cleaning_tasks, cleaning_notes, pricing_rules,
  money_entries, recurring_rules, invoices, notification_targets, outbox, reviews, property_settings, booking_balances, ai_runs: [],
}

// ---------------------------------------------------------------- RPC
const eachNight = (from, to, fn) => {
  for (let d = new Date(from + 'T00:00:00Z'); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) fn(d.toISOString().slice(0, 10))
}
const monthsBetween = (from, to) => {
  const out = []
  const d = new Date(from.slice(0, 8) + '01T00:00:00Z')
  while (d.toISOString().slice(0, 7) <= to.slice(0, 7)) {
    out.push(d.toISOString().slice(0, 7))
    d.setUTCMonth(d.getUTCMonth() + 1)
  }
  return out
}
const daysIn = (ym) => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate()
const r2 = (n) => Math.round(n * 100) / 100

function earningsByMonth(from, to) {
  return monthsBetween(from, to).map((ym) => {
    const monthStart = ym + '-01'
    const monthEnd = ym + '-' + String(daysIn(ym)).padStart(2, '0')
    const dFrom = monthStart < from ? from : monthStart
    const dTo = monthEnd > to ? to : monthEnd
    const days = (new Date(dTo) - new Date(dFrom)) / 86400000 + 1
    let sold = 0, revenue = 0, commission = 0, direct = 0, ota = 0
    for (const x of bookings.filter((bk) => bk.status === 'confirmed')) {
      const n = (new Date(x.check_out) - new Date(x.check_in)) / 86400000
      eachNight(x.check_in, iso0(x.check_out, -1), (night) => {
        if (night < dFrom || night > dTo) return
        sold++
        const rev = (x.total_price ?? 0) / n
        revenue += rev
        commission += x.commission / n
        if (x.source === 'airbnb' || x.source === 'booking') ota += rev
        else direct += rev
      })
    }
    const available = days * properties.length
    const inMonth = (e) => e.entry_date >= dFrom && e.entry_date <= dTo
    const otherIncome = money_entries.filter((e) => e.kind === 'income' && inMonth(e)).reduce((a, e) => a + e.amount, 0)
    const expenses = money_entries.filter((e) => e.kind === 'expense' && inMonth(e)).reduce((a, e) => a + e.amount, 0)
    const net = revenue - commission
    return {
      month: monthStart, available_nights: available, nights_sold: sold, occupancy_pct: r2((sold / available) * 100), revenue: r2(revenue), commission: r2(commission), net: r2(net),
      adr: sold ? r2(revenue / sold) : 0, revpar: r2(revenue / available), direct_revenue: r2(direct), ota_revenue: r2(ota),
      direct_share_pct: revenue ? r2((direct / revenue) * 100) : 0, commission_saved: r2(direct * 0.15),
      other_income: r2(otherIncome), expenses: r2(expenses), profit: r2(net + otherIncome - expenses),
    }
  })
}
function iso0(date, off) {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + off)
  return d.toISOString().slice(0, 10)
}
function earningsByProperty(from, to) {
  const days = (new Date(to) - new Date(from)) / 86400000 + 1
  return properties.map((p) => {
    let sold = 0, revenue = 0, commission = 0, direct = 0
    for (const x of bookings.filter((bk) => bk.status === 'confirmed' && bk.property_id === p.id)) {
      const n = (new Date(x.check_out) - new Date(x.check_in)) / 86400000
      eachNight(x.check_in, iso0(x.check_out, -1), (night) => {
        if (night < from || night > to) return
        sold++
        const rev = (x.total_price ?? 0) / n
        revenue += rev
        commission += x.commission / n
        if (!(x.source === 'airbnb' || x.source === 'booking')) direct += rev
      })
    }
    const mine = money_entries.filter((e) => e.property_id === p.id && e.entry_date >= from && e.entry_date <= to)
    const oi = mine.filter((e) => e.kind === 'income').reduce((a, e) => a + e.amount, 0)
    const ex = mine.filter((e) => e.kind === 'expense').reduce((a, e) => a + e.amount, 0)
    return {
      property_id: p.id, property_name: p.name, nights_sold: sold, occupancy_pct: r2((sold / days) * 100), revenue: r2(revenue), net: r2(revenue - commission),
      adr: sold ? r2(revenue / sold) : 0, direct_share_pct: revenue ? r2((direct / revenue) * 100) : 0, other_income: r2(oi), expenses: r2(ex), profit: r2(revenue - commission + oi - ex),
    }
  })
}

export const RPC = {
  earnings_by_month: (a) => earningsByMonth(a.p_from, a.p_to),
  earnings_by_property: (a) => earningsByProperty(a.p_from, a.p_to),
  bookings_sold: (a) => {
    const rows = bookings.filter((x) => x.status !== 'cancelled' && x.created_at.slice(0, 10) >= a.p_from && x.created_at.slice(0, 10) <= a.p_to)
    const revenue = rows.reduce((s, x) => s + (x.total_price ?? 0), 0)
    const commission = rows.reduce((s, x) => s + x.commission, 0)
    return [{ bookings_count: rows.length, revenue: r2(revenue), commission: r2(commission), net: r2(revenue - commission) }]
  },
  generate_my_auto_entries: () => 0,
  send_test_notification: () => null,
  start_ai_run: () => null,
}
