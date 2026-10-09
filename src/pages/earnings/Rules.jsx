import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Repeat, Pause, Play, Pencil, Trash2, Wand2, Info } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { formatDateBG } from '../../lib/dates'
import {
  FREQUENCIES,
  EXPENSE_FREQUENCIES,
  INCOME_FREQUENCIES,
  CLEANING_FEE_NOTE,
  ruleShort,
  fetchRules,
  updateRule,
  deleteRule,
  countAutoEntries,
  generateMyAutoEntries,
} from '../../lib/recurringRules'
import { PageHeader, Card, Button, Alert, Spinner, EmptyState, Modal, Field, Input, Select } from '../../components/ui'
import SetupWizard from './SetupWizard'

export default function Rules() {
  const { profile } = useAuth()
  const [rules, setRules] = useState([])
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null) // { rule, entryCount }
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [r, props] = await Promise.all([fetchRules(), supabase.from('properties').select('id, name').order('name')])
      setRules(r)
      setProperties(props.data ?? [])
      setError(null)
    } catch (err) {
      setError('Неуспешно зареждане: ' + err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const names = Object.fromEntries(properties.map((p) => [p.id, p.name]))

  const togglePause = async (rule) => {
    setError(null)
    try {
      await updateRule(rule.id, { active: !rule.active })
      if (!rule.active) await generateMyAutoEntries().catch(() => 0) // включване → догонва пропуснатото
      await load()
    } catch (err) {
      setError('Неуспешно записване: ' + err.message)
    }
  }

  const askDelete = async (rule) => {
    setError(null)
    try {
      setDeleting({ rule, entryCount: await countAutoEntries(rule.id) })
    } catch (err) {
      setError('Неуспешно зареждане: ' + err.message)
    }
  }

  const confirmDelete = async (removeEntries) => {
    setBusy(true)
    try {
      await deleteRule(deleting.rule.id, removeEntries)
      setDeleting(null)
      await load()
    } catch (err) {
      setError('Неуспешно изтриване: ' + err.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Spinner />

  return (
    <div>
      <Link to="/earnings" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-ink">
        <ArrowLeft className="h-4 w-4" />
        Приходи
      </Link>

      <PageHeader
        icon={Repeat}
        title="Правила за разходи и приходи"
        description="От тях се създават автоматичните записи в „Приходи“ — оценка по вашите правила, не реални плащания."
        action={
          <Button onClick={() => setWizardOpen(true)}>
            <Wand2 className="h-4 w-4" />
            Настройка
          </Button>
        }
      />

      <div className="mt-6 space-y-4">
        {error && <Alert>{error}</Alert>}

        <div className="flex gap-2 rounded-xl bg-warning-soft px-4 py-3 text-xs leading-relaxed text-warning-ink">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{CLEANING_FEE_NOTE}</p>
        </div>

        {rules.length === 0 ? (
          <EmptyState
            icon={Repeat}
            title="Още няма правила"
            description="Отговорете на няколко въпроса и разходите като ток, интернет и почистване ще се записват сами."
            action={
              <Button onClick={() => setWizardOpen(true)}>
                <Wand2 className="h-4 w-4" />
                Настройка
              </Button>
            }
          />
        ) : (
          <Card className="overflow-hidden">
            <ul className="divide-y divide-line">
              {rules.map((rule) => (
                <li key={rule.id} className={`flex flex-wrap items-center justify-between gap-3 px-5 py-4 ${rule.active ? '' : 'bg-sunken/70'}`}>
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold ${rule.active ? 'text-ink' : 'text-ink-muted'}`}>
                      <span className={rule.kind === 'income' ? 'text-success' : 'text-danger'}>{rule.kind === 'income' ? '+' : '−'}</span>{' '}
                      {ruleShort(rule)}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {names[rule.property_id] ?? 'Всички имоти'} · от {formatDateBG(rule.starts_on)}
                      {rule.ends_on ? ` до ${formatDateBG(rule.ends_on)}` : ''}
                      {!rule.active && ' · на пауза'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" onClick={() => togglePause(rule)} className="rounded-lg p-2 text-ink-muted hover:bg-sunken hover:text-ink" aria-label={rule.active ? 'Пауза' : 'Включи'} title={rule.active ? 'Пауза' : 'Включи'}>
                      {rule.active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </button>
                    <button type="button" onClick={() => setEditing(rule)} className="rounded-lg p-2 text-ink-muted hover:bg-sunken hover:text-ink" aria-label="Редакция">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => askDelete(rule)} className="rounded-lg p-2 text-ink-muted hover:bg-danger-soft hover:text-danger" aria-label="Изтрий">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <SetupWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onSaved={() => {
          setWizardOpen(false)
          load()
        }}
        properties={properties}
        profileId={profile?.id}
        existingRules={rules}
      />

      {editing && (
        <RuleEditModal
          rule={editing}
          properties={properties}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await generateMyAutoEntries().catch(() => 0)
            load()
          }}
        />
      )}

      <Modal open={Boolean(deleting)} onClose={() => !busy && setDeleting(null)} title="Изтриване на правило">
        {deleting && (
          <>
            <p className="text-sm leading-relaxed text-ink-soft">
              Правило: <strong>{ruleShort(deleting.rule)}</strong>.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              {deleting.entryCount > 0
                ? `От него вече има ${deleting.entryCount} автоматични ${deleting.entryCount === 1 ? 'запис' : 'записа'} в „Приходи“. Какво да стане с тях?`
                : 'От него няма създадени автоматични записи.'}
            </p>
            <div className="mt-5 flex flex-col gap-2">
              {deleting.entryCount > 0 && (
                <Button variant="dangerSolid" onClick={() => confirmDelete(true)} loading={busy}>
                  {deleting.entryCount === 1 ? 'Изтрий правилото и записа' : `Изтрий правилото и ${deleting.entryCount} записа`}
                </Button>
              )}
              <Button variant={deleting.entryCount > 0 ? 'secondary' : 'dangerSolid'} onClick={() => confirmDelete(false)} loading={busy}>
                {deleting.entryCount > 0 ? 'Изтрий само правилото, запази записите' : 'Изтрий правилото'}
              </Button>
              <Button variant="secondary" onClick={() => setDeleting(null)} disabled={busy}>
                Отказ
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}

function RuleEditModal({ rule, properties, onClose, onSaved }) {
  const [v, setV] = useState({
    amount: String(rule.amount),
    frequency: rule.frequency,
    day_of_month: rule.day_of_month ?? 1,
    property_id: rule.property_id ?? '',
    starts_on: rule.starts_on,
    ends_on: rule.ends_on ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const frequencies = rule.kind === 'income' ? INCOME_FREQUENCIES : EXPENSE_FREQUENCIES
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }))

  const save = async (e) => {
    e.preventDefault()
    setError(null)
    const amount = Number(String(v.amount).replace(',', '.'))
    if (!(amount > 0)) return setError('Сумата трябва да е по-голяма от 0.')
    if (v.ends_on && v.ends_on < v.starts_on) return setError('„До“ не може да е преди „От“.')
    setSaving(true)
    try {
      await updateRule(rule.id, {
        amount,
        frequency: v.frequency,
        day_of_month: v.frequency === 'monthly' ? Number(v.day_of_month) : null,
        property_id: v.property_id || null,
        starts_on: v.starts_on,
        ends_on: v.ends_on || null,
      })
      await onSaved()
    } catch (err) {
      setError('Неуспешно записване: ' + err.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <div className="fixed inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-line bg-card shadow-xl">
        <header className="border-b border-line px-6 py-4">
          <h2 className="text-lg font-bold">Редакция на правило</h2>
          <p className="text-xs text-ink-muted">{rule.label}</p>
        </header>
        <form onSubmit={save} className="space-y-4 px-6 py-5">
          {error && <Alert>{error}</Alert>}
          <Field label="Сума (€)" required>
            <Input type="text" inputMode="decimal" value={v.amount} onChange={set('amount')} />
          </Field>
          <Field label="Колко често?">
            <Select value={v.frequency} onChange={set('frequency')}>
              {frequencies.map((f) => (
                <option key={f} value={f}>{FREQUENCIES[f]}</option>
              ))}
            </Select>
          </Field>
          {v.frequency === 'monthly' && (
            <Field label="Ден от месеца">
              <Select value={v.day_of_month} onChange={set('day_of_month')}>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>{d}-о число</option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Имот">
            <Select value={v.property_id} onChange={set('property_id')}>
              <option value="">Всички имоти</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="От">
              <Input type="date" value={v.starts_on} onChange={set('starts_on')} min="2020-01-01" />
            </Field>
            <Field label="До (по избор)">
              <Input type="date" value={v.ends_on} onChange={set('ends_on')} />
            </Field>
          </div>
          <p className="rounded-lg bg-sunken px-3 py-2 text-xs text-ink-soft">
            Промяната важи за бъдещи записи. Вече създадените остават — редактирайте ги от „Последни разходи и приходи“.
          </p>
          <div className="flex justify-end gap-3 border-t border-line pt-4">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Отказ</Button>
            <Button type="submit" loading={saving}>Запази</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
