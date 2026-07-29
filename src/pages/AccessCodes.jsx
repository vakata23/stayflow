import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { KeyRound, Wifi, Copy, Check, Building2, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { PageHeader, Card, EmptyState, Spinner, Button, Alert } from '../components/ui'

function CopyValue({ value, mono }) {
  const [copied, setCopied] = useState(false)

  if (!value) return <span className="text-sm text-slate-300">—</span>

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
      className="group inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-sm text-slate-700 hover:bg-slate-100"
      title="Копирай"
    >
      <span className={mono ? 'font-mono' : ''}>{value}</span>
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-600" />
      ) : (
        <Copy className="h-3.5 w-3.5 text-slate-300 group-hover:text-slate-500" />
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
        title="Кодове за достъп"
        description="WiFi данни и кодове за самонастаняване по имоти."
      />

      <div className="mt-8">
        {error && <Alert>{error}</Alert>}

        {loading ? (
          <Card>
            <Spinner />
          </Card>
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
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60">
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Имот
                    </th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      WiFi мрежа
                    </th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      WiFi парола
                    </th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Код за достъп
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {properties.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/60">
                      <td className="px-6 py-4">
                        <Link
                          to={`/properties/${p.id}`}
                          className="text-sm font-medium text-slate-900 hover:text-brand-700"
                        >
                          {p.name}
                        </Link>
                        {p.city && <p className="text-xs text-slate-400">{p.city}</p>}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5">
                          {p.wifi_name && <Wifi className="h-3.5 w-3.5 text-slate-300" />}
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
