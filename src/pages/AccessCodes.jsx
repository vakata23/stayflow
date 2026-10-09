import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { KeyRound, Wifi, Copy, Check, Building2, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { PageHeader, Card, EmptyState, Button, Alert, LoadingCard } from '../components/ui'

function CopyValue({ value, mono }) {
  const [copied, setCopied] = useState(false)

  if (!value) return <span className="text-sm text-ink-muted">—</span>

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* клипбордът може да е блокиран — стойността е видима и за ръчно копиране */
    }
  }

  return (
    <button
      onClick={copy}
      className="group inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-sm text-ink hover:bg-sunken"
      title="Копирай"
    >
      <span className={mono ? 'font-mono' : ''}>{value}</span>
      {copied ? (
        <Check className="h-3.5 w-3.5 text-success" />
      ) : (
        <Copy className="h-3.5 w-3.5 text-ink-muted group-hover:text-ink-soft" />
      )}
    </button>
  )
}

export default function AccessCodes() {
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    supabase
      .from('properties')
      .select('id, name, city, wifi_name, wifi_password, access_code')
      .order('name')
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setError('Неуспешно зареждане: ' + error.message)
        setProperties(data ?? [])
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div>
      <PageHeader
        icon={KeyRound}
        eyebrow="За гостите"
        title="Кодове за достъп"
        description="WiFi данни и кодове за самонастаняване по имоти."
      />

      <div className="mt-8">
        {error && <Alert>{error}</Alert>}

        {loading ? (
          <LoadingCard />
        ) : properties.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="Няма добавени имоти"
            description="Кодовете за достъп се въвеждат при създаване или редакция на имот."
            action={
              <Link to="/properties/new">
                <Button>
                  <Plus className="h-4 w-4" />
                  Добави имот
                </Button>
              </Link>
            }
          />
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Кодове за достъп (таблица)">
              <table className="min-w-[36rem] w-full text-left">
                <thead>
                  <tr className="border-b border-line bg-sunken/60">
                    <th className="px-6 py-3 text-[0.8125rem] font-semibold text-ink-soft">
                      Имот
                    </th>
                    <th className="px-6 py-3 text-[0.8125rem] font-semibold text-ink-soft">
                      WiFi мрежа
                    </th>
                    <th className="px-6 py-3 text-[0.8125rem] font-semibold text-ink-soft">
                      WiFi парола
                    </th>
                    <th className="px-6 py-3 text-[0.8125rem] font-semibold text-ink-soft">
                      Код за достъп
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {properties.map((p) => (
                    <tr key={p.id} className="hover:bg-sunken/60">
                      <td className="px-6 py-4">
                        <Link
                          to={`/properties/${p.id}`}
                          className="text-sm font-medium text-ink hover:text-accent-ink"
                        >
                          {p.name}
                        </Link>
                        {p.city && <p className="text-xs text-ink-muted">{p.city}</p>}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5">
                          {p.wifi_name && <Wifi className="h-3.5 w-3.5 text-ink-muted" />}
                          <CopyValue value={p.wifi_name} />
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <CopyValue value={p.wifi_password} mono />
                      </td>
                      <td className="px-6 py-4">
                        <CopyValue value={p.access_code} mono />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
