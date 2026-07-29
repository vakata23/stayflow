import { useState, useEffect, useRef } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { ISSUE_TYPES, uploadCleaningPhoto } from '../../lib/cleaning'
import { Field, Textarea, Select, Button, Alert } from '../../components/ui'

export default function NoteFormModal({ open, onClose, onSaved, properties }) {
  const { user } = useAuth()
  const [propertyId, setPropertyId] = useState('')
  const [issueType, setIssueType] = useState('other')
  const [noteText, setNoteText] = useState('')
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setPropertyId(properties[0]?.id ?? '')
    setIssueType('other')
    setNoteText('')
    setFile(null)
    setPreview('')
    setError(null)
    if (fileRef.current) fileRef.current.value = ''
  }, [open])

  if (!open) return null

  const handleFile = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setError(null)
    if (!f.type.startsWith('image/')) return setError('Файлът трябва да е изображение.')
    if (f.size > 5 * 1024 * 1024) return setError('Снимката е твърде голяма (максимум 5 MB).')
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  const clearImage = () => {
    setFile(null)
    setPreview('')
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (!propertyId) return setError('Изберете имот.')
    if (!noteText.trim()) return setError('Описанието е задължително.')

    setSaving(true)
    try {
      let photoPath = null
      if (file) photoPath = await uploadCleaningPhoto(file, user.id)

      const { error } = await supabase.from('cleaning_notes').insert({
        property_id: propertyId,
        issue_type: issueType,
        note_text: noteText.trim(),
        photo_url: photoPath,
      })
      if (error) throw error

      onSaved()
      onClose()
    } catch (err) {
      setError('Неуспешно записване: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <div className="fixed inset-0 bg-slate-900/40" onClick={onClose} />

      <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl">
        <header className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-bold">Нова забележка</h2>
        </header>

        <form onSubmit={handleSubmit} className="space-y-5 px-6 py-5">
          {error && <Alert>{error}</Alert>}

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Имот" required>
              <Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
                <option value="">— Изберете имот —</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Тип">
              <Select value={issueType} onChange={(e) => setIssueType(e.target.value)}>
                {ISSUE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Описание" required>
            <Textarea
              rows={4}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="напр. Счупена чаша в кухнята, липсва една хавлия…"
            />
          </Field>

          <Field label="Снимка" hint="По избор — JPG или PNG, до 5 MB.">
            {preview ? (
              <div className="relative inline-block">
                <img
                  src={preview}
                  alt="Преглед"
                  className="h-32 w-auto rounded-xl border border-slate-200 object-cover"
                />
                <button
                  type="button"
                  onClick={clearImage}
                  className="absolute right-1.5 top-1.5 rounded-lg bg-slate-900/60 p-1 text-white hover:bg-slate-900/80"
                  aria-label="Премахни снимката"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500 hover:border-brand-400 hover:bg-brand-50/40">
                <ImagePlus className="h-5 w-5 text-slate-400" />
                Добави снимка
                <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
              </label>
            )}
          </Field>

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
              Отказ
            </Button>
            <Button type="submit" loading={saving}>
              Запази забележка
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
