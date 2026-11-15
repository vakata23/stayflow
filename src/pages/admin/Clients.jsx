import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Mail, MessageCircle, Phone, Search } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Card, Button, Select, Input, Alert, Badge, Segmented, Spinner, EmptyState } from '../../components/ui'
import { PLANS, PLAN_KEYS, BANDS, STATE_LABEL, accessState, extendUntil, todayIso, planForBand } from '../../lib/accessLogic'

/**
 * „Клиенти“ — само за администратора на StayFlow (виж app_admins в миграция 016).
 * Две части: заявките „Заяви достъп“ от публичната страница и всички акаунти с достъп (пакет, до коя дата, статус).
 * Тук се отваря, удължава и спира достъпът. Вътрешен инструмент на български (не се превежда).
 */
const REQUEST_STATUS = [
  { value: 'new', label: 'Нова' },
  { value: 'contacted', label: 'Свързахме се' },
  { value: 'approved', label: 'Одобрена' },
  { value: 'rejected', label: 'Отказана' },
]
const STATE_TONE = { active: 'success', pending: 'warning', suspended: 'danger', expired: 'danger' }
const digits = (v) => String(v ?? '').replace(/\D/g, '')
const fmtDate = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('.') : '—')
const bandLabel = (key) => BANDS.find((b) => b.key === key)?.label ?? null

