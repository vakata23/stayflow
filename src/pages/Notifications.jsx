import { useEffect, useState, useCallback } from 'react'
import { Bell, Mail, Send, Trash2, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { PageHeader, Card, Field, Input, Select, Button, Alert, Spinner, EmptyState } from '../components/ui'

const CHANNEL_LABELS = { email: 'Имейл', telegram: 'Telegram' }
const CHANNEL_ICONS = { email: Mail, telegram: Send }

const STATUS_ICONS = {
  sent: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />,
  failed: <XCircle className="h-3.5 w-3.5 text-red-500" />,
  queued: <Clock className="h-3.5 w-3.5 text-amber-500" />,
}

const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME

export default function Notifications() {
  const { profile, session } = useAuth()
  const [targets, setTargets] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  const [channel, setChannel] = useState('telegram')
  const [address, setAddress] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const [testingId, setTestingId] = useState(null)
  const [testResult, setTestResult] = useState(null)

  const load = useCallback(async () => {
    if (!profile?.id) return
    setLoading(true)
    const [{ data: t }, { data: h }] = await Promise.all([
      supabase.from('notification_targets').select('*').eq('profile_id', profile.id).order('created_at'),
      supabase
        .from('outbox')
        .select('*')
        .eq('profile_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(10),
    ])
    setTargets(t ?? [])
    setHistory(h ?? [])
    setLoading(false)
  }, [profile?.id])

  useEffect(() => {
    load()
  }, [load])

  const handleAdd = async (e) => {
    e.preventDefault()
    setError(null)

    const trimmed = address.trim()
    if (!trimmed) return setError('Въведете адрес/Chat ID.')
    if (channel === 'telegram' && !/^-?\d+$/.test(trimmed)) {
      return setError('Telegram Chat ID трябва да е число (вижте инструкциите по-долу).')
    }
    if (channel === 'email' && !/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(trimmed)) {
      return setError('Невалиден имейл адрес.')
    }

    setSaving(true)
    const { error } = await supabase
      .from('notification_targets')
      .insert({ profile_id: profile.id, channel, address: trimmed })
    setSaving(false)

    if (error) {
      if (error.code === '23505') return setError('Вече имате добавен такъв адресат.')
      return setError('Неуспешно записване: ' + error.message)
    }
    setAddress('')
    load()
  }

  const handleToggle = async (target) => {
    await supabase
      .from('notification_targets')
      .update({ is_enabled: !target.is_enabled })
      .eq('id', target.id)
    load()
  }

  const handleDelete = async (target) => {
    await supabase.from('notification_targets').delete().eq('id', target.id)
    load()
  }

  const handleTest = async (target) => {
    setTestingId(target.id)
    setTestResult(null)
    try {
      const { error } = await supabase.rpc('send_test_notification', { p_target_id: target.id })
      if (error) throw error
      await fetch('/api/process-outbox', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      await new Promise((r) => setTimeout(r, 1500))
      const { data: last } = await supabase
        .from('outbox')
        .select('*')
        .eq('target_id', target.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      setTestResult({
        targetId: target.id,
        ok: last?.status === 'sent',
        message:
          last?.status === 'sent'
            ? 'Изпратено успешно.'
            : last?.status === 'failed'
              ? last.last_error || 'Неуспешно доставяне.'
              : 'Все още в опашката — изчакайте малко и презаредете.',
      })
      load()
    } catch (err) {
      setTestResult({ targetId: target.id, ok: false, message: err.message })
    } finally {
      setTestingId(null)
    }
  }

  if (loading) return <Spinner />

  return (
    <div>
      <PageHeader
        icon={Bell}
        title="Известия"
        description="Получавайте известие в Telegram или по имейл при нова заявка за резервация."
      />

      <div className="mt-8 space-y-6">
        <Card className="p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Адресати</h2>

          {targets.length === 0 ? (
            <EmptyState
              icon={Bell}
              title="Няма добавени адресати"
              description="Добавете Telegram или имейл по-долу, за да получавате известия."
            />
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {targets.map((t) => {
                const Icon = CHANNEL_ICONS[t.channel]
                const result = testResult?.targetId === t.id ? testResult : null
                return (
                  <li key={t.id} className="py-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 text-sm">
                        <Icon className="h-4 w-4 text-slate-400" />
                        <span className="font-medium text-slate-800">{CHANNEL_LABELS[t.channel]}</span>
                        <span className="text-slate-500">{t.address}</span>
                        {!t.is_enabled && (
                          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-400">
                            изключено
                          </span>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          className="!py-1.5 !text-xs"
                          loading={testingId === t.id}
                          onClick={() => handleTest(t)}
                        >
                          Изпрати тестово
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          className="!py-1.5 !text-xs"
                          onClick={() => handleToggle(t)}
                        >
                          {t.is_enabled ? 'Изключи' : 'Включи'}
                        </Button>
                        <button
                          type="button"
                          onClick={() => handleDelete(t)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          aria-label="Изтрий"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    {result && (
                      <p className={`mt-2 text-xs ${result.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                        {result.message}
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          <form onSubmit={handleAdd} className="mt-5 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-5">
            {error && (
              <div className="w-full">
                <Alert>{error}</Alert>
              </div>
            )}
            <Field label="Канал">
              <Select value={channel} onChange={(e) => setChannel(e.target.value)} className="w-36">
                <option value="telegram">Telegram</option>
                <option value="email">Имейл</option>
              </Select>
            </Field>
            <Field
              label={channel === 'telegram' ? 'Chat ID' : 'Имейл'}
              hint={channel === 'telegram' ? 'Числов Chat ID, вижте инструкциите по-долу' : undefined}
            >
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={channel === 'telegram' ? '123456789' : 'vie@primer.bg'}
                className="w-56"
              />
            </Field>
            <Button type="submit" loading={saving}>
              Добави
            </Button>
          </form>

          {channel === 'telegram' && (
            <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-500">
              <p className="font-medium text-slate-600">Как да намерите Chat ID-то си:</p>
              <p className="mt-1">
                1. Отворете {botUsername ? (
                  <a
                    href={`https://t.me/${botUsername}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-600 hover:underline"
                  >
                    @{botUsername}
                  </a>
                ) : (
                  'бота на StayFlow в Telegram'
                )}{' '}
                и натиснете Start (или пратете му каквото и да е съобщение).
              </p>
              <p>2. Ботът веднага ще ви отговори с вашето Chat ID.</p>
              <p>3. Копирайте числото тук и натиснете „Добави".</p>
            </div>
          )}
        </Card>

        {history.length > 0 && (
          <Card className="p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
              Последни известия
            </h2>
            <ul className="mt-3 divide-y divide-slate-100 text-sm">
              {history.map((h) => (
                <li key={h.id} className="flex flex-col gap-1 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-slate-600">
                      {STATUS_ICONS[h.status]}
                      <span>{h.event === 'new_booking_request' ? 'Нова заявка' : h.event === 'test' ? 'Тест' : h.event}</span>
                      <span className="text-slate-400">· {CHANNEL_LABELS[h.channel] ?? h.channel}</span>
                    </div>
                    {h.attempts > 0 && (
                      <span className="shrink-0 text-xs text-slate-400">опит {h.attempts}/5</span>
                    )}
                  </div>
                  {h.last_error && (
                    <p className="truncate text-xs text-red-500" title={h.last_error}>
                      {h.last_error}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  )
}
