import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import AuthLayout from '../../components/AuthLayout'
import { Field, Input, Button, Alert } from '../../components/ui'

export default function UpdatePassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Паролата трябва да е поне 8 символа.')
      return
    }
    if (password !== confirm) {
      setError('Паролите не съвпадат.')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    navigate('/')
  }

  return (
    <AuthLayout title="Нова парола" subtitle="Задайте новата си парола.">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Нова парола">
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
        <Field label="Повторете паролата">
          <Input
            type="password"
            required
            autoComplete="new-password"
            placeholder="••••••••"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        <Button type="submit" loading={loading} className="w-full">Запази паролата</Button>
      </form>
    </AuthLayout>
  )
}
