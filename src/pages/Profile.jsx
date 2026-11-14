import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Phone, UserRound } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { validateProfile, guestFacingContact, profileChanged, NAME_MAX, COMPANY_MAX } from '../lib/profileLogic'
import { PageHeader, Card, Field, Input, Button, Alert, Spinner } from '../components/ui'

/**
 * „Профил и настройки“: името, фирмата и телефонът на собственика. Показват се на картата на госта
 * (име на фирмата, иначе име; телефон за връзка) и във фактурите — затова трябва да има къде да се сменят.
 */
export default function Profile() {
  const { user, profile, profileLoading, updateProfile } = useAuth()
  const [form, setForm] = useState({ full_name: '', company_name: '', phone: '' })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [serverError, setServerError] = useState(null)

  // Формата се попълва веднъж, когато профилът пристигне (и пак след запис — със записаните стойности).
  useEffect(() => {
    if (!profile) return
    setForm({ full_name: profile.full_name ?? '', company_name: profile.company_name ?? '', phone: profile.phone ?? '' })
  }, [profile])

  if (profileLoading) return <Spinner />

  if (!profile) {
    return (
      <div>
        <PageHeader eyebrow="Вашият акаунт" title="Профил и настройки" />
        <div className="mt-8">
          <Alert>Профилът не е намерен. Излезте и влезте отново.</Alert>
        </div>
      </div>
    )
  }

  const { values } = validateProfile(form)
  const dirty = profileChanged(profile, values)
  const preview = guestFacingContact({ ...profile, ...values })

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setSaved(false)
    setServerError(null)
    if (errors[key]) setErrors((er) => ({ ...er, [key]: undefined }))
  }

  const submit = async (e) => {
    e.preventDefault()
    const result = validateProfile(form)
    setErrors(result.errors)
    if (Object.keys(result.errors).length) return
    setSaving(true)
    setServerError(null)
    const { error } = await updateProfile(result.values)
    setSaving(false)
    if (error) setServerError('Неуспешен запис: ' + error.message)
    else setSaved(true)
  }

  return (
    <div>
      <PageHeader eyebrow="Вашият акаунт" title="Профил и настройки" description="Така ви виждат гостите и така излизате във фактурите." />

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
        <Card className="p-5 sm:p-6">
          <form onSubmit={submit} noValidate className="space-y-5">
            <Field label="Име" required error={errors.full_name}>
              <Input
                value={form.full_name}
                onChange={set('full_name')}
                autoComplete="name"
                maxLength={NAME_MAX + 20}
                invalid={!!errors.full_name}
              />
            </Field>

            <Field label="Фирма (по желание)" hint="Ако е попълнена, гостите и фактурите виждат нея вместо вашето име." error={errors.company_name}>
              <Input
                value={form.company_name}
                onChange={set('company_name')}
                autoComplete="organization"
                maxLength={COMPANY_MAX + 20}
                invalid={!!errors.company_name}
              />
            </Field>

            <Field label="Телефон за гостите" hint="Показва се на картата на госта, за да ви потърсят при проблем." error={errors.phone}>
              <Input
                value={form.phone}
                onChange={set('phone')}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+359 888 123 456"
                invalid={!!errors.phone}
              />
            </Field>

            <Field label="Имейл за вход" hint="Сменя се през възстановяване на парола.">
              <Input value={user?.email ?? ''} readOnly disabled autoComplete="email" />
            </Field>

            {serverError && <Alert>{serverError}</Alert>}
            {saved && !dirty && <Alert kind="success">Промените са запазени.</Alert>}

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" loading={saving} disabled={saving || !dirty}>
                Запази
              </Button>
              {dirty && !saving && <span className="text-sm text-ink-muted">Има незапазени промени.</span>}
            </div>
          </form>
        </Card>

        <Card className="p-5 sm:p-6">
          <h2 className="type-heading">Как се вижда от гостите</h2>
          <div className="mt-4 rounded-2xl bg-sunken p-4">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent" aria-hidden="true">
                <UserRound className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold leading-tight" data-testid="preview-name">
                  {preview.name ?? 'Няма име'}
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-soft" data-testid="preview-phone">
                  <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{preview.phone ?? 'Няма телефон — гостите няма да могат да ви потърсят'}</span>
                </p>
              </div>
            </div>
          </div>
          <p className="mt-4 text-sm text-ink-soft">
            Картата на госта е страницата, която получава гостът преди настаняване. Вижте и сменете адресите ѝ в{' '}
            <Link to="/guest-cards" className="font-semibold text-accent-ink underline">
              Адресни карти
            </Link>
            .
          </p>
        </Card>
      </div>
    </div>
  )
}
