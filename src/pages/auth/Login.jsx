import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import AuthLayout from '../../components/AuthLayout'
import { Field, Input, Button, Alert } from '../../components/ui'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) {
      setError(
        error.message === 'Invalid login credentials'
          ? 'Невалиден имейл или парола.'
          : error.message
      )
      return
    }
    navigate('/')
  }

  return (
    <AuthLayout title="Вход" subtitle="Влезте в акаунта си, за да управлявате имотите си.">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
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
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <div className="flex justify-end">
          <Link to="/reset-password" className="text-sm font-medium text-brand-600 hover:text-brand-700">
            Забравена парола?
          </Link>
        </div>
        <Button type="submit" loading={loading} className="w-full">Вход</Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        Нямате акаунт?{' '}
        <Link to="/signup" className="font-semibold text-brand-600 hover:text-brand-700">
          Регистрирайте се
        </Link>
      </p>
    </AuthLayout>
  )
}
