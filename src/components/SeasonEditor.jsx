import { Plus, Trash2, Snowflake, Sun, CalendarRange } from 'lucide-react'
import { Field, Input, Select, Button, IconButton, Alert } from './ui'
import {
  DAYS_IN_MONTH, SEASON_PRESETS, emptySeason, validateSeason, overlappingSeasons, uncoveredDays, seasonRangeLabel, monthLabel,
} from '../lib/seasonLogic'

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)
const PRESET_ICONS = { winter: Snowflake, summer: Sun }

/**
 * Редактор на сезонни цени: списък от сезони („от ден/месец до ден/месец“, цена, минимален престой), които се
 * повтарят всяка година. Контролиран (seasons/onChange), без запис — ползва се и при създаване на имот (чернови),
 * и при управление на имота (SeasonPrices го обвива със запис). Основната цена е за останалото време.
 */
export default function SeasonEditor({ seasons, onChange, basePrice, showErrors = false, disabled = false }) {
  const update = (key, patch) => onChange(seasons.map((s) => (s.key === key ? { ...s, ...patch } : s)))
  const remove = (key) => onChange(seasons.filter((s) => s.key !== key))
  const add = (presetKey) => onChange([...seasons, emptySeason(presetKey)])

  const free = uncoveredDays(seasons.filter((s) => validateSeason({ ...s, price_per_night: '1' }) === null))
  const base = Number(basePrice) > 0 ? `${Number(basePrice)} €` : null

  return (
    <div className="space-y-4">
      {seasons.length === 0 ? (
        <p className="text-sm text-ink-soft">
          Сега цената е една за цялата година{base ? ` (${base} на нощувка)` : ''}. Добавете сезон, ако цената се променя —
          например по-ниска през зимата и по-висока през лятото.
        </p>
      ) : (
        <ul className="space-y-4">
          {seasons.map((s, i) => {
            const problem = validateSeason(s)
            // периодът и застъпването не зависят от цената — показват се, щом датите са наред
            const datesOk = validateSeason({ ...s, price_per_night: '1', min_nights: s.min_nights || 1 }) === null
            const clashes = datesOk ? overlappingSeasons(s, seasons.filter((o) => validateSeason({ ...o, price_per_night: '1', min_nights: o.min_nights || 1 }) === null)) : []
            const sid = `season-${s.key}`
            return (
              <li key={s.key} className="rounded-2xl border border-line bg-card p-4 sm:p-5" aria-labelledby={`${sid}-title`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 id={`${sid}-title`} className="text-sm font-semibold text-ink">
                      {s.name.trim() || `Сезон ${i + 1}`}
                    </h3>
                    {datesOk && (
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted">
                        <CalendarRange className="h-3.5 w-3.5" aria-hidden="true" />
                        {seasonRangeLabel(s)}, всяка година
                      </p>
                    )}
                  </div>
                  <IconButton label={`Премахни сезон ${s.name.trim() || i + 1}`} tone="danger" onClick={() => remove(s.key)} disabled={disabled}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </IconButton>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field label="Име на сезона (по избор)">
                    <Input value={s.name} maxLength={60} onChange={(e) => update(s.key, { name: e.target.value })} placeholder="напр. Зима, Лято, Празници" disabled={disabled} />
                  </Field>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Цена на нощувка (€)" required>
                      <Input type="number" inputMode="decimal" min={0} step="0.01" value={s.price_per_night} onChange={(e) => update(s.key, { price_per_night: e.target.value })} placeholder="70" disabled={disabled} />
                    </Field>
                    <Field label="Мин. нощувки">
                      <Input type="number" inputMode="numeric" min={1} step="1" value={s.min_nights} onChange={(e) => update(s.key, { min_nights: e.target.value })} disabled={disabled} />
                    </Field>
                  </div>

                  <fieldset className="min-w-0">
                    <legend className="field-label mb-1.5">Започва</legend>
                    <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2">
                      <Input type="number" inputMode="numeric" min={1} max={DAYS_IN_MONTH[Number(s.start_month) - 1] ?? 31} aria-label={`Сезон ${i + 1}: начало, ден от месеца`} value={s.start_day} onChange={(e) => update(s.key, { start_day: e.target.value })} disabled={disabled} />
                      <Select aria-label={`Сезон ${i + 1}: начало, месец`} value={s.start_month} onChange={(e) => update(s.key, { start_month: Number(e.target.value) })} disabled={disabled}>
                        {MONTHS.map((m) => (
                          <option key={m} value={m}>
                            {monthLabel(m)}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </fieldset>
                  <fieldset className="min-w-0">
                    <legend className="field-label mb-1.5">Свършва (включително)</legend>
                    <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2">
                      <Input type="number" inputMode="numeric" min={1} max={DAYS_IN_MONTH[Number(s.end_month) - 1] ?? 31} aria-label={`Сезон ${i + 1}: край, ден от месеца`} value={s.end_day} onChange={(e) => update(s.key, { end_day: e.target.value })} disabled={disabled} />
                      <Select aria-label={`Сезон ${i + 1}: край, месец`} value={s.end_month} onChange={(e) => update(s.key, { end_month: Number(e.target.value) })} disabled={disabled}>
                        {MONTHS.map((m) => (
                          <option key={m} value={m}>
                            {monthLabel(m)}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </fieldset>
                </div>

                {showErrors && problem && (
                  <Alert kind="error" className="mt-4">
                    {problem}
                  </Alert>
                )}
                {clashes.length > 0 && (
                  <Alert kind="info" className="mt-4">
                    Застъпва се със {clashes.map((c) => `„${c.name.trim() || 'сезон'}“ (${seasonRangeLabel(c)})`).join(', ')} — в общите дни важи по-новият сезон.
                  </Alert>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        {SEASON_PRESETS.map((p) => {
          const Icon = PRESET_ICONS[p.key] ?? Plus
          return (
            <Button key={p.key} type="button" variant="secondary" size="sm" onClick={() => add(p.key)} disabled={disabled}>
              <Icon className="h-4 w-4" aria-hidden="true" />
              {p.name} ({monthLabel(p.start_month)}–{monthLabel(p.end_month)})
            </Button>
          )
        })}
        <Button type="button" variant="secondary" size="sm" onClick={() => add()} disabled={disabled}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Друг период
        </Button>
      </div>

      {seasons.length > 0 && (
        <p className="text-xs text-ink-muted">
          {free === 0
            ? 'Сезоните покриват цялата година — основната цена не се ползва.'
            : `Извън сезоните важи основната цена${base ? ` (${base} на нощувка)` : ' — задайте я в „Настройки на имота“'}. Това са ${free} ${free === 1 ? 'ден' : 'дни'} от годината.`}
        </p>
      )}
    </div>
  )
}
