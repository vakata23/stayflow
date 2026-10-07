import { useState, useRef } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { PROPERTY_TYPES } from '../../lib/constants'
import { Field, Input, Textarea, Select, Button, Alert, Card } from '../../components/ui'

const emptyValues = {
  name: '',
  address: '',
  city: '',
  property_type: 'apartment',
  max_guests: 2,
  wifi_name: '',
  wifi_password: '',
  access_code: '',
  house_rules: '',
  cover_image_url: '',
}

export default function PropertyForm({ initial, onSubmit, submitLabel, saving, error, onCancel }) {
  const [values, setValues] = useState({ ...emptyValues, ...initial })
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(initial?.cover_image_url || '')
  const [localError, setLocalError] = useState(null)
  const fileRef = useRef(null)

  const set = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.value }))

  const handleFile = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setLocalError(null)
    if (!f.type.startsWith('image/')) {
      setLocalError('Файлът трябва да е изображение.')
      return
    }
    if (f.size > 25 * 1024 * 1024) {
      setLocalError('Снимката е твърде голяма (максимум 25 MB).')
      return
    }
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  const clearImage = () => {
    setFile(null)
    setPreview('')
    setValues((v) => ({ ...v, cover_image_url: '' }))
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setLocalError(null)

    if (!values.name.trim()) {
      setLocalError('Името на имота е задължително.')
      return
    }
    if (Number(values.max_guests) < 1) {
      setLocalError('Максималният брой гости трябва да е поне 1.')
      return
    }

    onSubmit(
      {
        ...values,
        name: values.name.trim(),
        address: values.address.trim(),
        city: values.city.trim(),
        max_guests: Number(values.max_guests),
      },
      file
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {(error || localError) && <Alert>{error || localError}</Alert>}

      <Card className="p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
          Основна информация
        </h2>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Име на имота" required>
              <Input
                value={values.name}
                onChange={set('name')}
                placeholder="напр. Морски апартамент — Варна"
                maxLength={120}
              />
            </Field>
          </div>
          <Field label="Адрес">
            <Input value={values.address} onChange={set('address')} placeholder="ул. Примерна 12, ет. 3" />
          </Field>
          <Field label="Град">
            <Input value={values.city} onChange={set('city')} placeholder="Варна" />
          </Field>
          <Field label="Тип имот">
            <Select value={values.property_type} onChange={set('property_type')}>
              {PROPERTY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Максимален брой гости" required>
            <Input
              type="number"
              min={1}
              max={50}
              value={values.max_guests}
              onChange={set('max_guests')}
            />
          </Field>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
          Информация за гостите
        </h2>
        <p className="mt-1 text-xs text-slate-400">
          Тези данни ще се показват на публичната адресна карта на имота (Етап 7).
        </p>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field label="WiFi мрежа">
            <Input value={values.wifi_name} onChange={set('wifi_name')} placeholder="StayFlow_Guest" />
          </Field>
          <Field label="WiFi парола">
            <Input value={values.wifi_password} onChange={set('wifi_password')} placeholder="••••••••" />
          </Field>
          <Field label="Код за достъп" hint="Код на сейф-кутията или входната врата.">
            <Input value={values.access_code} onChange={set('access_code')} placeholder="1234" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Правила на къщата">
              <Textarea
                value={values.house_rules}
                onChange={set('house_rules')}
                rows={5}
                placeholder={'Пушенето е забранено.\nТихи часове: 22:00 – 08:00.\nНе се допускат домашни любимци.'}
              />
            </Field>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Снимка</h2>
        <div className="mt-5 flex flex-wrap items-center gap-5">
          <div className="relative h-32 w-48 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            {preview ? (
              <>
                <img src={preview} alt="Преглед" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={clearImage}
                  className="absolute right-1.5 top-1.5 rounded-lg bg-slate-900/60 p-1 text-white hover:bg-slate-900/80"
                  aria-label="Премахни снимката"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </>
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <ImagePlus className="h-7 w-7 text-slate-300" />
              </div>
            )}
          </div>
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handleFile}
              className="block w-full text-sm text-slate-500 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
            />
            <p className="mt-2 text-xs text-slate-400">Снимка от телефона, до 25 MB — смаляваме я и махаме GPS данните автоматично.</p>
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={saving}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
            Отказ
          </Button>
        )}
      </div>
    </form>
  )
}
