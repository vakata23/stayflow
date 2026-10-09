import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Sparkles,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Star,
  Eye,
  Globe,
  CheckCircle2,
  Palette,
  Copy,
  Wand2,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { fetchPhotos, reorderPhotos } from '../../lib/propertyPhotos'
import { AMENITIES } from '../../lib/amenities'
import { PROPERTY_TYPES } from '../../lib/constants'
import { ROOM_LABELS, orderByRooms, amenityHintsFromRooms, suggestCoverId, brightnessFromImage, roomCounts } from '../../lib/photoRooms'
import { buildDescription } from '../../lib/descriptionTemplate'
import { accentFromImage } from '../../lib/accentColor'
import { slugify, SLUG_RE } from '../../lib/slug'
import { appOrigin } from '../../lib/appUrl'
import { PageHeader, Card, Button, Alert, Spinner, Field, Input, Select, Textarea } from '../../components/ui'
import PropertyPhotosManager from '../../components/PropertyPhotosManager'

const POLL_MS = 3000
const POLL_TIMEOUT_MS = 3 * 60 * 1000

/**
 * „Качи снимки → страницата се прави сама“ — БЕЗ платено AI:
 *   снимки с етикети → преглед (подредба по етикети, подсказки за удобства,
 *   описание от шаблон, цвят от корицата) → публикуване.
 * Нищо не става публично без „Публикувай“.
 *
 * Бъдещ „AI асистент“: ако properties.ai_assistant е включено (по
 * подразбиране НЕ е) се показва блок, който пуска старата обработка. Без
 * ANTHROPIC_API_KEY в Netlify тя просто отказва — не харчи нищо.
 */
