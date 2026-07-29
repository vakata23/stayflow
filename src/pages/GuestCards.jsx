import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MapPin, Building2, Plus, Copy, Check, ExternalLink } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { appOrigin } from '../lib/appUrl'
import { PageHeader, Card, EmptyState, Spinner, Button, Alert } from '../components/ui'

function GuestCardRow({ property }) {
  const [copied, setCopied] = useState(false)
  const link = `${appOrigin()}/guest/${property.id}`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* клипбордът може да е блокиран — линкът е видим за ръчно копиране */
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-4 px-5 py-4">
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-100">
        {property.cover_image_url ? (
          <img src={property.cover_image_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Building2 className="h-5 w-5 text-slate-300" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="font-medium text-slate-900">{property.name}</p>
        <p className="truncate font-mono text-xs text-slate-400">{link}</p>
      </div>

      <div className="flex gap-2">
        <Button variant="secondary" onClick={copy} className="!py-2">
          {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Копирано' : 'Копирай линк'}
        </Button>
        <a href={link} target="_blank" rel="noreferrer">
          <Button variant="secondary" className="!py-2" title="Отвори картата">
            <ExternalLink className="h-4 w-4" />
          </Button>
        </a>
      </div>
    </div>
  )
}

export default function GuestCards() {
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    supabase
      .from('properties')
      .select('id, name, cover_image_url')
      .order('name')
      .then(({ data, error }) => {
        if (error) setError('Неуспешно зареждане: ' + error.message)
        setProperties(data ?? [])
        setLoading(false)
      })
  }, [])

  return (
    <div>
      <PageHeader
        icon={MapPin}
        title="Адресни карти"
        description="Публичен линк за всеки имот с информация за гостите. Изпратете го преди настаняване."
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
            description="Адресната карта се генерира автоматично за всеки имот. Добавете първия си имот."
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
          <Card className="divide-y divide-slate-100">
            {properties.map((p) => (
              <GuestCardRow key={p.id} property={p} />
            ))}
          </Card>
        )}
      </div>
    </div>
  )
}
