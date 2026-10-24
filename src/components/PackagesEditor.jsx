import { Plus, Trash2, Gift, Percent, Tag, Hourglass, Zap, CalendarRange } from 'lucide-react'
import { Field, Input, Select, Button, IconButton, Alert, Checkbox, Badge } from './ui'
import { useAppLang } from '../i18n/appLang'
import { formatDate } from '../lib/localeDates'
import { formatMoney } from '../lib/money'
import { formatDateBG } from '../lib/dates'
import { PACKAGE_KINDS, PACKAGE_PRESETS, emptyPackage, validatePackage, describePackage, examplePackage, nightsWord } from '../lib/packageLogic'

const KIND_ICONS = { free_nights: Gift, percent_off: Percent, fixed_price: Tag, early_bird: Hourglass, last_minute: Zap }
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * Редактор на пакети и оферти за престой: „6+1“, отстъпка за по-дълъг престой, фиксирана цена, ранно записване,
 * последна минута. Контролиран (packages/onChange), без запис — PackagesCard го обвива със запис.
 * price — типична цена на нощувка за примера „плащате X вместо Y“.
 */
export default function PackagesEditor({ packages, onChange, price = 0, showErrors = false, disabled = false }) {
  const { locale } = useAppLang()
  const update = (key, patch) => onChange(packages.map((p) => (p.key === key ? { ...p, ...patch } : p)))
  const remove = (key) => onChange(packages.filter((p) => p.key !== key))
  const add = (presetKey) => onChange([...packages, emptyPackage(presetKey)])
  const weekdayOptions = Array.from({ length: 7 }, (_, i) => ({ value: String(i + 1), label: cap(formatDate(locale, new Date(Date.UTC(2001, 0, i + 1)), { weekday: 'long', timeZone: 'UTC' })) }))

  return (
    <div className="space-y-4">
      {packages.length === 0 ? (
        <p className="text-sm text-ink-soft">
          Още няма оферти. Добавете например „6+1“ (платете 6 нощувки, останете 7), отстъпка за седмица или за ранно записване — гостът ги вижда
          на страницата, а цената се смята автоматично.
        </p>
      ) : (
        <ul className="space-y-4">
          {packages.map((p, i) => {
            const problem = validatePackage(p)
            const Icon = KIND_ICONS[p.kind] ?? Gift
            const desc = problem ? null : describePackage(p, locale)
            const example = problem ? null : examplePackage(p, Number(price))
            const sid = `package-${p.key}`
            return (
              <li key={p.key} className={`rounded-2xl border bg-card p-4 sm:p-5 ${p.is_active ? 'border-line' : 'border-line opacity-80'}`} aria-labelledby={`${sid}-title`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent" aria-hidden="true">
                      <Icon className="h-[1.125rem] w-[1.125rem]" />
                    </span>
                    <div className="min-w-0">
                      <h3 id={`${sid}-title`} className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                        {p.name.trim() || PACKAGE_KINDS.find((k) => k.key === p.kind)?.label}
                        {!p.is_active && <Badge>Изключена</Badge>}
                      </h3>
                      {desc && (
                        <p className="mt-0.5 text-xs text-ink-muted">
                          {desc.main}
                          {desc.extra.map((e) => (
                            <span key={e}> · {e}</span>
                          ))}
                        </p>
                      )}
                    </div>
                  </div>
                  <IconButton label={`Премахни офертата ${p.name.trim() || i + 1}`} tone="danger" onClick={() => remove(p.key)} disabled={disabled}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </IconButton>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field label="Вид оферта">
                    <Select value={p.kind} onChange={(e) => update(p.key, { kind: e.target.value })} disabled={disabled}>
                      {PACKAGE_KINDS.map((k) => (
                        <option key={k.key} value={k.key}>
                          {k.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Име (по избор)" hint="Показва се на госта. Ако е празно — описанието на офертата.">
                    <Input value={p.name} maxLength={60} onChange={(e) => update(p.key, { name: e.target.value })} placeholder="напр. 6+1, Седмица" disabled={disabled} />
                  </Field>

                  {p.kind === 'free_nights' && (
                    <>
                      <Field label="Платени нощувки" required>
                        <Input type="number" inputMode="numeric" min={1} step="1" value={p.paid_nights} onChange={(e) => update(p.key, { paid_nights: e.target.value })} disabled={disabled} />
                      </Field>
                      <Field label="Безплатни нощувки" required hint="Безплатни са най-евтините нощувки от престоя.">
                        <Input type="number" inputMode="numeric" min={1} step="1" value={p.free_nights} onChange={(e) => update(p.key, { free_nights: e.target.value })} disabled={disabled} />
                      </Field>
                      <div className="sm:col-span-2">
                        <Checkbox
                          label="Важи за всеки пълен блок (при 14 нощувки по 6+1 — 2 безплатни)"
                          checked={Boolean(p.repeat_block)}
                          onChange={(e) => update(p.key, { repeat_block: e.target.checked })}
                          disabled={disabled}
                        />
                      </div>
                    </>
                  )}

                  {p.kind === 'percent_off' && (
                    <>
                      <Field label="От колко нощувки нагоре" required>
                        <Input type="number" inputMode="numeric" min={1} step="1" value={p.min_nights} onChange={(e) => update(p.key, { min_nights: e.target.value })} disabled={disabled} />
                      </Field>
                      <Field label="Отстъпка (%)" required>
                        <Input type="number" inputMode="decimal" min={1} max={90} step="0.5" value={p.percent} onChange={(e) => update(p.key, { percent: e.target.value })} disabled={disabled} />
                      </Field>
                    </>
                  )}

                  {p.kind === 'fixed_price' && (
                    <>
                      <Field label="Брой нощувки" required hint="Важи само за точно толкова нощувки.">
                        <Input type="number" inputMode="numeric" min={1} step="1" value={p.fixed_nights} onChange={(e) => update(p.key, { fixed_nights: e.target.value })} disabled={disabled} />
                      </Field>
                      <Field label="Обща цена за престоя (€)" required>
                        <Input type="number" inputMode="decimal" min={0} step="0.01" value={p.fixed_total} onChange={(e) => update(p.key, { fixed_total: e.target.value })} placeholder="250" disabled={disabled} />
                      </Field>
                      <Field label="Настаняване в ден" hint="По избор — например само от петък.">
                        <Select value={p.checkin_weekday} onChange={(e) => update(p.key, { checkin_weekday: e.target.value })} disabled={disabled}>
                          <option value="">Всеки ден</option>
                          {weekdayOptions.map((w) => (
                            <option key={w.value} value={w.value}>
                              {w.label}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </>
                  )}

                  {(p.kind === 'early_bird' || p.kind === 'last_minute') && (
                    <>
                      <Field
                        label={p.kind === 'early_bird' ? 'Резервация поне колко дни по-рано' : 'Настаняване до колко дни от днес'}
                        required
                        hint={p.kind === 'last_minute' ? '0 = само за днес.' : undefined}
                      >
                        <Input type="number" inputMode="numeric" min={p.kind === 'early_bird' ? 1 : 0} step="1" value={p.days_before} onChange={(e) => update(p.key, { days_before: e.target.value })} disabled={disabled} />
                      </Field>
                      <Field label="Отстъпка (%)" required>
                        <Input type="number" inputMode="decimal" min={1} max={90} step="0.5" value={p.percent} onChange={(e) => update(p.key, { percent: e.target.value })} disabled={disabled} />
                      </Field>
                    </>
                  )}

                  <Field label="Важи за настаняване от" hint="По избор — празно значи без начало.">
                    <Input type="date" value={p.valid_from} onChange={(e) => update(p.key, { valid_from: e.target.value })} disabled={disabled} />
                  </Field>
                  <Field label="Важи за настаняване до" hint="По избор — празно значи без край.">
                    <Input type="date" value={p.valid_to} min={p.valid_from || undefined} onChange={(e) => update(p.key, { valid_to: e.target.value })} disabled={disabled} />
                  </Field>
                  <div className="sm:col-span-2">
                    <Checkbox label="Офертата е включена" checked={Boolean(p.is_active)} onChange={(e) => update(p.key, { is_active: e.target.checked })} disabled={disabled} />
                  </div>
                </div>

                {(p.valid_from || p.valid_to) && !problem && (
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-muted">
                    <CalendarRange className="h-3.5 w-3.5" aria-hidden="true" />
                    {p.valid_from && p.valid_to
                      ? `Важи за настаняване от ${formatDateBG(p.valid_from)} до ${formatDateBG(p.valid_to)}`
                      : p.valid_from
                        ? `Важи за настаняване от ${formatDateBG(p.valid_from)}`
                        : `Важи за настаняване до ${formatDateBG(p.valid_to)}`}
                  </p>
                )}
                {example && (
                  <p className="mt-3 rounded-xl bg-sunken px-3.5 py-2.5 text-[0.8125rem] text-ink-soft">
                    {`Пример: ${example.nights} ${nightsWord(example.nights)} по ${formatMoney(price)} — плащате ${formatMoney(example.pay)} вместо ${formatMoney(example.full)}.`}
                  </p>
                )}
                {showErrors && problem && (
                  <Alert kind="error" className="mt-4">
                    {problem}
                  </Alert>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        {PACKAGE_PRESETS.map((p) => {
          const Icon = KIND_ICONS[p.kind] ?? Plus
          return (
            <Button key={p.key} type="button" variant="secondary" size="sm" onClick={() => add(p.key)} disabled={disabled}>
              <Icon className="h-4 w-4" aria-hidden="true" />
              {p.label}
            </Button>
          )
        })}
        <Button type="button" variant="secondary" size="sm" onClick={() => add()} disabled={disabled}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Друга оферта
        </Button>
      </div>

      {packages.length > 1 && (
        <p className="text-xs text-ink-muted">Ако за един престой са подходящи няколко оферти, важи само най-изгодната за госта — отстъпките не се събират.</p>
      )}
    </div>
  )
}
