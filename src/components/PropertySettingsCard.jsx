import { useState, useEffect } from 'react'
import { Percent, Phone, MessageSquare, MessageCircle, Smartphone, Send, Instagram, Mail, Plus, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  DEFAULT_SETTINGS,
  fetchPropertySettings,
  savePropertySettings,
  CHANNEL_TYPES,
  channelLabel,
} from '../lib/propertySettings'
import { Card, Field, Input, Select, Button, Alert, Spinner } from './ui'

const CHANNEL_ICONS = {
  phone: Phone,
  sms: MessageSquare,
  viber: MessageCircle,
  whatsapp: Smartphone,
  telegram: Send,
  messenger: MessageCircle,
  instagram: Instagram,
  email: Mail,
}

export default function PropertySettingsCard({ property, onSaved }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [channels, setChannels] = useState(property.channels ?? [])
  const [newChannelType, setNewChannelType] = useState('viber')
  const [newChannelValue, setNewChannelValue] = useState('')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchPropertySettings(property.id).then((s) => {
      if (!cancelled) {
        setSettings(s)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [property.id])

  const set = (key) => (e) => setSettings((s) => ({ ...s, [key]: e.target.value }))

  const addChannel = () => {
    if (!newChannelValue.trim()) return
    setChannels((c) => [...c, { type: newChannelType, value: newChannelValue.trim() }])
    setNewChannelValue('')
  }

  // Полето за канал седи в <form onSubmit={handleSave}> — без това Enter
  // тук би записал настройките вместо просто да добави канала.
  const handleChannelKeyDown = (e) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    addChannel()
  }

  const removeChannel = (index) => {
    setChannels((c) => c.filter((_, i) => i !== index))
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (settings.ota_commission_pct < 0 || settings.ota_commission_pct > 50) {
      return setError('Комисионата трябва да е между 0 и 50%.')
    }
    if (settings.deposit_pct < 0 || settings.deposit_pct > 100) {
      return setError('Капарото трябва да е между 0 и 100%.')
    }

    setSaving(true)
    try {
      await savePropertySettings(property.id, {
        ota_commission_pct: Number(settings.ota_commission_pct),
        tourist_tax: Number(settings.tourist_tax),
        cleaning_fee: Number(settings.cleaning_fee),
        deposit_pct: Number(settings.deposit_pct),
      })

      const { error: chError } = await supabase
        .from('properties')
        .update({ channels })
        .eq('id', property.id)
      if (chError) throw chError

      setSuccess(true)
      onSaved?.(channels)
    } catch (err) {
      setError('Неуспешно записване: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
        Настройки на имота
      </h2>
      <p className="mt-1 text-xs text-slate-400">
        Тези стойности се ползват за предложената комисиона и туристическа такса при нова
        резервация, както и за изчисляване на приходите.
      </p>

      {loading ? (
        <Spinner />
      ) : (
        <form onSubmit={handleSave} className="mt-5 space-y-6">
          {error && <Alert>{error}</Alert>}
          {success && <Alert kind="success">Настройките са записани.</Alert>}

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Комисиона на платформите" hint="% от Airbnb/Booking за тази резервация">
              <div className="relative">
                <Input
                  type="number"
                  min={0}
                  max={50}
                  step="0.1"
                  value={settings.ota_commission_pct}
                  onChange={set('ota_commission_pct')}
                  className="pr-8"
                />
                <Percent className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
              </div>
            </Field>
            <Field label="Туристически данък" hint="€ на гост на нощувка">
              <Input type="number" min={0} step="0.01" value={settings.tourist_tax} onChange={set('tourist_tax')} />
            </Field>
            <Field label="Такса почистване" hint="€ за целия престой">
              <Input type="number" min={0} step="0.01" value={settings.cleaning_fee} onChange={set('cleaning_fee')} />
            </Field>
            <Field label="Капаро" hint="% от общата цена">
              <div className="relative">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={settings.deposit_pct}
                  onChange={set('deposit_pct')}
                  className="pr-8"
                />
                <Percent className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
              </div>
            </Field>
          </div>

          <div className="border-t border-slate-100 pt-5">
            <p className="mb-3 text-sm font-medium text-slate-700">Канали за връзка с госта</p>

            {channels.length > 0 && (
              <ul className="mb-3 space-y-2">
                {channels.map((ch, i) => {
                  const Icon = CHANNEL_ICONS[ch.type] ?? MessageCircle
                  return (
                    <li
                      key={i}
                      className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-slate-400" />
                      <span className="w-24 shrink-0 text-xs font-medium text-slate-500">
                        {channelLabel(ch.type)}
                      </span>
                      <span className="flex-1 truncate text-sm text-slate-800">{ch.value}</span>
                      <button
                        type="button"
                        onClick={() => removeChannel(i)}
                        className="shrink-0 rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-600"
                        aria-label="Премахни канала"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}

            <div className="flex flex-wrap gap-2">
              <Select
                value={newChannelType}
                onChange={(e) => setNewChannelType(e.target.value)}
                onKeyDown={handleChannelKeyDown}
                className="w-auto min-w-36"
              >
                {CHANNEL_TYPES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
              <Input
                value={newChannelValue}
                onChange={(e) => setNewChannelValue(e.target.value)}
                onKeyDown={handleChannelKeyDown}
                placeholder="+359 88 123 4567 или @потребител"
                className="min-w-0 flex-1"
              />
              <Button type="button" variant="secondary" onClick={addChannel} className="!py-2">
                <Plus className="h-4 w-4" />
                Добави
              </Button>
            </div>
          </div>

          <div className="flex justify-end border-t border-slate-100 pt-5">
            <Button type="submit" loading={saving}>
              Запази настройките
            </Button>
          </div>
        </form>
      )}
    </Card>
  )
}
