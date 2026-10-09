import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  ClipboardCheck,
  Plus,
  Building2,
  User,
  CalendarClock,
  ChevronRight,
  Check,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatDateBG, todayISO } from '../../lib/dates'
import {
  TASK_STATUSES,
  TASK_STATUS_STYLES,
  NEXT_STATUS,
  taskStatusLabel,
} from '../../lib/cleaning'
import { PageHeader, Card, Select, Button, Alert, EmptyState, LoadingCard } from '../../components/ui'
import TaskFormModal from './TaskFormModal'

function TaskCard({ task, propertyName, onToggle, onEdit }) {
  const today = todayISO()
  const overdue = task.status !== 'done' && task.due_date < today

  return (
    <div className="rounded-xl border border-line bg-card p-3.5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={() => onEdit(task)}
          className="text-left text-sm font-semibold text-ink hover:text-accent-ink"
        >
          {propertyName}
        </button>
        <button
          onClick={() => onToggle(task)}
          className={`icon-btn shrink-0 transition-colors ${
            task.status === 'done'
              ? 'bg-success-soft text-success hover:bg-success-line'
              : 'bg-sunken text-ink-soft hover:bg-line'
          }`}
          title={`Смени статус (сега: ${taskStatusLabel(task.status)})`}
        >
          {task.status === 'done' ? <Check className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      </div>

      <div className="mt-2.5 space-y-1.5 text-xs text-ink-soft">
        <p className={`flex items-center gap-1.5 ${overdue ? 'font-semibold text-danger' : ''}`}>
          <CalendarClock className="h-3.5 w-3.5" />
          {formatDateBG(task.due_date)}
          {overdue && ' · просрочена'}
        </p>
        {task.assigned_to && (
          <p className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5" />
            {task.assigned_to}
          </p>
        )}
      </div>

      {task.notes && <p className="mt-2 line-clamp-2 text-xs text-ink-muted">{task.notes}</p>}
    </div>
  )
}

export default function CleaningTasks() {
  const [properties, setProperties] = useState([])
  const [tasks, setTasks] = useState([])
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
      .from('cleaning_tasks')
      .select('*')
      .order('due_date', { ascending: true })

    if (propertyId !== 'all') query = query.eq('property_id', propertyId)

    const { data, error } = await query
    if (error) setError('Неуспешно зареждане: ' + error.message)
    setTasks(data ?? [])
    setLoading(false)
  }, [propertyId])

  useEffect(() => {
    load()
  }, [load])

  const propertyName = (id) => properties.find((p) => p.id === id)?.name ?? '—'

  // Оптимистична смяна на статус — UI се обновява веднага, при грешка връщаме.
  const toggleStatus = async (task) => {
    const next = NEXT_STATUS[task.status]
    setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, status: next } : t)))

    const { error } = await supabase
      .from('cleaning_tasks')
      .update({ status: next })
      .eq('id', task.id)

    if (error) {
      setError('Неуспешна смяна на статус: ' + error.message)
      setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, status: task.status } : t)))
    }
  }

  const openNew = () => {
    setEditing(null)
    setModalOpen(true)
  }

  const openEdit = (task) => {
    setEditing(task)
    setModalOpen(true)
  }

  const columns = TASK_STATUSES.map((s) => ({
    ...s,
    tasks: tasks.filter((t) => t.status === s.value),
  }))

  return (
    <div>
      <PageHeader
        icon={ClipboardCheck}
        eyebrow="Почистване"
        title="Камериерски задачи"
        description="Планиране и проследяване на почистванията по имоти."
        action={
          <Button onClick={openNew} disabled={properties.length === 0}>
            <Plus className="h-4 w-4" />
            Нова задача
          </Button>
        }
      />

      {properties.length === 0 && !loading ? (
        <div className="mt-8">
          <EmptyState
            icon={Building2}
            title="Първо добавете имот"
            description="Камериерските задачи се закачат за имот. Добавете поне един, за да започнете."
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
              aria-label="Имот"
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
            <LoadingCard />
          ) : tasks.length === 0 ? (
            <EmptyState
              icon={ClipboardCheck}
              title="Няма камериерски задачи"
              description="Създайте първата задача или я свържете с предстоящо напускане."
              action={
                <Button onClick={openNew}>
                  <Plus className="h-4 w-4" />
                  Нова задача
                </Button>
              }
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {columns.map((col) => (
                <div key={col.value} className="rounded-2xl bg-sunken/60 p-3">
                  <div className="mb-3 flex items-center justify-between px-1">
                    <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                      <span
                        className={`inline-flex rounded-md px-2 py-0.5 text-xs ${TASK_STATUS_STYLES[col.value]}`}
                      >
                        {col.label}
                      </span>
                    </span>
                    <span className="text-xs font-medium text-ink-muted">{col.tasks.length}</span>
                  </div>

                  <div className="space-y-2.5">
                    {col.tasks.length === 0 ? (
                      <p className="px-1 py-6 text-center text-xs text-ink-muted">Няма задачи</p>
                    ) : (
                      col.tasks.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          propertyName={propertyName(task.property_id)}
                          onToggle={toggleStatus}
                          onEdit={openEdit}
                        />
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <TaskFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={load}
        properties={properties}
        initial={editing}
      />
    </div>
  )
}
