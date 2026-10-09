import { useEffect, useMemo, useState } from 'react'
import { X, ArrowLeft, Info } from 'lucide-react'
import { todayISO } from '../../lib/dates'
import { formatMoney } from '../../lib/money'
import {
  EXPENSE_OPTIONS,
  INCOME_OPTIONS,
  FREQUENCIES,
  EXPENSE_FREQUENCIES,
  INCOME_FREQUENCIES,
  CLEANING_FEE_NOTE,
  SKIP_REASONS,
  buildRulesFromAnswers,
  ruleShort,
  createRules,
  generateMyAutoEntries,
} from '../../lib/recurringRules'
import { Field, Input, Select, Button, Alert } from '../../components/ui'

const FREQ_HELP = {
  monthly: 'Записва се в избрания ден всеки месец.',
  per_stay: 'Записва се в деня на напускане на всяка потвърдена резервация.',
  per_night: 'Сума × брой нощувки, в деня на напускане на всяка потвърдена резервация.',
}

const emptyAnswer = (option, kind) => ({
  kind,
  key: option.key,
  name: '',
  amount: '',
  frequency: option.frequency,
  day_of_month: 1,
  property_id: '',
  starts_on: todayISO(),
})

/**
 * Съветник „Настрой разходите и приходите“ — един екран на въпрос.
 * Нищо не се измисля: празна сума = правило не се създава.
 */
