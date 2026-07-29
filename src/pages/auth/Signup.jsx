import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import AuthLayout from '../../components/AuthLayout'
import { Field, Input, Button, Alert } from '../../components/ui'

export default function Signup() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Паролата трябва да е поне 8 символа.')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    setSuccess(true)
  }

  if (success) {
    return (
      <AuthLayout title="Проверете пощата си">
        <Alert kind="success">
          Изпратихме линк за потвърждение на <strong>{email}</strong>. Отворете го, за да
          активирате акаунта си, след което влезте.
        </Alert>
        <p className="mt-6 text-center text-sm text-slate-500">
          <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-700">
            Към входа
          </Link>
        </p>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Регистрация" subtitle="Създайте акаунт и добавете първия си имот за минути.">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Име и фамилия">
          <Input
            type="text"
            required
            autoComplete="name"
            placeholder="Иван Иванов"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </Field>
        <Field label="Имейл">
          <Input
            type="email"
            required
            autoComplete="email"
            placeholder="ime@primer.bg"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Парола">
          <Input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="Минимум 8 символа"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Button type="submit" loading={loading} className="w-full">Създай акаунт</Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        Вече имате акаунт?{' '}
        <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-700">
          Вход
        </Link>
      </p>
    </AuthLayout>
  )
}
