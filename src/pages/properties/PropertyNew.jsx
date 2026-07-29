import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Building2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { uploadPropertyImage } from '../../lib/storage'
import { PageHeader, Spinner, Alert } from '../../components/ui'
import PropertyForm from './PropertyForm'

export default function PropertyNew() {
  const navigate = useNavigate()
  const { user, profile, profileLoading } = useAuth()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (values, file) => {
    setSaving(true)
    setError(null)

    try {
      let coverUrl = values.cover_image_url || null
      if (file) coverUrl = await uploadPropertyImage(file, user.id)

      const { data, error } = await supabase
        .from('properties')
        .insert({ ...values, cover_image_url: coverUrl, owner_id: profile.id })
        .select('id')
        .single()

      if (error) throw error
      navigate(`/properties/${data.id}`)
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
    <div>
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
        description="Попълнете данните за имота. Можете да ги промените по всяко време."
      />

      <div className="mt-8">
        <PropertyForm
          onSubmit={handleSubmit}
          submitLabel="Създай имот"
          saving={saving}
          error={error}
          onCancel={() => navigate('/properties')}
        />
      </div>
    </div>
  )
}