export default function SetupWizard({ open, onClose, onSaved, properties, profileId, existingRules }) {
  const [step, setStep] = useState(0)
  const [pickedExpenses, setPickedExpenses] = useState([])
  const [pickedIncome, setPickedIncome] = useState([])
  const [answers, setAnswers] = useState({}) // `${kind}:${key}` → отговор
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) return
    setStep(0)
    setPickedExpenses([])
    setPickedIncome([])
    setAnswers({})
    setError(null)
  }, [open])

  // Екрани: избор разходи → по един за всеки избран → избор приходи → по един → преглед
  const screens = useMemo(
    () => [
      { type: 'pick', kind: 'expense' },
      ...pickedExpenses.map((key) => ({ type: 'item', kind: 'expense', key })),
      { type: 'pick', kind: 'income' },
      ...pickedIncome.map((key) => ({ type: 'item', kind: 'income', key })),
      { type: 'review' },
    ],
    [pickedExpenses, pickedIncome]
  )
  const screen = screens[Math.min(step, screens.length - 1)]

  const toggle = (kind, key) => {
    const setter = kind === 'expense' ? setPickedExpenses : setPickedIncome
    const options = kind === 'expense' ? EXPENSE_OPTIONS : INCOME_OPTIONS
    setter((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
      // Редът на екраните следва реда в списъка, не реда на отмятане.
      return options.map((o) => o.key).filter((k) => next.includes(k))
    })
  }

  const answerFor = (kind, key) => {
    const option = (kind === 'income' ? INCOME_OPTIONS : EXPENSE_OPTIONS).find((o) => o.key === key)
    return answers[`${kind}:${key}`] ?? emptyAnswer(option, kind)
  }
  const setAnswer = (kind, key, patch) =>
    setAnswers((prev) => ({ ...prev, [`${kind}:${key}`]: { ...answerFor(kind, key), ...patch } }))

  const built = useMemo(() => {
    const list = [
      ...pickedExpenses.map((key) => answerFor('expense', key)),
      ...pickedIncome.map((key) => answerFor('income', key)),
    ]
    return buildRulesFromAnswers(list, { profileId, today: todayISO(), existingRules })
  }, [answers, pickedExpenses, pickedIncome, profileId, existingRules])

  const propertyName = (id) => properties.find((p) => p.id === id)?.name ?? 'Всички имоти'

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await createRules(built.rules)
      // Веднага догонва вече минали резервации/месеци от „Започва от“ нататък.
      await generateMyAutoEntries().catch(() => 0)
      onSaved(built.rules.length)
    } catch (err) {
      setError('Неуспешно записване: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  const isLast = screen.type === 'review'
  const progress = Math.round(((step + 1) / screens.length) * 100)

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-card" role="dialog" aria-modal="true" aria-label="Настройка на разходите и приходите">
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <button
          type="button"
          onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))}
          className="rounded-lg p-2 text-ink-soft hover:bg-sunken"
          aria-label={step === 0 ? 'Затвори' : 'Назад'}
        >
          {step === 0 ? <X className="h-5 w-5" /> : <ArrowLeft className="h-5 w-5" />}
        </button>
        <div className="flex-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-sunken">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-ink-muted">
            Въпрос {step + 1} от {screens.length}
          </p>
        </div>
        {step > 0 && (
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-ink-muted hover:bg-sunken" aria-label="Затвори">
            <X className="h-5 w-5" />
          </button>
        )}
      </header>

      <main className="flex-1 overflow-y-auto px-5 py-6">
        <div className="mx-auto max-w-md space-y-5">
          {error && <Alert>{error}</Alert>}

          {screen.type === 'pick' && (
            <PickScreen
              kind={screen.kind}
              picked={screen.kind === 'expense' ? pickedExpenses : pickedIncome}
              onToggle={(key) => toggle(screen.kind, key)}
            />
          )}

          {screen.type === 'item' && (
            <ItemScreen
              kind={screen.kind}
              option={(screen.kind === 'income' ? INCOME_OPTIONS : EXPENSE_OPTIONS).find((o) => o.key === screen.key)}
              answer={answerFor(screen.kind, screen.key)}
              onChange={(patch) => setAnswer(screen.kind, screen.key, patch)}
              properties={properties}
            />
          )}

          {screen.type === 'review' && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-ink">Преглед</h2>
              {built.rules.length === 0 ? (
                <p className="text-sm text-ink-soft">
                  Не сте въвели нито една сума — няма да се създаде правило. Нищо не се измисля.
                </p>
              ) : (
                <>
                  <p className="text-sm text-ink-soft">
                    Ще се създадат {built.rules.length} {built.rules.length === 1 ? 'правило' : 'правила'}. Записите,
                    които се генерират от тях, са <strong>оценка по вашите правила</strong> — можете да ги редактирате
                    или изтриете по всяко време.
                  </p>
                  <ul className="divide-y divide-line rounded-xl border border-line">
                    {built.rules.map((r, i) => (
                      <li key={i} className="px-4 py-3 text-sm">
                        <p className="font-medium text-ink">
                          <span className={r.kind === 'income' ? 'text-success' : 'text-danger'}>
                            {r.kind === 'income' ? '+' : '−'}
                          </span>{' '}
                          {ruleShort(r)}
                        </p>
                        <p className="text-xs text-ink-muted">
                          {propertyName(r.property_id)} · от {r.starts_on}
                        </p>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {built.skipped.filter((s) => s.reason !== 'empty').length > 0 && (
                <Alert kind="warning">
                  Пропуснати:{' '}
                  {built.skipped
                    .filter((s) => s.reason !== 'empty')
                    .map((s) => `${s.label} (${SKIP_REASONS[s.reason]})`)
                    .join(', ')}
                </Alert>
              )}
              {built.skipped.some((s) => s.reason === 'empty') && (
                <p className="text-xs text-ink-muted">
                  Без сума, затова без правило:{' '}
                  {built.skipped.filter((s) => s.reason === 'empty').map((s) => s.label).join(', ')}.
                </p>
              )}
            </div>
          )}
        </div>
      </main>

      <footer className="border-t border-line bg-card px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-md gap-3">
          {isLast ? (
            built.rules.length === 0 ? (
              <Button className="flex-1" onClick={onClose}>
                Затвори
              </Button>
            ) : (
              <Button className="flex-1" onClick={handleSave} loading={saving}>
                Запази {built.rules.length} {built.rules.length === 1 ? 'правило' : 'правила'}
              </Button>
            )
          ) : (
            <Button className="flex-1" onClick={() => setStep((s) => s + 1)}>
              {screen.type === 'pick' && (screen.kind === 'expense' ? pickedExpenses : pickedIncome).length === 0
                ? 'Нямам такива — напред'
                : 'Напред'}
            </Button>
          )}
        </div>
      </footer>
    </div>
  )
}

function PickScreen({ kind, picked, onToggle }) {
  const options = kind === 'expense' ? EXPENSE_OPTIONS : INCOME_OPTIONS
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-ink">
        {kind === 'expense' ? 'Какви разходи плащаш?' : 'За какво получаваш допълнително?'}
      </h2>
      <p className="text-sm text-ink-soft">
        {kind === 'expense'
          ? 'Отметнете всичко, което плащате редовно. За всяко ще попитаме колко и колко често.'
          : 'Само допълнителни услуги. Таксата за почистване, която плаща гостът, вече е в цената на резервацията — не я добавяйте тук.'}
      </p>
      <div className="space-y-2">
        {options.map((o) => (
          <label
            key={o.key}
            className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3.5 text-sm transition-colors ${
              picked.includes(o.key) ? 'border-accent bg-accent-soft' : 'border-line bg-card'
            }`}
          >
            <input
              type="checkbox"
              checked={picked.includes(o.key)}
              onChange={() => onToggle(o.key)}
              className="h-5 w-5 rounded border-line-strong text-accent focus:ring-accent"
            />
            <span className="font-medium text-ink">{o.label}</span>
            {o.hint && <span className="text-xs text-ink-muted">({o.hint})</span>}
          </label>
        ))}
      </div>
    </div>
  )
}

function ItemScreen({ kind, option, answer, onChange, properties }) {
  const frequencies = kind === 'income' ? INCOME_FREQUENCIES : EXPENSE_FREQUENCIES
  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-ink">
        {kind === 'income' ? `Колко взимаш за „${option.label}“?` : `Колко плащаш за „${option.label}“?`}
      </h2>

      {option.key === 'cleaning' && kind === 'expense' && (
        <div className="flex gap-2 rounded-xl bg-warning-soft px-3.5 py-3 text-xs leading-relaxed text-warning-ink">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{CLEANING_FEE_NOTE}</p>
        </div>
      )}

      {option.askName && (
        <Field label="Как се казва?">
          <Input value={answer.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="напр. Градинар" maxLength={60} />
        </Field>
      )}

      <Field label="Сума (€)" hint="Оставете празно, ако не искате правило за това.">
        <Input
          type="text"
          inputMode="decimal"
          value={answer.amount}
          onChange={(e) => onChange({ amount: e.target.value })}
          placeholder="напр. 25"
          className="text-lg"
        />
      </Field>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink">Колко често?</legend>
        <div className="space-y-2">
          {frequencies.map((f) => (
            <label
              key={f}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 ${
                answer.frequency === f ? 'border-accent bg-accent-soft' : 'border-line'
              }`}
            >
              <input
                type="radio"
                name={`freq-${kind}-${option.key}`}
                checked={answer.frequency === f}
                onChange={() => onChange({ frequency: f })}
                className="mt-0.5 h-5 w-5 border-line-strong text-accent focus:ring-accent"
              />
              <span>
                <span className="block text-sm font-medium text-ink">{FREQUENCIES[f]}</span>
                <span className="block text-xs text-ink-muted">{FREQ_HELP[f]}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {answer.frequency === 'monthly' && (
        <Field label="В кой ден от месеца?" hint="В по-кратките месеци се записва в последния им ден.">
          <Select value={answer.day_of_month} onChange={(e) => onChange({ day_of_month: Number(e.target.value) })}>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {d}-о число
              </option>
            ))}
          </Select>
        </Field>
      )}

      <Field label="За кой имот?">
        <Select value={answer.property_id} onChange={(e) => onChange({ property_id: e.target.value })}>
          <option value="">Всички имоти</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Започва от" hint="Не се създават записи за по-ранни дати.">
        <Input type="date" value={answer.starts_on} onChange={(e) => onChange({ starts_on: e.target.value })} min="2020-01-01" />
      </Field>

      {answer.amount !== '' && Number(String(answer.amount).replace(',', '.')) > 0 && (
        <p className="rounded-xl bg-sunken px-3.5 py-2.5 text-xs text-ink-soft">
          {kind === 'income' ? '+' : '−'}
          {formatMoney(Number(String(answer.amount).replace(',', '.')))} {FREQUENCIES[answer.frequency]}
          {answer.frequency === 'monthly' ? `, ${answer.day_of_month}-о число` : ''}
        </p>
      )}
    </div>
  )
}
