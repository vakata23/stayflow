import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Star, Trash2, GripVertical, ChevronLeft, ChevronRight } from 'lucide-react'
import { fetchPhotos, addPhotos, reorderPhotos, deletePhoto, setCoverPhoto } from '../lib/propertyPhotos'
import { Card, Button, Alert } from './ui'

export default function PropertyPhotosManager({ property, userId, onCoverChanged }) {
  const [photos, setPhotos] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [dragIndex, setDragIndex] = useState(null)
  const fileRef = useRef(null)

  const load = async () => {
    setLoading(true)
    try {
      setPhotos(await fetchPhotos(property.id))
    } catch (err) {
      setError('Неуспешно зареждане: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [property.id])

  const handleUpload = async (e) => {
    const files = [...(e.target.files ?? [])]
    if (files.length === 0) return
    setError(null)
    setUploading(true)
    try {
      await addPhotos(property.id, files, userId, photos.length)
      await load()
    } catch (err) {
      setError('Неуспешно качване: ' + err.message)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleDelete = async (photo) => {
    setError(null)
    try {
      await deletePhoto(photo)
      setPhotos((p) => p.filter((x) => x.id !== photo.id))
    } catch (err) {
      setError('Неуспешно изтриване: ' + err.message)
    }
  }

  const handleSetCover = async (photo) => {
    setError(null)
    try {
      await setCoverPhoto(property.id, photo.photo_url)
      onCoverChanged?.(photo.photo_url)
    } catch (err) {
      setError('Неуспешно записване: ' + err.message)
    }
  }

  const handleDragStart = (index) => (e) => {
    setDragIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }
  const handleDragOver = (index) => (e) => {
    e.preventDefault()
    if (dragIndex === null || dragIndex === index) return
    setPhotos((prev) => {
      const next = [...prev]
      const [moved] = next.splice(dragIndex, 1)
      next.splice(index, 0, moved)
      return next
    })
    setDragIndex(index)
  }
  const handleDrop = async () => {
    setDragIndex(null)
    await reorderPhotos(photos.map((p, i) => ({ id: p.id, position: i })))
  }

  // Влаченето не работи на тъч екран — стрелките са алтернативата за телефон.
  const move = async (index, delta) => {
    const target = index + delta
    if (target < 0 || target >= photos.length) return
    const next = [...photos]
    ;[next[index], next[target]] = [next[target], next[index]]
    setPhotos(next)
    await reorderPhotos(next.map((p, i) => ({ id: p.id, position: i })))
  }

  return (
    <Card className="p-6">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-slate-700">
        <ImagePlus className="h-4 w-4 text-slate-400" />
        Галерия
      </h2>
      <p className="mt-1 text-xs text-slate-400">
        Влачете снимките, за да ги подредите. Звездата избира корицата, която гостите виждат първо.
      </p>

      {error && (
        <div className="mt-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Зареждане…</p>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {photos.map((photo, i) => {
            const isCover = photo.photo_url === property.cover_image_url
            return (
              <div
                key={photo.id}
                draggable
                onDragStart={handleDragStart(i)}
                onDragOver={handleDragOver(i)}
                onDrop={handleDrop}
                onDragEnd={() => setDragIndex(null)}
                className={`group relative aspect-square cursor-move overflow-hidden rounded-xl border bg-slate-50 ${
                  isCover ? 'border-brand-500 ring-2 ring-brand-200' : 'border-slate-200'
                }`}
              >
                <img src={photo.photo_url} alt="" className="h-full w-full object-cover" draggable={false} />
                <div className="absolute inset-x-0 top-0 flex items-center justify-between p-1.5 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                  <div className="flex gap-1">
                    <GripVertical className="hidden h-4 w-4 text-white drop-shadow sm:block" />
                    <button
                      type="button"
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      className="rounded-lg bg-slate-900/60 p-1 text-white hover:bg-slate-900/80 disabled:opacity-30"
                      aria-label="Премести наляво"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(i, 1)}
                      disabled={i === photos.length - 1}
                      className="rounded-lg bg-slate-900/60 p-1 text-white hover:bg-slate-900/80 disabled:opacity-30"
                      aria-label="Премести надясно"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(photo)}
                    className="rounded-lg bg-slate-900/60 p-1 text-white hover:bg-red-600"
                    aria-label="Изтрий снимката"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => handleSetCover(photo)}
                  className={`absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs font-medium shadow ${
                    isCover ? 'bg-brand-600 text-white' : 'bg-white/90 text-slate-600 sm:opacity-0 sm:group-hover:opacity-100'
                  }`}
                >
                  <Star className={`h-3 w-3 ${isCover ? 'fill-white' : ''}`} />
                  {isCover ? 'Корица' : 'Направи корица'}
                </button>
              </div>
            )
          })}

          <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 text-slate-400 hover:border-brand-400 hover:text-brand-600">
            <ImagePlus className="h-6 w-6" />
            <span className="text-xs font-medium">{uploading ? 'Качване…' : 'Добави снимки'}</span>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>
        </div>
      )}
    </Card>
  )
}
