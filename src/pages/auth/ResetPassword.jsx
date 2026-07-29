import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { appOrigin } from '../../lib/appUrl'
import AuthLayout from '../../components/AuthLayout'
import { Field, Input, Button, Alert } from '../../components/ui'

export default function ResetPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${appOrigin()}/update-password`,
    })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    setSuccess(true)
  }

  return (
    <AuthLayout
      title="Забравена парола"
      subtitle="Ще ви изпратим линк за задаване на нова парола."
    >
      {success ? (
        <Alert kind="success">
          Ако съществува акаунт с <strong>{email}</strong>, ще получите имейл с линк за
          възстановяване на паролата.
        </Alert>
      ) : (
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
          <Button type="submit" loading={loading} className="w-full">Изпрати линк</Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm text-slate-500">
        <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-700">
          Обратно към входа
        </Link>
      </p>
    </AuthLayout>
  )
}