export default function ListingSetup() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { session, user } = useAuth()

  const [property, setProperty] = useState(null)
  const [photos, setPhotos] = useState([])
  const [step, setStep] = useState('photos') // photos | processing (само AI) | review
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [loading, setLoading] = useState(true)

  // Преглед
  const [ordered, setOrdered] = useState([])
  const [amenities, setAmenities] = useState([])
  const [hints, setHints] = useState([])
  const [facts, setFacts] = useState({ property_type: 'apartment', bedrooms: 1, beds: 1, bathrooms: 1, area_m2: '' })
  const [descBg, setDescBg] = useState('')
  const [descEn, setDescEn] = useState('')
  const [accent, setAccent] = useState(null)
  const [useAccent, setUseAccent] = useState(true)
  const [coverNote, setCoverNote] = useState(null)
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState(null)
  const [published, setPublished] = useState(false)

  // Бъдещ AI асистент (изключен)
  const [run, setRun] = useState(null)
  const pollRef = useRef(null)
  const aiEnabled = property?.ai_assistant === true
  const suggestion = run?.status === 'done' ? run.result : null

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase.from('properties').select('*').eq('id', id).maybeSingle()
      if (cancelled) return
      if (error || !data) {
        setError('Имотът не е намерен или нямате достъп до него.')
        setLoading(false)
        return
      }
      setProperty(data)
      setPublished(data.is_listed)
      setPhotos(await fetchPhotos(id).catch(() => []))
      setLoading(false)
    })()
    return () => {
      cancelled = true
      clearInterval(pollRef.current)
    }
  }, [id])

  // ---------------------------------------------------------------- преглед
  const enterReview = async (aiResult = null) => {
    const fresh = await fetchPhotos(id).catch(() => photos)
    setPhotos(fresh)

    let order = fresh
    if (aiResult?.order?.length) {
      const byId = new Map(fresh.map((p) => [p.id, p]))
      order = [...aiResult.order.map((pid) => byId.get(pid)).filter(Boolean), ...fresh.filter((p) => !aiResult.order.includes(p.id))]
    } else if (fresh.some((p) => p.room)) {
      order = orderByRooms(fresh)
    }

    // Корица: ако собственикът вече е избрал — уважаваме я; иначе предлагаме по осветеност.
    const chosen = order.find((p) => p.photo_url === property?.cover_image_url)
    if (chosen) {
      order = [chosen, ...order.filter((p) => p !== chosen)]
      setCoverNote(null)
    } else if (order.length > 1) {
      try {
        const candidates = order.slice(0, 12)
        const levels = await Promise.all(candidates.map((p) => brightnessFromImage(p.thumb_url || p.photo_url).catch(() => 0.5)))
        const brightness = Object.fromEntries(candidates.map((p, i) => [p.id, levels[i]]))
        const coverId = suggestCoverId(candidates, brightness)
        const cover = order.find((p) => p.id === coverId)
        if (cover) {
          order = [cover, ...order.filter((p) => p !== cover)]
          setCoverNote('Корицата е предложена по осветеност — сменете я със звездата, ако искате друга.')
        }
      } catch {
        setCoverNote(null)
      }
    }
    setOrdered(order)

    const suggested = [...new Set([...amenityHintsFromRooms(fresh), ...(aiResult?.amenities ?? [])])]
    setHints(suggested)
    setAmenities(property?.amenities ?? [])

    const f = {
      property_type: property?.property_type ?? 'apartment',
      bedrooms: property?.bedrooms ?? 1,
      beds: property?.beds ?? 1,
      bathrooms: property?.bathrooms ?? 1,
      area_m2: property?.area_m2 ?? '',
    }
    setFacts(f)
    const draftFrom = { ...property, ...f, amenities: property?.amenities ?? [] }
    setDescBg(property?.public_description || aiResult?.description_bg || buildDescription(draftFrom, 'bg'))
    setDescEn(property?.public_description_en || aiResult?.description_en || buildDescription(draftFrom, 'en'))
    setStep('review')
  }

  // Цвят от корицата — при влизане в прегледа и при смяна на корицата.
  useEffect(() => {
    if (step !== 'review' || !ordered[0]) return
    let cancelled = false
    accentFromImage(ordered[0].thumb_url || ordered[0].photo_url)
      .then((c) => !cancelled && setAccent(c))
      .catch(() => !cancelled && setAccent(null))
    return () => {
      cancelled = true
    }
  }, [step, ordered[0]?.id])

  const move = (index, delta) => {
    const target = index + delta
    if (target < 0 || target >= ordered.length) return
    const next = [...ordered]
    ;[next[index], next[target]] = [next[target], next[index]]
    setOrdered(next)
  }
  const makeCover = (index) => {
    if (index === 0) return
    const next = [...ordered]
    const [p] = next.splice(index, 1)
    setOrdered([p, ...next])
    setCoverNote(null)
  }
  const resortByLabels = () => {
    setOrdered((prev) => {
      const cover = prev[0]
      const sorted = orderByRooms(prev.slice(1))
      return cover ? [cover, ...sorted] : sorted
    })
  }
  const toggleAmenity = (key) =>
    setAmenities((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  const setFact = (key) => (e) => setFacts((f) => ({ ...f, [key]: e.target.value }))

  const regenerateText = () => {
    const src = { ...property, ...facts, amenities }
    setDescBg(buildDescription(src, 'bg'))
    setDescEn(buildDescription(src, 'en'))
  }

  const ensureSlug = async () => {
    if (property.slug && SLUG_RE.test(property.slug)) return property.slug
    const base = slugify(`${property.name} ${property.city || ''}`) || 'imot'
    for (let attempt = 0; attempt < 6; attempt++) {
      const suffix = attempt === 0 ? '' : `-${attempt + 1}`
      const slug = base.slice(0, 40 - suffix.length) + suffix
      const { error } = await supabase.from('properties').update({ slug }).eq('id', id)
      if (!error) return slug
      if (error.code !== '23505') throw error
    }
    throw new Error('Не успяхме да намерим свободен адрес за страницата.')
  }

  const save = async ({ publish = false } = {}) => {
    setSaving(true)
    setError(null)
    setSavedMsg(null)
    try {
      await reorderPhotos(ordered.map((p, i) => ({ id: p.id, position: i })))
      const slug = publish ? await ensureSlug() : property.slug
      const patch = {
        cover_image_url: ordered[0]?.photo_url ?? property.cover_image_url,
        amenities,
        property_type: facts.property_type,
        bedrooms: Number(facts.bedrooms) || 0,
        beds: Number(facts.beds) || 0,
        bathrooms: Number(facts.bathrooms) || 0,
        area_m2: facts.area_m2 === '' ? null : Number(facts.area_m2),
        public_description: descBg.trim() || null,
        public_description_en: descEn.trim() || null,
        accent_color: useAccent ? accent : null,
        ...(publish ? { is_listed: true } : {}),
      }
      const { error } = await supabase.from('properties').update(patch).eq('id', id)
      if (error) throw error
      setProperty((p) => ({ ...p, ...patch, slug }))
      if (publish) setPublished(true)
      setSavedMsg(publish ? 'Публикувано! Страницата вече е видима за гостите.' : 'Записано (още не е публично).')
      return true
    } catch (err) {
      setError('Неуспешно записване: ' + err.message)
      return false
    } finally {
      setSaving(false)
    }
  }

  const previewAsGuest = async () => {
    if (await save()) navigate(`/properties/${id}/preview`)
  }

  // ---------------------------------------------------------------- бъдещ AI асистент (изключен)
  const startAi = async () => {
    setError(null)
    setNotice(null)
    const { data: runId, error } = await supabase.rpc('start_ai_run', {
      p_property_id: id,
      p_photo_count: Math.min(photos.length, 30),
    })
    if (error) return setNotice(error.message)
    setRun({ id: runId, status: 'queued', created_at: new Date().toISOString() })
    setStep('processing')
    fetch('/api/analyze-photos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ run_id: runId }),
    }).catch(() => {})
  }

  useEffect(() => {
    if (step !== 'processing' || !run?.id) return
    const started = new Date(run.created_at).getTime()
    pollRef.current = setInterval(async () => {
      const { data } = await supabase.from('ai_runs').select('*').eq('id', run.id).maybeSingle()
      const timedOut = Date.now() - started > POLL_TIMEOUT_MS
      if (data?.status === 'done' || data?.status === 'failed' || timedOut) {
        clearInterval(pollRef.current)
        if (data) setRun(data)
        if (data?.status !== 'done') setNotice('AI асистентът не отговори — продължаваме с етикетите и шаблона.')
        enterReview(data?.status === 'done' ? data.result : null)
      }
    }, POLL_MS)
    return () => clearInterval(pollRef.current)
  }, [step, run?.id])

  // ---------------------------------------------------------------- UI
  if (loading) return <Spinner />
  if (!property) return <Alert>{error}</Alert>

  const { unlabeled } = roomCounts(photos)
  const labeled = photos.length - unlabeled
  const publicUrl = property.slug ? `${appOrigin()}/stay/${property.slug}` : null

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        to={`/properties/${id}`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        {property.name}
      </Link>

      <PageHeader
        icon={Sparkles}
        title="Страницата за гости"
        description={
          step === 'review'
            ? 'Стъпка 3 от 3 — прегледайте, поправете каквото искате и публикувайте.'
            : step === 'processing'
              ? 'Изчакваме асистента…'
              : 'Стъпка 2 от 3 — качете снимките и отбележете какво е на всяка. Страницата се подрежда по етикетите.'
        }
      />

      <div className="mt-6 space-y-5">
        {error && <Alert>{error}</Alert>}
        {notice && <Alert kind="warning">{notice}</Alert>}

        {step === 'photos' && (
          <>
            <PropertyPhotosManager
              property={property}
              userId={user?.id}
              onPhotosChanged={setPhotos}
              onCoverChanged={(url) => setProperty((p) => ({ ...p, cover_image_url: url }))}
            />
            <Card className="space-y-3 p-5">
              <p className="text-sm text-ink-soft">
                {photos.length === 0
                  ? 'Качете снимките от телефона — до 30 наведнъж.'
                  : `Етикетирани: ${labeled} от ${photos.length}. ${
                      unlabeled > 0 ? 'Неетикетираните отиват най-накрая — отбележете ги за по-добър ред.' : 'Всички са отбелязани.'
                    }`}
              </p>
              <div className="flex flex-wrap gap-3">
                <Button onClick={() => enterReview(suggestion)} disabled={photos.length === 0}>
                  Продължи към прегледа
                </Button>
                {aiEnabled && (
                  <Button variant="secondary" onClick={startAi} disabled={photos.length < 5}>
                    <Wand2 className="h-4 w-4" />
                    Попитай AI асистента (бета)
                  </Button>
                )}
              </div>
            </Card>
          </>
        )}

        {step === 'processing' && (
          <Card className="flex flex-col items-center gap-3 p-10 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
            <p className="font-semibold text-ink">Асистентът разглежда снимките…</p>
            <Button variant="secondary" onClick={() => { clearInterval(pollRef.current); enterReview(null) }}>
              Не чакай — продължи с етикетите
            </Button>
          </Card>
        )}

        {step === 'review' && (
          <>
            <Card className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-ink">Ред на снимките</h2>
                  <p className="mt-1 text-xs text-ink-muted">
                    Подредени по етикети: дневна → спални → кухня → баня → тераса/гледка → отвън. Стрелките местят ръчно.
                  </p>
                </div>
                <button type="button" onClick={resortByLabels} className="text-xs font-semibold text-accent">
                  Подреди пак по етикети
                </button>
              </div>
              {coverNote && <p className="mt-2 text-xs text-warning-ink">{coverNote}</p>}
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {ordered.map((p, i) => (
                  <div key={p.id} className={`relative overflow-hidden rounded-xl border ${i === 0 ? 'border-accent ring-2 ring-accent-soft-hover' : 'border-line'}`}>
                    <img src={p.thumb_url || p.photo_url} alt="" className="aspect-square w-full object-cover" />
                    <div className="absolute inset-x-0 top-0 flex justify-between p-1.5">
                      <div className="flex gap-1">
                        <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded-lg bg-ink/60 p-1 text-white disabled:opacity-30" aria-label="По-напред">
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => move(i, 1)} disabled={i === ordered.length - 1} className="rounded-lg bg-ink/60 p-1 text-white disabled:opacity-30" aria-label="По-назад">
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {p.room && (
                        <span className="rounded-md bg-card/90 px-1.5 py-0.5 text-[11px] font-medium text-ink">{ROOM_LABELS[p.room]}</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => makeCover(i)}
                      className={`absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs font-medium shadow ${i === 0 ? 'bg-accent text-white' : 'bg-card/90 text-ink-soft'}`}
                    >
                      <Star className={`h-3 w-3 ${i === 0 ? 'fill-white' : ''}`} />
                      Корица
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setStep('photos')} className="mt-3 text-xs font-semibold text-accent">
                Добави, изтрий или смени етикети
              </button>
            </Card>

            <Card className="p-5">
              <h2 className="text-sm font-semibold text-ink">Удобства</h2>
              <p className="mt-1 text-xs text-ink-muted">
                {hints.length
                  ? 'Със „подсказка“ са отбелязани неща, за които има етикет на снимка (Кухня → кухня, Тераса → балкон). Отметнете ги само ако са верни — нищо не се слага само.'
                  : 'Отметнете какво има в имота.'}
              </p>
              {hints.some((k) => !amenities.includes(k)) && (
                <button
                  type="button"
                  onClick={() => setAmenities((prev) => [...new Set([...prev, ...hints])])}
                  className="mt-2 text-xs font-semibold text-accent"
                >
                  Отметни подсказаните ({hints.length})
                </button>
              )}
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {AMENITIES.map((a) => (
                  <label key={a.key} className="flex items-center gap-2 text-sm text-ink-soft">
                    <input
                      type="checkbox"
                      checked={amenities.includes(a.key)}
                      onChange={() => toggleAmenity(a.key)}
                      className="h-4 w-4 rounded border-line-strong text-accent focus:ring-accent"
                    />
                    {a.label}
                    {hints.includes(a.key) && (
                      <span className="rounded bg-warning-soft px-1.5 py-0.5 text-[10px] font-semibold text-warning-ink">подсказка</span>
                    )}
                  </label>
                ))}
              </div>
            </Card>

            <Card className="space-y-4 p-5">
              <div>
                <h2 className="text-sm font-semibold text-ink">Описание</h2>
                <p className="mt-1 text-xs text-ink-muted">
                  Чернова от вашите данни по-долу — проверете числата, после редактирайте текста както искате.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <Field label="Тип">
                  <Select value={facts.property_type} onChange={setFact('property_type')}>
                    {PROPERTY_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Спални">
                  <Input type="number" inputMode="numeric" min={0} value={facts.bedrooms} onChange={setFact('bedrooms')} />
                </Field>
                <Field label="Легла">
                  <Input type="number" inputMode="numeric" min={0} value={facts.beds} onChange={setFact('beds')} />
                </Field>
                <Field label="Бани">
                  <Input type="number" inputMode="decimal" min={0} step="0.5" value={facts.bathrooms} onChange={setFact('bathrooms')} />
                </Field>
                <Field label="Кв.м">
                  <Input type="number" inputMode="decimal" min={0} value={facts.area_m2} onChange={setFact('area_m2')} />
                </Field>
              </div>
              <Field label="На български">
                <Textarea rows={4} value={descBg} onChange={(e) => setDescBg(e.target.value)} />
              </Field>
              <Field label="На английски (по избор)">
                <Textarea rows={4} value={descEn} onChange={(e) => setDescEn(e.target.value)} />
              </Field>
              <button type="button" onClick={regenerateText} className="text-xs font-semibold text-accent">
                Попълни наново от данните (презаписва текста)
              </button>
            </Card>

            <Card className="p-5">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                <Palette className="h-4 w-4 text-ink-muted" />
                Цвят на страницата
              </h2>
              <div className="mt-3 flex items-center gap-3">
                <span
                  className="h-10 w-10 shrink-0 rounded-xl border border-line"
                  style={{ background: useAccent && accent ? accent : '#1b787c' }}
                />
                <p className="text-sm text-ink-soft">
                  {accent
                    ? useAccent
                      ? 'Взет от корицата и потъмнен, ако трябва, за да се чете белият текст на бутоните.'
                      : 'Стандартният цвят на StayFlow.'
                    : 'Корицата е почти безцветна — ползваме стандартния цвят.'}
                </p>
              </div>
              {accent && (
                <label className="mt-3 flex items-center gap-2 text-sm text-ink-soft">
                  <input type="checkbox" checked={useAccent} onChange={(e) => setUseAccent(e.target.checked)} className="h-4 w-4 rounded border-line-strong" />
                  Използвай цвета от корицата
                </label>
              )}
            </Card>

            {savedMsg && <Alert kind="success">{savedMsg}</Alert>}
            {published && publicUrl && (
              <div className="flex items-center gap-2 rounded-xl bg-sunken px-4 py-3 text-sm">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                <code className="flex-1 truncate text-ink">{publicUrl}</code>
                <button type="button" onClick={() => navigator.clipboard?.writeText(publicUrl)} className="text-ink-muted hover:text-ink" aria-label="Копирай линка">
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            )}

            <div className="sticky bottom-0 -mx-4 flex flex-wrap gap-3 border-t border-line bg-sunken/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
              <Button variant="secondary" onClick={previewAsGuest} loading={saving}>
                <Eye className="h-4 w-4" />
                Преглед като гост
              </Button>
              <Button variant="secondary" onClick={() => save()} loading={saving}>
                Запази
              </Button>
              <Button onClick={() => save({ publish: true })} loading={saving} disabled={ordered.length === 0}>
                <Globe className="h-4 w-4" />
                {published ? 'Запази и остави публикувано' : 'Публикувай'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
