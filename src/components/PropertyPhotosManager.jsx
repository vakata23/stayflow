import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Star, Trash2, GripVertical, ChevronLeft, ChevronRight } from 'lucide-react'
import { fetchPhotos, addPhotos, reorderPhotos, deletePhoto, setCoverPhoto, setPhotoRoom, MAX_PHOTOS_PER_PROPERTY } from '../lib/propertyPhotos'
import { ROOM_CHIPS } from '../lib/photoRooms'
import { Card, Button, Alert } from './ui'

export default function PropertyPhotosManager({ property, userId, onCoverChanged, onPhotosChanged, onUploaded }) {
  const [photos, setPhotos] = useState([])
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState(null) // { done, total } докато качва
  const [error, setError] = useState(null)
  const [dragIndex, setDragIndex] = useState(null)
  const fileRef = useRef(null)
  const uploading = progress !== null

  // Родителят (съветникът) следи броя снимки — в ефект, не в setState updater.
  useEffect(() => {
    onPhotosChanged?.(photos)
  }, [photos])

  const load = async () => {
    setLoading(true)
    try {
      const fresh = await fetchPhotos(property.id)
      setPhotos(fresh)
      return fresh
    } catch (err) {
      setError('Неуспешно зареждане: ' + err.message)
      return null
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
    setProgress({ done: 0, total: files.length })
    try {
      await addPhotos(property.id, files, userId, photos.length, (done, total) => setProgress({ done, total }))
      const fresh = await load()
      if (fresh) onUploaded?.(fresh)
    } catch (err) {
      setError('Неуспешно качване: ' + err.message)
      await load()
    } finally {
      setProgress(null)
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

  // Един клик: избира етикет; втори клик върху същия го маха.
  const handleRoom = async (photo, room) => {
    const next = photo.room === room ? null : room
    setPhotos((prev) => prev.map((p) => (p.id === photo.id ? { ...p, room: next } : p)))
    try {
      await setPhotoRoom(photo.id, next)
    } catch (err) {
      setPhotos((prev) => prev.map((p) => (p.id === photo.id ? { ...p, room: photo.room } : p)))
      setError('Неуспешно записване на етикета: ' + err.message)
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
      <h2 className="flex items-center gap-2 type-heading">
        <ImagePlus className="h-4 w-4 text-ink-muted" />
        Галерия
      </h2>
      <p className="mt-1 text-xs text-ink-muted">
        Отбележете какво е на всяка снимка — по етикетите страницата се подрежда сама. Стрелките
        местят ръчно (влачене — на компютър), звездата избира корицата. При качване снимките се
        смаляват и GPS данните от телефона се премахват.
      </p>

      {error && (
        <div className="mt-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {loading ? (
        <p className="mt-4 text-sm text-ink-soft">Зареждане…</p>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {photos.map((photo, i) => {
            const isCover = photo.photo_url === property.cover_image_url
            return (
              <div key={photo.id}>
              <div
                draggable
                onDragStart={handleDragStart(i)}
                onDragOver={handleDragOver(i)}
                onDrop={handleDrop}
                onDragEnd={() => setDragIndex(null)}
                className={`group relative aspect-square cursor-move overflow-hidden rounded-xl border bg-sunken ${
                  isCover ? 'border-accent ring-2 ring-accent-soft-hover' : 'border-line'
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
                      className="rounded-lg bg-ink/60 p-1 text-white hover:bg-ink/80 disabled:opacity-30"
                      aria-label="Премести наляво"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(i, 1)}
                      disabled={i === photos.length - 1}
                      className="rounded-lg bg-ink/60 p-1 text-white hover:bg-ink/80 disabled:opacity-30"
                      aria-label="Премести надясно"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(photo)}
                    className="rounded-lg bg-ink/60 p-1 text-white hover:bg-danger"
                    aria-label="Изтрий снимката"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => handleSetCover(photo)}
                  className={`absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs font-medium shadow ${
                    isCover ? 'bg-accent text-white' : 'bg-card/90 text-ink-soft sm:opacity-0 sm:group-hover:opacity-100'
                  }`}
                >
                  <Star className={`h-3 w-3 ${isCover ? 'fill-white' : ''}`} />
                  {isCover ? 'Корица' : 'Направи корица'}
                </button>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1" role="group" aria-label="Какво е на снимката">
                {ROOM_CHIPS.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={() => handleRoom(photo, chip.key)}
                    aria-pressed={photo.room === chip.key}
                    className={`rounded-full border px-2 py-1 text-[11px] font-medium leading-none transition-colors ${
                      photo.room === chip.key
                        ? 'border-accent bg-accent text-white'
                        : 'border-line bg-card text-ink-soft hover:border-accent hover:text-accent-ink'
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
              </div>
            )
          })}

          <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line-strong text-ink-muted hover:border-accent hover:text-accent">
            <ImagePlus className="h-6 w-6" />
            <span className="px-2 text-center text-xs font-medium">
              {uploading ? `Качване ${progress.done}/${progress.total}…` : `Добави снимки (${photos.length}/${MAX_PHOTOS_PER_PROPERTY})`}
            </span>
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
