import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Building2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { savePropertySettings } from '../../lib/propertySettings'
import { slugify } from '../../lib/slug'
import { PROPERTY_TYPES } from '../../lib/constants'
import { PageHeader, Spinner, Alert, Card, Field, Input, Select, Button } from '../../components/ui'

/**
 * Стъпка 1 от „Качи снимки → страницата се прави сама“: само най-нужното,
 * удобно за телефон. Всичко останало (WiFi, правила, канали…) е в имота.
 * Имотът се създава НЕпубликуван; адресът /stay/... се генерира от името.
 */
export default function PropertyNew() {
  const navigate = useNavigate()
  const { profile, profileLoading } = useAuth()
  const [values, setValues] = useState({ name: '', city: '', property_type: 'apartment', max_guests: 2, base_price: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const set = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.value }))

  const insertWithFreeSlug = async (row) => {
    const base = slugify(`${row.name} ${row.city}`) || slugify(row.name) || 'imot'
    for (let attempt = 0; attempt < 6; attempt++) {
      const suffix = attempt === 0 ? '' : attempt < 5 ? `-${attempt + 1}` : `-${crypto.randomUUID().slice(0, 6)}`
      const slug = (base.slice(0, 40 - suffix.length) + suffix).replace(/^-+/, '')
      const { data, error } = await supabase.from('properties').insert({ ...row, slug }).select('id').single()
      if (!error) return data
      if (error.code !== '23505') throw error // 23505 = адресът е зает → пробваме със суфикс
    }
    throw new Error('Не успяхме да намерим свободен адрес за страницата.')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (!values.name.trim()) return setError('Името на имота е задължително.')
    if (Number(values.max_guests) < 1) return setError('Поне 1 гост.')
    if (values.base_price !== '' && !(Number(values.base_price) > 0)) return setError('Цената трябва да е положително число.')

    setSaving(true)
    try {
      const created = await insertWithFreeSlug({
        name: values.name.trim(),
        city: values.city.trim(),
        property_type: values.property_type,
        max_guests: Number(values.max_guests),
        owner_id: profile.id,
        is_listed: false,
      })
      if (values.base_price !== '') {
        await savePropertySettings(created.id, { base_price: Number(values.base_price) })
      }
      navigate(`/properties/${created.id}/setup`)
    } catch (err) {
      setError('Неуспешно записване: ' + err.message)
      setSaving(false)
    }
  }

  if (profileLoading) return <Spinner />

  if (!profile) {
    return (
      <Alert>
        Профилът ви не беше намерен, затова не може да се създаде имот. Опитайте да излезете и
        да влезете отново — ако проблемът продължи, свържете се с поддръжката.
      </Alert>
    )
  }

  return (
    <div className="mx-auto max-w-lg">
      <Link
        to="/properties"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Всички имоти
      </Link>

      <PageHeader
        icon={Building2}
        title="Нов имот"
        description="Стъпка 1 от 3 — основното. После качвате снимки, отбелязвате какво е на всяка и страницата се подрежда по етикетите."
      />

      <Card className="mt-6 p-5">
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && <Alert>{error}</Alert>}
          <Field label="Име на имота" required>
            <Input value={values.name} onChange={set('name')} placeholder="Морски апартамент" maxLength={120} autoFocus />
          </Field>
          <Field label="Град или курорт">
            <Input value={values.city} onChange={set('city')} placeholder="Варна" />
          </Field>
          <Field label="Тип имот">
            <Select value={values.property_type} onChange={set('property_type')}>
              {PROPERTY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="До колко гости" required>
              <Input type="number" inputMode="numeric" min={1} max={50} value={values.max_guests} onChange={set('max_guests')} />
            </Field>
            <Field label="Цена от (€/нощ)">
              <Input type="number" inputMode="decimal" min={1} step="1" value={values.base_price} onChange={set('base_price')} placeholder="70" />
            </Field>
          </div>
          <Button type="submit" loading={saving} className="w-full">
            Напред — снимки
          </Button>
        </form>
      </Card>
    </div>
  )
}
