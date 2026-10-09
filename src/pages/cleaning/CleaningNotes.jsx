import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { StickyNote, Plus, Building2, Trash2, ImageOff } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatDateBG } from '../../lib/dates'
import { ISSUE_STYLES, issueTypeLabel, signedPhotoUrl } from '../../lib/cleaning'
import { PageHeader, Card, Select, Button, Alert, EmptyState, Modal, LoadingCard } from '../../components/ui'
import NoteFormModal from './NoteFormModal'

function NotePhoto({ path }) {
  const [url, setUrl] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    signedPhotoUrl(path).then((u) => {
      if (cancelled) return
      if (u) setUrl(u)
      else setFailed(true)
    })
    return () => {
      cancelled = true
    }
  }, [path])

  if (failed) {
    return (
      <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-sunken">
        <ImageOff className="h-5 w-5 text-ink-muted" />
      </div>
    )
  }
  if (!url) return <div className="h-16 w-16 animate-pulse rounded-lg bg-sunken" />

  return (
    <a href={url} target="_blank" rel="noreferrer" className="shrink-0">
      <img
        src={url}
        alt="Снимка към забележка"
        className="h-16 w-16 rounded-lg border border-line object-cover transition-opacity hover:opacity-80"
      />
    </a>
  )
}

export default function CleaningNotes() {
  const [properties, setProperties] = useState([])
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [propertyId, setPropertyId] = useState('all')

  const [modalOpen, setModalOpen] = useState(false)
  const [toDelete, setToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    supabase
      .from('properties')
      .select('id, name')
      .order('name')
      .then(({ data }) => setProperties(data ?? []))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    let query = supabase
      .from('cleaning_notes')
      .select('*')
      .order('created_at', { ascending: false })

    if (propertyId !== 'all') query = query.eq('property_id', propertyId)

    const { data, error } = await query
    if (error) setError('Неуспешно зареждане: ' + error.message)
    setNotes(data ?? [])
    setLoading(false)
  }, [propertyId])

  useEffect(() => {
    load()
  }, [load])

  const propertyName = (id) => properties.find((p) => p.id === id)?.name ?? '—'

  const confirmDelete = async () => {
    setDeleting(true)
    // Изтриваме снимката от Storage (ако има), после записа.
    if (toDelete.photo_url) {
      await supabase.storage.from('cleaning-photos').remove([toDelete.photo_url])
    }
    const { error } = await supabase.from('cleaning_notes').delete().eq('id', toDelete.id)
    setDeleting(false)
    setToDelete(null)
    if (error) return setError('Неуспешно изтриване: ' + error.message)
    load()
  }

  return (
    <div>
      <PageHeader
        icon={StickyNote}
        eyebrow="Почистване"
        title="Забележки от почистване"
        description="Щети, липсващи вещи и други бележки от екипа."
        action={
          <Button onClick={() => setModalOpen(true)} disabled={properties.length === 0}>
            <Plus className="h-4 w-4" />
            Нова забележка
          </Button>
        }
      />

      {properties.length === 0 && !loading ? (
        <div className="mt-8">
          <EmptyState
            icon={Building2}
            title="Първо добавете имот"
            description="Забележките се закачат за имот. Добавете поне един, за да започнете."
            action={
              <Link to="/properties/new">
                <Button>
                  <Plus className="h-4 w-4" />
                  Добави имот
                </Button>
              </Link>
            }
          />
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          {error && <Alert>{error}</Alert>}

          <div className="flex justify-end">
            <Select
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              aria-label="Имот"
              className="w-auto min-w-52"
            >
              <option value="all">Всички имоти</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>

          {loading ? (
            <LoadingCard />
          ) : notes.length === 0 ? (
            <EmptyState
              icon={StickyNote}
              title="Няма забележки"
              description="Добавете забележка, когато екипът установи щета или липсваща вещ."
              action={
                <Button onClick={() => setModalOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Нова забележка
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              {notes.map((note) => (
                <Card key={note.id} className="p-4">
                  <div className="flex gap-4">
                    {note.photo_url && <NotePhoto path={note.photo_url} />}

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${ISSUE_STYLES[note.issue_type]}`}
                        >
                          {issueTypeLabel(note.issue_type)}
                        </span>
                        <span className="text-sm font-medium text-ink">
                          {propertyName(note.property_id)}
                        </span>
                        <span className="text-xs text-ink-muted">
                          {formatDateBG(note.created_at.slice(0, 10))}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-ink-soft">{note.note_text}</p>
                    </div>

                    <button
                      onClick={() => setToDelete(note)}
                      className="icon-btn shrink-0 self-start text-ink-muted hover:text-danger"
                      aria-label="Изтрий забележката"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      <NoteFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={load}
        properties={properties}
      />

      <Modal open={Boolean(toDelete)} onClose={() => setToDelete(null)} title="Изтриване на забележка">
        <p className="text-sm leading-relaxed text-ink-soft">
          Сигурни ли сте, че искате да изтриете тази забележка? Действието е необратимо.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setToDelete(null)} disabled={deleting}>
            Отказ
          </Button>
          <Button variant="dangerSolid" onClick={confirmDelete} loading={deleting}>
            Изтрий
          </Button>
        </div>
      </Modal>
    </div>
  )
}
