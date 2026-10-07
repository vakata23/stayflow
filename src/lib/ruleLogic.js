/**
 * Чиста логика на автоматичните правила — без Supabase и без браузър, за да
 * се тества в Node. Нищо не се измисля: правило се създава само от въведена
 * от собственика сума.
 */

// Категориите са тези от money_entries (008); по-фините имена от съветника
// („Пране/бельо“, „Закуска“…) се пазят в label и се виждат в списъка.
export const EXPENSE_OPTIONS = [
  { key: 'electricity', label: 'Ток', category: 'Ток', frequency: 'monthly' },
  { key: 'water', label: 'Вода', category: 'Вода', frequency: 'monthly' },
  { key: 'internet', label: 'Интернет/ТВ', category: 'Интернет/ТВ', frequency: 'monthly' },
  { key: 'cleaning', label: 'Почистване', category: 'Почистване', frequency: 'per_stay' },
  { key: 'laundry', label: 'Пране/бельо', category: 'Почистване', frequency: 'per_stay' },
  { key: 'supplies', label: 'Консумативи', hint: 'кафе, сапун, хартия', category: 'Консумативи', frequency: 'per_stay' },
  { key: 'accounting', label: 'Счетоводство', category: 'Счетоводство', frequency: 'monthly' },
  { key: 'ads', label: 'Реклама/платформи', category: 'Реклама', frequency: 'monthly' },
  { key: 'taxes', label: 'Данъци и такси', category: 'Данъци и такси', frequency: 'monthly' },
  { key: 'other', label: 'Друго', category: 'Друго', frequency: 'monthly', askName: true },
]

export const INCOME_OPTIONS = [
  { key: 'breakfast', label: 'Закуска', category: 'Допълнителна услуга', frequency: 'per_stay' },
  { key: 'transfer', label: 'Трансфер', category: 'Допълнителна услуга', frequency: 'per_stay' },
  { key: 'late_checkin', label: 'Късно настаняване', category: 'Допълнителна услуга', frequency: 'per_stay' },
  { key: 'parking', label: 'Паркинг', category: 'Допълнителна услуга', frequency: 'per_night' },
  { key: 'pet', label: 'Домашен любимец', category: 'Допълнителна услуга', frequency: 'per_stay' },
  { key: 'other', label: 'Друго', category: 'Друго', frequency: 'per_stay', askName: true },
]

export const FREQUENCIES = {
  monthly: 'на месец',
  per_stay: 'на резервация',
  per_night: 'на нощувка',
}
export const EXPENSE_FREQUENCIES = ['monthly', 'per_stay', 'per_night']
export const INCOME_FREQUENCIES = ['per_stay', 'per_night']

export const CLEANING_FEE_NOTE =
  'Таксата за почистване, която плаща гостът, вече е в цената на резервацията (в „Приходи“). ' +
  'Тук въвеждате само това, което ВИЕ плащате за почистване — не го добавяйте и като приход.'

const money = (n) => Number(n).toFixed(2).replace(/\.00$/, '')

export function ruleShort(rule) {
  const freq =
    rule.frequency === 'monthly' && rule.day_of_month
      ? `на месец (${rule.day_of_month}-о число)`
      : FREQUENCIES[rule.frequency]
  return `${rule.label} ${money(rule.amount)} € ${freq}`
}

export function ruleTooltip(rule) {
  return `Генерирано от правило: ${ruleShort(rule)}. Оценка по вашите правила — ако е различно, редактирайте записа.`
}

const sameRule = (a, b) =>
  a.kind === b.kind &&
  a.category === b.category &&
  a.label.trim().toLowerCase() === b.label.trim().toLowerCase() &&
  (a.property_id || null) === (b.property_id || null) &&
  a.frequency === b.frequency

/**
 * answers: [{ kind, key, name?, amount, frequency, day_of_month?, property_id? }]
 * Празна/невалидна сума → правило не се създава. Връща { rules, skipped }.
 */
export function buildRulesFromAnswers(answers, { profileId, today, existingRules = [] }) {
  const rules = []
  const skipped = []

  for (const a of answers) {
    const options = a.kind === 'income' ? INCOME_OPTIONS : EXPENSE_OPTIONS
    const option = options.find((o) => o.key === a.key)
    if (!option) continue

    const label = (option.askName && a.name?.trim()) || option.label
    const amount = Number(String(a.amount ?? '').replace(',', '.'))
    if (a.amount === '' || a.amount == null || !Number.isFinite(amount) || amount <= 0) {
      skipped.push({ label, reason: 'empty' })
      continue
    }

    const allowed = a.kind === 'income' ? INCOME_FREQUENCIES : EXPENSE_FREQUENCIES
    if (!allowed.includes(a.frequency)) {
      skipped.push({ label, reason: 'frequency' })
      continue
    }

    let day = null
    if (a.frequency === 'monthly') {
      day = Number(a.day_of_month)
      if (!Number.isInteger(day) || day < 1 || day > 31) {
        skipped.push({ label, reason: 'day' })
        continue
      }
    }

    const rule = {
      profile_id: profileId,
      property_id: a.property_id || null,
      kind: a.kind,
      category: option.category,
      label: label.slice(0, 80),
      amount: Math.round(amount * 100) / 100,
      frequency: a.frequency,
      day_of_month: day,
      starts_on: a.starts_on || today,
      active: true,
    }

    if ([...existingRules, ...rules].some((r) => sameRule(r, rule))) {
      skipped.push({ label, reason: 'duplicate' })
      continue
    }
    rules.push(rule)
  }

  return { rules, skipped }
}

export const SKIP_REASONS = {
  empty: 'без сума',
  frequency: 'невалидна честота',
  day: 'без ден от месеца',
  duplicate: 'вече има такова правило',
}
