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
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { fetchPhotos, reorderPhotos } from '../../lib/propertyPhotos'
import { AMENITIES } from '../../lib/amenities'
import { ROOM_LABELS } from '../../lib/photoAnalysis'
import { accentFromImage } from '../../lib/accentColor'
import { slugify, SLUG_RE } from '../../lib/slug'
import { appOrigin } from '../../lib/appUrl'
import { PageHeader, Card, Button, Alert, Spinner, Field, Textarea } from '../../components/ui'
import PropertyPhotosManager from '../../components/PropertyPhotosManager'

const MIN_PHOTOS_FOR_AI = 5
const DAILY_RUNS = 3
const POLL_MS = 3000
const POLL_TIMEOUT_MS = 3 * 60 * 1000

function startOfTodayISO() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

/**
 * Стъпки 2–3 от „Качи снимки → страницата се прави сама“:
 *   снимки → автоматична обработка (Claude) → преглед → публикуване.
 * AI резултатът е само ПРЕДЛОЖЕНИЕ (ai_runs.result). В имота се записва
 * едва при „Запази“/„Публикувай“, а публично става само при „Публикувай“.
 */
export default function ListingSetup() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { session, user } = useAuth()

  const [property, setProperty] = useState(null)
  const [photos, setPhotos] = useState([])
  const [step, setStep] = useState('photos') // photos | processing | review
  const [run, setRun] = useState(null)
  const [runsToday, setRunsToday] = useState(0)
  const [everRan, setEverRan] = useState(true) // докато не знаем — не пускаме нищо платено само
  const [aiNotice, setAiNotice] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  // Състояние на прегледа
  const [ordered, setOrdered] = useState([])
  const [amenities, setAmenities] = useState([])
  const [descBg, setDescBg] = useState('')
  const [descEn, setDescEn] = useState('')
  const [accent, setAccent] = useState(null)
  const [useAccent, setUseAccent] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState(null)
  const [published, setPublished] = useState(false)
  const pollRef = useRef(null)

  const suggestion = run?.status === 'done' ? run.result : null

  const loadRunsToday = useCallback(async () => {
    const { data } = await supabase
      .from('ai_runs')
      .select('*')
      .eq('property_id', id)
      .order('created_at', { ascending: false })
      .limit(20)
    const runs = data ?? []
    setEverRan(runs.length > 0)
    setRunsToday(runs.filter((r) => r.created_at >= startOfTodayISO()).length)
    return runs
  }, [id])

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
      const [runs, fresh] = await Promise.all([loadRunsToday(), fetchPhotos(id).catch(() => [])])
      if (cancelled) return
      setPhotos(fresh)
      // Ако има започната обработка от преди малко — продължаваме да я следим.
      const pending = runs.find((r) => r.status === 'queued' || r.status === 'running')
      if (pending && Date.now() - new Date(pending.created_at).getTime() < POLL_TIMEOUT_MS) {
        setRun(pending)
        setStep('processing')
      } else {
        // Последният успешен резултат остава достъпен, без нова (платена) обработка.
        const lastDone = runs.find((r) => r.status === 'done')
        if (lastDone) setRun(lastDone)
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
      clearInterval(pollRef.current)
    }
  }, [id, loadRunsToday])

  // ---------------------------------------------------------------- AI
  const startAi = async (currentPhotos = photos) => {
    setError(null)
    setAiNotice(null)
    const { data: runId, error } = await supabase.rpc('start_ai_run', {
      p_property_id: id,
      p_photo_count: Math.min(currentPhotos.length, 30),
    })
    if (error) {
      setAiNotice(error.message)
      return
    }
    setRun({ id: runId, status: 'queued', created_at: new Date().toISOString() })
    setStep('processing')
    setRunsToday((n) => n + 1)
    setEverRan(true)
    fetch('/api/analyze-photos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ run_id: runId }),
    }).catch(() => {
      /* статусът се следи от ai_runs; ако заявката изобщо не тръгне, таймаутът по-долу поема */
    })
  }

  useEffect(() => {
    if (step !== 'processing' || !run?.id) return
    const started = new Date(run.created_at).getTime()
    pollRef.current = setInterval(async () => {
      const { data } = await supabase.from('ai_runs').select('*').eq('id', run.id).maybeSingle()
      if (data?.status === 'done' || data?.status === 'failed') {
        clearInterval(pollRef.current)
        setRun(data)
        if (data.status === 'failed') {
          setAiNotice(`Автоматичната обработка не успя (${data.error}). Страницата се прави и без нея — подредете снимките и напишете описание ръчно.`)
        }
        enterReview(data.status === 'done' ? data.result : null)
      } else if (Date.now() - started > POLL_TIMEOUT_MS) {
        clearInterval(pollRef.current)
        setAiNotice('Автоматичната обработка се бави твърде дълго. Продължете ръчно — ако резултатът дойде по-късно, ще го видите при следващо отваряне.')
        enterReview(null)
      }
    }, POLL_MS)
    return () => clearInterval(pollRef.current)
  }, [step, run?.id])

  // ---------------------------------------------------------------- преглед
  const enterReview = async (result) => {
    const fresh = await fetchPhotos(id).catch(() => photos)
    setPhotos(fresh)
    let order = fresh
    if (result?.order?.length) {
      const byId = new Map(fresh.map((p) => [p.id, p]))
      const fromAi = result.order.map((pid) => byId.get(pid)).filter(Boolean)
      order = [...fromAi, ...fresh.filter((p) => !result.order.includes(p.id))]
    } else if (property?.cover_image_url) {
      const cover = fresh.find((p) => p.photo_url === property.cover_image_url)
      if (cover) order = [cover, ...fresh.filter((p) => p !== cover)]
    }
    setOrdered(order)
    setAmenities(property?.amenities ?? [])
    setDescBg(property?.public_description || result?.description_bg || '')
    setDescEn(property?.public_description_en || result?.description_en || '')
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
  }
  const toggleAmenity = (key) =>
    setAmenities((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))

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

  // ---------------------------------------------------------------- UI
  if (loading) return <Spinner />
  if (!property) return <Alert>{error}</Alert>

  const runsLeft = Math.max(0, DAILY_RUNS - runsToday)
  const suggested = suggestion?.amenities ?? []
  const publicUrl = property.slug ? `${appOrigin()}/stay/${property.slug}` : null

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        to={`/properties/${id}`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" />
        {property.name}
      </Link>

      <PageHeader
        icon={Sparkles}
        title="Страницата за гости"
        description={
          step === 'photos'
            ? 'Стъпка 2 от 3 — качете 5 до 30 снимки. После ги подреждаме и пишем чернова на описание.'
            : step === 'processing'
              ? 'Подреждаме снимките…'
              : 'Стъпка 3 от 3 — прегледайте, поправете каквото искате и публикувайте.'
        }
      />

      <div className="mt-6 space-y-5">
        {error && <Alert>{error}</Alert>}
        {aiNotice && <Alert kind="warning">{aiNotice}</Alert>}

        {step === 'photos' && (
          <>
            <PropertyPhotosManager
              property={property}
              userId={user?.id}
              onPhotosChanged={setPhotos}
              onCoverChanged={(url) => setProperty((p) => ({ ...p, cover_image_url: url }))}
              onUploaded={(fresh) => {
                // Автоматично само при ПЪРВОТО качване на 5+ снимки. Всяка следваща
                // обработка струва пари и е ръчна (бутонът по-долу).
                if (!everRan && fresh.length >= MIN_PHOTOS_FOR_AI && runsLeft > 0) startAi(fresh)
              }}
            />
            <Card className="space-y-3 p-5">
              <p className="text-sm text-slate-600">
                {photos.length < MIN_PHOTOS_FOR_AI
                  ? `Качете поне ${MIN_PHOTOS_FOR_AI} снимки (имате ${photos.length}) — после автоматично ги подреждаме като в Airbnb, предлагаме удобства, които се виждат, и пишем чернова на описание.`
                  : `Автоматичната обработка подрежда снимките, предлага видимите удобства и пише чернова BG/EN. Нищо не се публикува без вас. Остават ${runsLeft} от ${DAILY_RUNS} за днес.`}
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={() => startAi()}
                  disabled={photos.length < MIN_PHOTOS_FOR_AI || runsLeft === 0}
                >
                  <Sparkles className="h-4 w-4" />
                  Подреди и опиши автоматично
                </Button>
                <Button variant="secondary" onClick={() => enterReview(suggestion)} disabled={photos.length === 0}>
                  Продължи ръчно
                </Button>
              </div>
            </Card>
          </>
        )}

        {step === 'processing' && (
          <Card className="flex flex-col items-center gap-3 p-10 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
            <p className="font-semibold text-slate-800">Разглеждаме снимките…</p>
            <p className="max-w-sm text-sm text-slate-500">
              Разпознаваме стаите, избираме корица и пишем чернова. Обикновено отнема под минута —
              може да оставите телефона, резултатът се пази.
            </p>
            <Button variant="secondary" onClick={() => { clearInterval(pollRef.current); enterReview(null) }}>
              Не чакай — продължи ръчно
            </Button>
          </Card>
        )}

        {step === 'review' && (
          <>
            {suggestion && run?.cost_usd != null && (
              <p className="text-xs text-slate-400">
                Автоматичната обработка на {run.photo_count} снимки струваше ${Number(run.cost_usd).toFixed(3)} (
                {run.input_tokens?.toLocaleString('bg-BG')} входни + {run.output_tokens?.toLocaleString('bg-BG')} изходни токена).
              </p>
            )}

            <Card className="p-5">
              <h2 className="text-sm font-semibold text-slate-700">Ред на снимките</h2>
              <p className="mt-1 text-xs text-slate-400">
                {suggestion ? 'Предложен ред: корица, дневна → спални → кухня → баня → тераса/гледка → отвън.' : 'Първата снимка е корицата.'}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {ordered.map((p, i) => (
                  <div key={p.id} className={`relative overflow-hidden rounded-xl border ${i === 0 ? 'border-brand-500 ring-2 ring-brand-200' : 'border-slate-200'}`}>
                    <img src={p.thumb_url || p.photo_url} alt="" className="aspect-square w-full object-cover" />
                    <div className="absolute inset-x-0 top-0 flex justify-between p-1.5">
                      <div className="flex gap-1">
                        <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded-lg bg-slate-900/60 p-1 text-white disabled:opacity-30" aria-label="Наляво">
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => move(i, 1)} disabled={i === ordered.length - 1} className="rounded-lg bg-slate-900/60 p-1 text-white disabled:opacity-30" aria-label="Надясно">
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {suggestion?.rooms?.[p.id] && (
                        <span className="rounded-md bg-white/90 px-1.5 py-0.5 text-[11px] font-medium text-slate-700">
                          {ROOM_LABELS[suggestion.rooms[p.id]]}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => makeCover(i)}
                      className={`absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs font-medium shadow ${i === 0 ? 'bg-brand-600 text-white' : 'bg-white/90 text-slate-600'}`}
                    >
                      <Star className={`h-3 w-3 ${i === 0 ? 'fill-white' : ''}`} />
                      {i === 0 ? 'Корица' : 'Корица'}
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setStep('photos')} className="mt-3 text-xs font-semibold text-brand-600">
                Добави или изтрий снимки
              </button>
            </Card>

            <Card className="p-5">
              <h2 className="text-sm font-semibold text-slate-700">Удобства</h2>
              <p className="mt-1 text-xs text-slate-400">
                {suggested.length
                  ? 'С „видяно“ са отбелязани неща, които разпознахме на снимките — отметнете ги само ако са верни.'
                  : 'Отметнете какво има в имота.'}
              </p>
              {suggested.some((k) => !amenities.includes(k)) && (
                <button
                  type="button"
                  onClick={() => setAmenities((prev) => [...new Set([...prev, ...suggested])])}
                  className="mt-2 text-xs font-semibold text-brand-600"
                >
                  Отметни всички видени ({suggested.length})
                </button>
              )}
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {AMENITIES.map((a) => (
                  <label key={a.key} className="flex items-center gap-2 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      checked={amenities.includes(a.key)}
                      onChange={() => toggleAmenity(a.key)}
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    {a.label}
                    {suggested.includes(a.key) && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">видяно</span>
                    )}
                  </label>
                ))}
              </div>
            </Card>

            <Card className="space-y-4 p-5">
              <div>
                <h2 className="text-sm font-semibold text-slate-700">Описание</h2>
                <p className="mt-1 text-xs text-slate-400">
                  {suggestion ? 'Чернова по снимките — прочетете я и поправете. Пише само това, което се вижда.' : 'Няколко изречения за гостите.'}
                </p>
              </div>
              <Field label="На български">
                <Textarea rows={5} value={descBg} onChange={(e) => setDescBg(e.target.value)} />
              </Field>
              <Field label="На английски (по избор)">
                <Textarea rows={5} value={descEn} onChange={(e) => setDescEn(e.target.value)} />
              </Field>
              {suggestion && property.public_description && descBg === property.public_description && (
                <button
                  type="button"
                  onClick={() => {
                    setDescBg(suggestion.description_bg)
                    setDescEn(suggestion.description_en)
                  }}
                  className="text-xs font-semibold text-brand-600"
                >
                  Замени с черновата от снимките
                </button>
              )}
            </Card>

            <Card className="p-5">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <Palette className="h-4 w-4 text-slate-400" />
                Цвят на страницата
              </h2>
              <div className="mt-3 flex items-center gap-3">
                <span
                  className="h-10 w-10 shrink-0 rounded-xl border border-slate-200"
                  style={{ background: useAccent && accent ? accent : '#1b787c' }}
                />
                <p className="text-sm text-slate-600">
                  {accent
                    ? useAccent
                      ? 'Взет от корицата и потъмнен, ако трябва, за да се чете белият текст на бутоните.'
                      : 'Стандартният цвят на StayFlow.'
                    : 'Корицата е почти безцветна — ползваме стандартния цвят.'}
                </p>
              </div>
              {accent && (
                <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" checked={useAccent} onChange={(e) => setUseAccent(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                  Използвай цвета от корицата
                </label>
              )}
            </Card>

            {savedMsg && <Alert kind="success">{savedMsg}</Alert>}
            {published && publicUrl && (
              <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <code className="flex-1 truncate text-slate-700">{publicUrl}</code>
                <button type="button" onClick={() => navigator.clipboard?.writeText(publicUrl)} className="text-slate-400 hover:text-slate-700" aria-label="Копирай линка">
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            )}

            <div className="sticky bottom-0 -mx-4 flex flex-wrap gap-3 border-t border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
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
