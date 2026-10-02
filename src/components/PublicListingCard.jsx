import { useEffect, useState } from 'react'
import { Globe, Copy, Check, ExternalLink } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fetchPropertySettings } from '../lib/propertySettings'
import { Card, Field, Input, Textarea, Button, Alert } from './ui'

const SLUG_RE = /^[a-z0-9-]{2,40}$/

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}

export default function PublicListingCard({ property, onSaved }) {
  const [slug, setSlug] = useState(property.slug ?? '')
  const [isListed, setIsListed] = useState(property.is_listed ?? false)
  const [description, setDescription] = useState(property.public_description ?? '')
  const [copied, setCopied] = useState(false)
  const [basePrice, setBasePrice] = useState(null)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchPropertySettings(property.id).then((s) => {
      if (!cancelled) setBasePrice(Number(s.base_price) || 0)
    })
    return () => {
      cancelled = true
    }
  }, [property.id])

  const publicUrl = slug ? `${window.location.origin}/stay/${slug}` : ''

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* клипбордът може да е блокиран — линкът е видим за ръчно копиране */
    }
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    const cleanSlug = slugify(slug)
    if (isListed && !SLUG_RE.test(cleanSlug)) {
      return setError('Нужен е валиден адрес (само малки латински букви, цифри и тирета, 2–40 символа), за да публикувате имота.')
    }

    setSaving(true)
    const { error } = await supabase
      .from('properties')
      .update({
        slug: cleanSlug || null,
        is_listed: isListed,
        public_description: description.trim() || null,
      })
      .eq('id', property.id)
    setSaving(false)

    if (error) {
      // 23505 = unique constraint — адресът вече е зает от друг имот.
      if (error.code === '23505') return setError('Този адрес вече се ползва от друг имот — изберете друг.')
      return setError('Неуспешно записване: ' + error.message)
    }

    setSlug(cleanSlug)
    setSuccess(true)
    onSaved?.({ slug: cleanSlug, is_listed: isListed, public_description: description.trim() || null })
  }

  return (
    <Card className="p-6">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-slate-700">
        <Globe className="h-4 w-4 text-slate-400" />
        Публичен сайт за резервации
      </h2>
      <p className="mt-1 text-xs text-slate-400">
        Публикувайте имота на собствена страница, откъдето гостите могат да проверят цена,
        наличност и да изпратят заявка за резервация — без Airbnb/Booking.
      </p>

      <form onSubmit={handleSave} className="mt-5 space-y-5">
        {error && <Alert>{error}</Alert>}
        {success && <Alert kind="success">Записано.</Alert>}
        {isListed && basePrice === 0 && (
          <Alert kind="warning">
            Няма зададена базова цена за нощувка — гостите няма да виждат цена за дати извън
            ценови план. Задайте базова цена в настройките на имота по-горе.
          </Alert>
        )}

        <div className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-slate-800">Публикувай имота</p>
            <p className="text-xs text-slate-400">Виден е само когато е включено.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isListed}
            onClick={() => setIsListed((v) => !v)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              isListed ? 'bg-brand-600' : 'bg-slate-300'
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                isListed ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        <Field label="Публичен адрес" hint="Само малки латински букви, цифри и тирета.">
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-sm text-slate-400">/stay/</span>
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              onBlur={() => setSlug((v) => slugify(v))}
              placeholder="morski-apartament-varna"
            />
          </div>
        </Field>

        <Field label="Публично описание" hint="Текст, който гостите виждат на страницата.">
          <Textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Уютен апартамент на 100 м от плажа, с изглед към морето…"
          />
        </Field>

        {property.is_listed && property.slug && (
          <div className="rounded-xl bg-slate-50 px-4 py-3">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
              Публичен линк
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate text-sm text-slate-700">
                {window.location.origin}/stay/{property.slug}
              </code>
              <Button type="button" variant="secondary" onClick={copyLink} className="shrink-0 !py-2">
                {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              </Button>
              <a href={`/stay/${property.slug}`} target="_blank" rel="noreferrer">
                <Button type="button" variant="secondary" className="shrink-0 !py-2">
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </a>
            </div>
          </div>
        )}

        <div className="flex justify-end border-t border-slate-100 pt-5">
          <Button type="submit" loading={saving}>
            Запази
          </Button>
        </div>
      </form>
    </Card>
  )
}