export default function Clients() {
  const { access, accessLoading } = useAuth()
  const [tab, setTab] = useState('requests')
  const [clients, setClients] = useState(null)
  const [requests, setRequests] = useState(null)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(null)
  const today = todayIso()

  const load = useCallback(async () => {
    const [c, r] = await Promise.all([
      supabase.rpc('admin_clients'),
      supabase.from('access_requests').select('*').order('created_at', { ascending: false }),
    ])
    if (c.error) setError('Клиентите не се заредиха: ' + c.error.message)
    else setClients(c.data ?? [])
    if (r.error) setError((e) => e ?? 'Заявките не се заредиха: ' + r.error.message)
    else setRequests(r.data ?? [])
  }, [])

  useEffect(() => {
    if (access?.isAdmin) load()
  }, [access?.isAdmin, load])

  const newCount = useMemo(() => (requests ?? []).filter((r) => r.status === 'new').length, [requests])
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return clients ?? []
    return (clients ?? []).filter((c) => [c.full_name, c.company_name, c.email, c.phone].some((v) => String(v ?? '').toLowerCase().includes(q)))
  }, [clients, query])

  if (accessLoading) return <Spinner />
  if (!access?.isAdmin) return <Navigate to="/" replace />

  /** Записва достъпа на клиент (пакет, статус, до коя дата) и обновява реда веднага. */
  const saveGrant = async (client, patch, key) => {
    setBusy(client.profile_id + key)
    setError(null)
    const next = { plan: client.plan ?? 'start', status: client.status ?? 'pending', active_until: client.active_until ?? null, ...patch }
    const { error: err } = await supabase.from('access_grants').upsert({ profile_id: client.profile_id, ...next }, { onConflict: 'profile_id' })
    setBusy(null)
    if (err) return setError('Не се записа: ' + err.message)
    setClients((list) => list.map((c) => (c.profile_id === client.profile_id ? { ...c, ...next } : c)))
  }

  const setRequestStatus = async (req, status) => {
    setRequests((list) => list.map((r) => (r.id === req.id ? { ...r, status } : r)))
    const { error: err } = await supabase.from('access_requests').update({ status }).eq('id', req.id)
    if (err) {
      setError('Не се записа: ' + err.message)
      load()
    }
  }

  return (
    <div>
      <PageHeader eyebrow="Само за вас" title="Клиенти" description="Заявките за достъп и всички акаунти: кой има достъп, до кога, и бутоните да го отворите, удължите или спрете." />

      <div className="mt-6">
        <Segmented
          label="Раздел"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'requests', label: `Заявки${newCount ? ` (${newCount} нови)` : ''}` },
            { value: 'clients', label: `Клиенти${clients ? ` (${clients.length})` : ''}` },
          ]}
        />
      </div>

      {error && (
        <div className="mt-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {tab === 'requests' && (
        <section className="mt-6 grid gap-3" aria-label="Заявки за достъп">
          {requests === null ? (
            <Spinner />
          ) : requests.length === 0 ? (
            <EmptyState title="Още няма заявки" description="Когато някой натисне „Заяви достъп“ на началната страница, заявката се появява тук." />
          ) : (
            requests.map((r) => (
              <Card key={r.id} className="p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{r.name}</p>
                    <p className="text-sm text-ink-soft">
                      {fmtDate(r.created_at)}
                      {bandLabel(r.property_band) && ` · ${bandLabel(r.property_band)}`}
                      {r.plan_interest && ` · иска ${PLANS[r.plan_interest]?.name}`}
                      {!r.plan_interest && planForBand(r.property_band) && ` · подхожда му ${PLANS[planForBand(r.property_band)].name}`}
                    </p>
                  </div>
                  <label className="text-sm">
                    <span className="sr-only">Статус на заявката от {r.name}</span>
                    <Select value={r.status} onChange={(e) => setRequestStatus(r, e.target.value)}>
                      {REQUEST_STATUS.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </Select>
                  </label>
                </div>
                {r.note && <p className="mt-3 rounded-xl bg-sunken p-3 text-sm">{r.note}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {r.phone && (
                    <>
                      <a className="btn btn-secondary btn-sm" href={`viber://chat?number=%2B${digits(r.phone).replace(/^0/, '359')}`}>
                        <MessageCircle className="h-4 w-4" aria-hidden="true" /> Viber {r.phone}
                      </a>
                      <a className="btn btn-secondary btn-sm" href={`tel:${r.phone.replace(/[^\d+]/g, '')}`}>
                        <Phone className="h-4 w-4" aria-hidden="true" /> Обади се
                      </a>
                    </>
                  )}
                  {r.email && (
                    <a className="btn btn-secondary btn-sm" href={`mailto:${r.email}`}>
                      <Mail className="h-4 w-4" aria-hidden="true" /> {r.email}
                    </a>
                  )}
                </div>
              </Card>
            ))
          )}
        </section>
      )}

      {tab === 'clients' && (
        <section className="mt-6" aria-label="Клиенти">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
            <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Име, имейл или телефон" aria-label="Търсене на клиент" className="pl-10" />
          </div>
          <div className="mt-4 grid gap-3">
            {clients === null ? (
              <Spinner />
            ) : shown.length === 0 ? (
              <EmptyState title="Няма такъв клиент" description="Опитайте с част от името или имейла." />
            ) : (
              shown.map((c) => {
                const st = accessState({ status: c.status, active_until: c.active_until }, today)
                const base = busy && busy.startsWith(c.profile_id)
                return (
                  <Card key={c.profile_id} className="p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold">{c.company_name || c.full_name || '—'}</p>
                        <p className="break-all text-sm text-ink-soft">
                          {c.company_name && c.full_name ? `${c.full_name} · ` : ''}
                          {c.email}
                          {c.phone ? ` · ${c.phone}` : ''}
                        </p>
                        <p className="text-sm text-ink-soft">
                          Имоти: {c.property_count} · регистриран {fmtDate(c.created_at)}
                        </p>
                      </div>
                      <div className="text-right">
                        <Badge tone={STATE_TONE[st.state]}>{STATE_LABEL[st.state]}</Badge>
                        <p className="mt-1 text-sm text-ink-soft">
                          {c.active_until ? `до ${fmtDate(c.active_until)}${st.state === 'active' && st.daysLeft != null ? ` (${st.daysLeft} дни)` : ''}` : 'без срок'}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <label className="text-sm">
                        <span className="sr-only">Пакет на {c.full_name || c.email}</span>
                        <Select value={c.plan ?? 'start'} onChange={(e) => saveGrant(c, { plan: e.target.value }, 'plan')} disabled={!!base}>
                          {PLAN_KEYS.map((k) => (
                            <option key={k} value={k}>
                              {PLANS[k].name} · {PLANS[k].monthly} €/мес. · до {PLANS[k].properties} имота
                            </option>
                          ))}
                        </Select>
                      </label>
                      {st.state !== 'active' ? (
                        <Button size="sm" loading={busy === c.profile_id + 'on'} disabled={!!base} onClick={() => saveGrant(c, { status: 'active', active_until: extendUntil(c.active_until, today, 1) }, 'on')}>
                          Активирай за 1 месец
                        </Button>
                      ) : (
                        <>
                          <Button size="sm" variant="secondary" loading={busy === c.profile_id + 'm1'} disabled={!!base} onClick={() => saveGrant(c, { status: 'active', active_until: extendUntil(c.active_until, today, 1) }, 'm1')}>
                            + 1 месец
                          </Button>
                          <Button size="sm" variant="secondary" loading={busy === c.profile_id + 'm12'} disabled={!!base} onClick={() => saveGrant(c, { status: 'active', active_until: extendUntil(c.active_until, today, 12) }, 'm12')}>
                            + 12 месеца
                          </Button>
                        </>
                      )}
                      {c.status !== 'suspended' && (
                        <Button size="sm" variant="danger" loading={busy === c.profile_id + 'off'} disabled={!!base} onClick={() => saveGrant(c, { status: 'suspended' }, 'off')}>
                          Спри
                        </Button>
                      )}
                    </div>
                  </Card>
                )
              })
            )}
          </div>
        </section>
      )}
    </div>
  )
}
