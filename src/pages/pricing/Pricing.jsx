import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { BadgePercent, Plus, Building2, Moon, CalendarRange } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatDateBG, fromISODate, todayISO } from '../../lib/dates'
import { formatPrice } from '../../lib/pricing'
import { PageHeader, Card, Select, Button, Alert, Spinner, EmptyState } from '../../components/ui'
import PricingRuleModal from './PricingRuleModal'

export default function Pricing() {
  const [properties, setProperties] = useState([])
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [propertyId, setPropertyId] = useState('all')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  useEffect(() => {
    supabase
      .from('properties')
      .select('id, name')
      .order('name')
      .then(({ data }) => setProperties(data ?? []))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    let query = supabase
      .from('pricing_rules')
      .select('*')
      .order('start_date', { ascending: true })

    if (propertyId !== 'all') query = query.eq('property_id', propertyId)

    const { data, error } = await query
    if (error) setError('Неуспешно зареждане: ' + error.message)
    setRules(data ?? [])
    setLoading(false)
  }, [propertyId])

  useEffect(() => {
    load()
  }, [load])

  const propertyName = (id) => properties.find((p) => p.id === id)?.name ?? '—'
  const today = todayISO()

  const openNew = () => {
    setEditing(null)
    setModalOpen(true)
  }

  const openEdit = (rule) => {
    setEditing(rule)
    setModalOpen(true)
  }

  const isActive = (rule) => rule.start_date <= today && today <= rule.end_date
  const isPast = (rule) => rule.end_date < today

  return (
    <div>
      <PageHeader
        icon={BadgePercent}
        title="Ценови планове"
        description="Цени на нощувка по периоди и минимален престой."
        action={
          <Button onClick={openNew} disabled={properties.length === 0}>
            <Plus className="h-4 w-4" />
            Ново правило
          </Button>
        }
      />

      {properties.length === 0 && !loading ? (
        <div className="mt-8">
          <EmptyState
            icon={Building2}
            title="Първо добавете имот"
            description="Ценовите правила се задават per имот. Добавете поне един, за да започнете."
            action={
              <Link to="/properties/new">
                <Button>
                  <Plus className="h-4 w-4" />
                  Добави имот
                </Button>
              </Link>
            }
          />
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          {error && <Alert>{error}</Alert>}

          <div className="flex justify-end">
            <Select
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="w-auto min-w-52"
            >
              <option value="all">Всички имоти</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>

          {loading ? (
            <Card>
              <Spinner />
            </Card>
          ) : rules.length === 0 ? (
            <EmptyState
              icon={BadgePercent}
              title="Няма ценови правила"
              description="Задайте цена за определен период — например по-висока цена за летния сезон."
              action={
                <Button onClick={openNew}>
                  <Plus className="h-4 w-4" />
                  Ново правило
                </Button>
              }
            />
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/60 text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-5 py-3 font-semibold">Имот</th>
                      <th className="px-5 py-3 font-semibold">Период</th>
                      <th className="px-5 py-3 font-semibold">Цена/нощувка</th>
                      <th className="px-5 py-3 font-semibold">Мин. престой</th>
                      <th className="px-5 py-3 font-semibold">Статус</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rules.map((rule) => (
                      <tr
                        key={rule.id}
                        onClick={() => openEdit(rule)}
                        className={`cursor-pointer hover:bg-slate-50/60 ${isPast(rule) ? 'opacity-50' : ''}`}
                      >
                        <td className="px-5 py-3.5 font-medium text-slate-900">
                          {propertyName(rule.property_id)}
                        </td>
                        <td className="px-5 py-3.5 text-slate-600">
                          <span className="flex items-center gap-1.5">
                            <CalendarRange className="h-3.5 w-3.5 text-slate-400" />
                            {formatDateBG(rule.start_date)} – {formatDateBG(rule.end_date)}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 font-semibold text-slate-900">
                          {formatPrice(rule.price_per_night)}
                        </td>
                        <td className="px-5 py-3.5 text-slate-600">
                          <span className="flex items-center gap-1.5">
                            <Moon className="h-3.5 w-3.5 text-slate-400" />
                            {rule.min_nights}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          {isActive(rule) ? (
                            <span className="inline-flex rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                              Активно
                            </span>
                          ) : isPast(rule) ? (
                            <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                              Изтекло
                            </span>
                          ) : (
                            <span className="inline-flex rounded-md bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                              Предстоящо
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      <PricingRuleModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={load}
        properties={properties}
        initial={editing}
      />
    </div>
  )
}
