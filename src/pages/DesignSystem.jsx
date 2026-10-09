import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  CalendarDays,
  Inbox,
  KeyRound,
  Plus,
  Trash2,
  Pencil,
  Bell,
  TrendingUp,
  Palette,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import { contrastRatio } from '../lib/accentColor'
import pairs from '../../scripts/token-pairs.json'
import {
  Alert,
  Badge,
  BackLink,
  LoadingCard,
  PageHeader,
  PageSkeleton,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  Radio,
  Segmented,
  Select,
  Skeleton,
  Spinner,
  Stat,
  Switch,
  Table,
  Td,
  Textarea,
  Th,
} from '../components/ui'

/* -------------------------------------------------------------------------- */
/* Помощници                                                                  */
/* -------------------------------------------------------------------------- */

// Състоянията имат по четири роли: плътен цвят, мек фон, текст върху мекия фон, линия.
const STATES = {
  Акцент: ['accent', ['', '-hover', '-press', '-soft', '-soft-hover', '-ink']],
  Успех: ['success', ['', '-soft', '-ink', '-line']],
  Внимание: ['warning', ['', '-soft', '-ink', '-line']],
  Грешка: ['danger', ['', '-hover', '-soft', '-ink', '-line']],
  Информация: ['info', ['', '-soft', '-ink', '-line']],
  'Графики и източници': ['', ['chart-1', 'chart-2', 'src-airbnb', 'src-booking', 'src-direct']],
}
const stateRoles = (base, parts) => (base ? parts.map((p) => base + p) : parts)

const ROLES = [
  ['surface', 'Фон на страницата'],
  ['card', 'Карти, полета, менюта'],
  ['sunken', 'Вдълбнати зони'],
  ['line', 'Тънки разделители'],
  ['line-strong', 'Граница на контроли'],
  ['ink', 'Основен текст'],
  ['ink-soft', 'Второстепенен текст'],
  ['ink-muted', 'Подсказки'],
  ['accent', 'Основно действие'],
  ['accent-soft', 'Мек акцент (фон)'],
  ['success', 'Успех'],
  ['danger', 'Грешка'],
]

// [текст, фон, минимум, описание] — единен списък, ползван и от scripts/test-design.mjs
const PAIRS = pairs

const RADII = { sm: 'rounded-sm', md: 'rounded-md', lg: 'rounded-lg', xl: 'rounded-xl', '2xl': 'rounded-2xl', '3xl': 'rounded-3xl' }
const SHADOWS = { xs: 'shadow-xs', sm: 'shadow-sm', md: 'shadow-md', lg: 'shadow-lg', card: 'shadow-card', pop: 'shadow-pop' }

// Браузърът връща #fff вместо #ffffff — разгъваме краткия запис, за да може да се смята контраст.
const normHex = (v) => (/^#[0-9a-f]{3}$/i.test(v) ? '#' + [...v.slice(1)].map((c) => c + c).join('') : v)
const read = (name) => normHex(getComputedStyle(document.documentElement).getPropertyValue(`--color-${name}`).trim())

function useTokenValues(names) {
  const [vals, setVals] = useState({})
  useEffect(() => {
    // Чете реалните (изчислените) стойности от CSS — витрината не държи копие.
    setVals(Object.fromEntries(names.map((n) => [n, read(n)])))
  }, [names])
  return vals
}

function Section({ id, title, kicker, children }) {
  return (
    <section id={id} className="scroll-mt-24 py-10 sm:py-14">
      {kicker && <p className="mb-1 text-sm font-semibold text-accent-ink">{kicker}</p>}
      <h2 className="type-title mb-6">{title}</h2>
      <div className="space-y-8">{children}</div>
    </section>
  )
}

const Sub = ({ children }) => <h3 className="type-heading mb-3">{children}</h3>

function Demo({ label, children, className = '' }) {
  return (
    <div>
      {label && <p className="type-label mb-2 text-ink-soft">{label}</p>}
      <div className={className}>{children}</div>
    </div>
  )
}

function Swatch({ name, value, light, desc }) {
  return (
    <div className="min-w-0">
      <div className="h-14 rounded-lg shadow-card" style={{ background: `var(--color-${name})` }} />
      <p className="mt-1.5 truncate text-xs font-semibold">{light ?? name}</p>
      {desc && <p className="text-xs leading-snug text-ink-soft">{desc}</p>}
      <p className="truncate text-xs text-ink-muted num">{value || '…'}</p>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Страницата                                                                 */
/* -------------------------------------------------------------------------- */

const NAV = [
  ['colors', 'Цветове'],
  ['type', 'Типография'],
  ['shape', 'Форма и движение'],
  ['components', 'Компоненти'],
  ['access', 'Достъпност'],
]

export default function DesignSystem() {
  const [modal, setModal] = useState(false)
  const [period, setPeriod] = useState('month')
  const [shown, setShown] = useState(true)
  const [measure, setMeasure] = useState(null)
  const componentsRef = useRef(null)

  useEffect(() => {
    document.title = 'Дизайн система | StayFlow'
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex'
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])

  const roleNames = useMemo(() => ROLES.map(([n]) => n), [])
  const roleVals = useTokenValues(roleNames)
  const pairNames = useMemo(() => [...new Set(PAIRS.flatMap(([a, b]) => [a, b]))], [])
  const pairVals = useTokenValues(pairNames)
  const stateNames = useMemo(() => Object.values(STATES).flatMap(([base, parts]) => stateRoles(base, parts)), [])
  const stateVals = useTokenValues(stateNames)

  const results = useMemo(
    () =>
      PAIRS.map(([fg, bg, min, label]) => {
        const a = pairVals[fg]
        const b = pairVals[bg]
        const ratio = a && b && /^#[0-9a-f]{6}$/i.test(a) && /^#[0-9a-f]{6}$/i.test(b) ? contrastRatio(a, b) : null
        return { fg, bg, min, label, ratio }
      }),
    [pairVals]
  )
  const passed = results.filter((r) => r.ratio && r.ratio >= r.min).length

  // Измерва реалния размер на контролите в тази страница (за пръст ≥ 44 px).
  useEffect(() => {
    const root = componentsRef.current
    if (!root) return
    // „sm“ елементите (малък бутон, сегментиран избор) са 36 px само при мишка; на тъч са 44 px.
    const touch = [...root.querySelectorAll('.btn:not(.btn-sm), .control, .icon-btn, .check')].filter((el) => el.offsetParent !== null)
    const smalls = [...root.querySelectorAll('.btn-sm, .segmented button')].filter((el) => el.offsetParent !== null)
    const minOf = (els, key) => (els.length ? Math.round(Math.min(...els.map((el) => el.getBoundingClientRect()[key]))) : null)
    setMeasure({ count: touch.length, minH: minOf(touch, 'height'), smallH: minOf(smalls, 'height') })
  }, [period])

  return (
    <div className="min-h-dvh bg-surface text-ink">
      <a href="#colors" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-ink focus:px-4 focus:py-2 focus:text-card">
        Към съдържанието
      </a>

      <header className="sticky top-0 z-20 border-b border-line bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 sm:flex-nowrap sm:px-6 sm:py-2.5">
          <Link to="/" className="icon-btn -ml-2" aria-label="Към приложението">
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </Link>
          <div className="mr-auto min-w-0">
            <p className="truncate text-sm font-bold leading-tight">StayFlow · Дизайн система</p>
            <p className="hidden text-xs text-ink-muted sm:block">Токени и компоненти — един източник на истина</p>
          </div>
          <nav aria-label="Раздели" className="-mx-2 order-last flex w-full gap-1 overflow-x-auto sm:order-none sm:mx-0 sm:-mr-2 sm:w-auto">
            {NAV.map(([id, label]) => (
              <a key={id} href={`#${id}`} className="btn btn-ghost btn-sm shrink-0">
                {label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* ----------------------------------------------------------- увод */}
        <div className="pt-10 sm:pt-14">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-accent-ink">
            <Palette className="h-4 w-4" aria-hidden="true" /> Стъпка 1 от 5
          </p>
          <h1 className="type-display max-w-3xl">Дизайн система на StayFlow</h1>
          <p className="mt-3 max-w-2xl text-ink-soft">
            Посока „Златен час“: топъл крем, мек теракот и големи карти. <strong className="font-semibold text-ink">Приложението</strong> (табло, календар,
            резервации, приходи) е чисто, бързо и удобно за пръст — само фино движение (120 / 180 / 280 ms). <strong className="font-semibold text-ink">Публичните страници</strong>{' '}
            (/stay/…) са кинематографични. Тази страница показва живите токени и компонентите на приложението.
          </p>
        </div>

        {/* --------------------------------------------------------- цветове */}
        <Section id="colors" kicker="01" title="Цветове">
          <Card padded>
            <Sub>Роли</Sub>
            <p className="mb-4 max-w-2xl text-sm text-ink-soft">
              Екраните четат ролите (bg-card, text-ink-soft, border-line), не суровите цветове. Сменя се на едно място — в tokens.css.
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4 lg:grid-cols-6">
              {ROLES.map(([name, label]) => (
                <Swatch key={name} name={name} value={roleVals[name]} desc={label} />
              ))}
            </div>
          </Card>

          <Card padded>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <Sub>Контраст на текста (WCAG AA)</Sub>
              <Badge tone={passed === results.length ? 'success' : 'danger'} dot>
                {passed} от {results.length} двойки минават
              </Badge>
            </div>
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Таблица с контрастите (скролира се хоризонтално)">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="text-left text-ink-soft">
                    <th className="pb-2 pr-3 font-semibold">Двойка</th>
                    <th className="pb-2 pr-3 font-semibold">Образец</th>
                    <th className="pb-2 pr-3 text-right font-semibold">Контраст</th>
                    <th className="pb-2 text-right font-semibold">Изискване</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => {
                    const ok = r.ratio && r.ratio >= r.min
                    return (
                      <tr key={`${r.fg}-${r.bg}`} className="border-t border-line">
                        <td className="py-2.5 pr-3">{r.label}</td>
                        <td className="py-2.5 pr-3">
                          {r.min < 4.5 ? (
                            <span className="inline-block h-6 w-14 rounded-md" style={{ background: `var(--color-${r.bg})`, border: `2px solid var(--color-${r.fg})` }} aria-hidden="true" />
                          ) : (
                            <span
                              className="inline-block rounded-md px-2.5 py-1 text-xs font-semibold"
                              style={{ color: `var(--color-${r.fg})`, background: `var(--color-${r.bg})`, boxShadow: 'inset 0 0 0 1px rgb(90 55 20 / 0.14)' }}
                            >
                              Аа 123
                            </span>
                          )}
                        </td>
                        <td className="num py-2.5 pr-3 text-right font-semibold">{r.ratio ? `${r.ratio.toFixed(2)}:1` : '…'}</td>
                        <td className="py-2.5 text-right">
                          <span className="inline-flex items-center gap-1.5">
                            ≥ {r.min}:1
                            {r.ratio ? (
                              ok ? <CheckCircle2 className="h-4 w-4 text-success" aria-label="минава" /> : <XCircle className="h-4 w-4 text-danger" aria-label="не минава" />
                            ) : null}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {Object.entries(STATES).map(([title, [base, parts]]) => (
            <Card padded key={title}>
              <Sub>{title}</Sub>
              <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
                {stateRoles(base, parts).map((name) => (
                  <Swatch key={name} name={name} value={stateVals[name]} light={name} />
                ))}
              </div>
            </Card>
          ))}
        </Section>

        {/* ------------------------------------------------------ типография */}
        <Section id="type" kicker="02" title="Типография">
          <Card padded>
            <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
              <div className="space-y-5">
                <p className="text-sm text-ink-soft">
                  <strong className="font-semibold text-ink">Onest</strong> — интерфейсът: самохостван променлив шрифт с кирилица (400–800) и обичайните български форми на
                  буквите за ясно четене в малък текст. <strong className="font-semibold text-ink">Literata</strong> — само заглавията и големите числа (като „Печалба“).
                  Цифрите в таблиците са равноширочни — сумите се подреждат една под друга.
                </p>
                <div className="space-y-4">
                  <div>
                    <p className="type-caption text-ink-muted">type-display · 32–48 px · 600 · Literata</p>
                    <p className="type-display">Приходи октомври</p>
                  </div>
                  <div>
                    <p className="type-caption text-ink-muted">type-title · 22–28 px · 600 · Literata</p>
                    <p className="type-title">Настанявания и напускания</p>
                  </div>
                  <div>
                    <p className="type-caption text-ink-muted">type-heading · 18 px · 600 · Literata</p>
                    <p className="type-heading">Предстоящи резервации</p>
                  </div>
                  <div>
                    <p className="type-caption text-ink-muted">type-body · 16 px · 400</p>
                    <p className="type-body max-w-prose">Гостите пристигат между 14:00 и 20:00. Кодът за достъп се изпраща в деня на настаняване.</p>
                  </div>
                  <div>
                    <p className="type-caption text-ink-muted">type-small · 14 px · 400</p>
                    <p className="type-small text-ink-soft">Комисионата се смята върху цената без такса почистване.</p>
                  </div>
                  <div>
                    <p className="type-caption text-ink-muted">type-label · 13 px · 600</p>
                    <p className="type-label">Дата на настаняване</p>
                  </div>
                </div>
                <div>
                  <p className="type-caption mb-2 text-ink-muted">Тежести 400 · 500 · 600 · 700 · 800</p>
                  <p className="text-xl">
                    <span className="font-normal">Резервация </span>
                    <span className="font-medium">Резервация </span>
                    <span className="font-semibold">Резервация </span>
                    <span className="font-bold">Резервация </span>
                    <span className="font-extrabold">Резервация</span>
                  </p>
                  <p className="mt-2 text-lg tracking-wide text-ink-soft [overflow-wrap:anywhere]">АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЬЮЯ абвгдежзийклмнопрстуфхцчшщъьюя № €</p>
                </div>
              </div>

              <div>
                <p className="type-label mb-2 text-ink-soft">Таблични цифри (по подразбиране в таблици)</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-xl bg-sunken p-4">
                    <p className="type-caption mb-2 text-ink-muted">tabular-nums</p>
                    <p className="num text-right text-lg font-semibold leading-snug">
                      1 111,11 €
                      <br />
                      8 888,88 €
                      <br />
                      12 345,67 €
                    </p>
                  </div>
                  <div className="rounded-xl bg-sunken p-4">
                    <p className="type-caption mb-2 text-ink-muted">пропорционални</p>
                    <p className="text-right text-lg font-semibold leading-snug" style={{ fontVariantNumeric: 'proportional-nums' }}>
                      1 111,11 €
                      <br />
                      8 888,88 €
                      <br />
                      12 345,67 €
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </Section>

        {/* ------------------------------------------------ форма и движение */}
        <Section id="shape" kicker="03" title="Форма, дълбочина и движение">
          <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
            <Card padded>
              <Sub>Радиуси</Sub>
              <div className="grid grid-cols-3 gap-4 sm:grid-cols-6 lg:grid-cols-3 xl:grid-cols-6">
                {Object.entries(RADII).map(([r, cls]) => (
                  <div key={r} className="text-center">
                    <div className={`mx-auto h-14 w-14 border-2 border-accent bg-accent-soft ${cls}`} />
                    <p className="mt-1.5 text-xs font-semibold">{r}</p>
                  </div>
                ))}
              </div>
            </Card>
            <Card padded>
              <Sub>Сенки (топли, светлина отгоре)</Sub>
              <div className="grid grid-cols-3 gap-4 bg-surface p-3">
                {Object.entries(SHADOWS).map(([s, cls]) => (
                  <div key={s} className="text-center">
                    <div className={`mx-auto h-14 w-full rounded-lg bg-card ${cls}`} />
                    <p className="mt-1.5 text-xs font-semibold">{s}</p>
                  </div>
                ))}
              </div>
            </Card>
            <Card padded>
              <Sub>Разстояния (4 px основа)</Sub>
              <div className="space-y-2">
                {[1, 2, 3, 4, 6, 8, 12, 16].map((n) => (
                  <div key={n} className="flex items-center gap-3 text-xs">
                    <span className="num w-20 shrink-0 text-ink-soft">
                      {n * 4} px · {n}
                    </span>
                    <span className="h-3 rounded-sm bg-accent" style={{ width: `${n * 4}px` }} />
                  </div>
                ))}
              </div>
            </Card>
            <Card padded>
              <Sub>Движение — 120 / 180 / 280 ms, само opacity и transform</Sub>
              <div className="flex flex-wrap items-center gap-4">
                <Button variant="secondary" onClick={() => setShown((v) => !v)}>
                  {shown ? 'Скрий' : 'Покажи'}
                </Button>
                <div
                  className="rounded-xl bg-accent-soft px-4 py-3 text-sm font-semibold text-accent-ink"
                  style={{
                    opacity: shown ? 1 : 0,
                    transform: shown ? 'none' : 'translateY(6px) scale(0.97)',
                    transition: `opacity var(--duration-slow) var(--ease-out), transform var(--duration-slow) var(--ease-out)`,
                  }}
                >
                  Появява се с ease-out
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                {[
                  ['fast', '120 ms', 'натискане'],
                  ['base', '180 ms', 'цвят, фокус, екрани'],
                  ['slow', '280 ms', 'панели, графика'],
                ].map(([k, v, d]) => (
                  <div key={k} className="rounded-lg bg-sunken p-3">
                    <dt className="type-label">{k}</dt>
                    <dd className="num font-semibold">{v}</dd>
                    <dd className="text-xs text-ink-muted">{d}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-xs text-ink-muted">При „намалено движение“ в системата всички преходи се изключват. Вход: cubic-bezier(0.23, 1, 0.32, 1); изход: cubic-bezier(0.4, 0, 1, 1). Бутоните при натискане: scale(0.98).</p>
            </Card>
          </div>
        </Section>

        {/* ------------------------------------------------------ компоненти */}
        <Section id="components" kicker="04" title="Компоненти">
          <div ref={componentsRef} className="space-y-6">
            <Card padded>
              <Sub>Бутони</Sub>
              <div className="space-y-5">
                <Demo label="Видове — основно действие е само едно на екран">
                  <div className="flex flex-wrap gap-3">
                    <Button>Запази</Button>
                    <Button variant="secondary">Отказ</Button>
                    <Button variant="soft">Нова резервация</Button>
                    <Button variant="ghost">По-късно</Button>
                    <Button variant="danger">Изтрий</Button>
                    <Button variant="dangerSolid">Изтрий записа</Button>
                    <Button variant="link">Виж всички</Button>
                  </div>
                </Demo>
                <Demo label="Размери — за пръст всички са ≥ 44 px; „sm“ е 36 px само с мишка">
                  <div className="flex flex-wrap items-center gap-3">
                    <Button size="sm">Малък</Button>
                    <Button>Среден</Button>
                    <Button size="lg">Голям</Button>
                    <Button block className="sm:w-auto">
                      <Plus className="h-4 w-4" aria-hidden="true" /> С икона
                    </Button>
                  </div>
                </Demo>
                <Demo label="Състояния">
                  <div className="flex flex-wrap items-center gap-3">
                    <Button disabled>Недостъпен</Button>
                    <Button loading>Записва се</Button>
                    <Button variant="secondary" loading>
                      Изпраща
                    </Button>
                  </div>
                </Demo>
                <Demo label="Бутони само с икона — област за докосване 44×44 px, с етикет за екранен четец">
                  <div className="flex flex-wrap items-center gap-2">
                    <IconButton label="Редакция">
                      <Pencil className="h-5 w-5" aria-hidden="true" />
                    </IconButton>
                    <IconButton label="Известия">
                      <Bell className="h-5 w-5" aria-hidden="true" />
                    </IconButton>
                    <IconButton label="Изтрий" tone="danger">
                      <Trash2 className="h-5 w-5" aria-hidden="true" />
                    </IconButton>
                  </div>
                </Demo>
              </div>
            </Card>

            <Card padded>
              <Sub>Полета</Sub>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Име на госта" required hint="Както е в документа за самоличност.">
                  <Input placeholder="Мария Петрова" autoComplete="off" />
                </Field>
                <Field label="Телефон" error="Въведете поне 8 цифри, например +359 88 712 4093.">
                  <Input invalid defaultValue="088" inputMode="tel" />
                </Field>
                <Field label="Имот">
                  <Select defaultValue="1">
                    <option value="1">Вила „Тихи бряг“</option>
                    <option value="2">Студио „Морски бриз“</option>
                  </Select>
                </Field>
                <Field label="Настаняване">
                  <Input type="date" />
                </Field>
                <Field label="Недостъпно поле">
                  <Input disabled defaultValue="Задава се автоматично" />
                </Field>
                <Field label="Само за четене">
                  <Input readOnly defaultValue="ical.stayflow.bg/…" />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Бележка">
                    <Textarea placeholder="Особености на резервацията" />
                  </Field>
                </div>
              </div>
              <div className="mt-6 grid gap-x-8 sm:grid-cols-2">
                <div>
                  <p className="type-label mb-1 text-ink-soft">Отметки</p>
                  <Checkbox label="Включи такса за почистване" defaultChecked />
                  <Checkbox label="Изпрати потвърждение на гостa" />
                  <Checkbox label="Недостъпна опция" disabled />
                </div>
                <div>
                  <p className="type-label mb-1 text-ink-soft">Избор и превключвател</p>
                  <Radio name="demo-r" label="Плащане по банков път" defaultChecked />
                  <Radio name="demo-r" label="В брой при настаняване" />
                  <Switch label="Известия в Telegram" defaultChecked />
                </div>
              </div>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
              <Card padded>
                <Sub>Значки и избор</Sub>
                <div className="space-y-5">
                  <Demo label="Значки — цветът не е единствен знак, винаги има текст">
                    <div className="flex flex-wrap gap-2">
                      <Badge>Ръчна</Badge>
                      <Badge tone="accent" dot>
                        Потвърдена
                      </Badge>
                      <Badge tone="success" dot>
                        Платена
                      </Badge>
                      <Badge tone="warning" dot>
                        Чака плащане
                      </Badge>
                      <Badge tone="danger" dot>
                        Просрочена
                      </Badge>
                      <Badge tone="info" dot>
                        Airbnb
                      </Badge>
                      <Badge count>3</Badge>
                    </div>
                  </Demo>
                  <Demo label="Сегментиран избор (период)">
                    <Segmented
                      label="Период"
                      value={period}
                      onChange={setPeriod}
                      options={[
                        { value: 'month', label: 'Този месец' },
                        { value: 'year', label: 'Тази година' },
                        { value: 'next', label: 'Следващите 3 месеца' },
                      ]}
                    />
                  </Demo>
                </div>
              </Card>

              <Card padded>
                <Sub>Съобщения</Sub>
                <div className="space-y-3">
                  <Alert kind="error" title="Не успяхме да запазим">
                    Проверете връзката и опитайте отново.
                  </Alert>
                  <Alert kind="warning">8 резервации от платформи чакат цена и комисиона.</Alert>
                  <Alert kind="success">Заявката е приета и добавена в календара.</Alert>
                  <Alert kind="info">Автоматичните записи са оценка по вашите правила.</Alert>
                </div>
              </Card>
            </div>

            <div>
              <Sub>Карти и показатели</Sub>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0">
                <Stat label="Приходи" value="12 345,67 €" hint="октомври 2026" icon={TrendingUp} />
                <Stat label="Нетно" value="10 482,00 €" hint="след комисиони" />
                <Stat label="Заетост" value="78,4 %" hint="41 от 52 нощувки" icon={CalendarDays} />
                <Card padded interactive>
                  <p className="stat-label">Интерактивна карта</p>
                  <p className="mt-2 text-sm text-ink-soft">Леко се повдига с мишка; при докосване — само натискане.</p>
                </Card>
                <Card padded flat>
                  <p className="stat-label">Плоска</p>
                  <p className="mt-2 text-sm text-ink-soft">Без сянка — за вложени зони.</p>
                </Card>
                <Card padded tinted>
                  <p className="stat-label text-accent-ink">С акцент</p>
                  <p className="mt-2 text-sm text-accent-ink">За препоръки и подчертани данни.</p>
                </Card>
              </div>
            </div>

            <div>
              <Sub>Таблица</Sub>
              <Table>
                <thead>
                  <tr>
                    <Th>Гост</Th>
                    <Th>Имот</Th>
                    <Th>Източник</Th>
                    <Th numeric>Нощувки</Th>
                    <Th numeric>Сума</Th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <Td className="font-semibold">Мария Петрова</Td>
                    <Td>Вила „Тихи бряг“</Td>
                    <Td>
                      <Badge tone="success" dot>
                        Директна
                      </Badge>
                    </Td>
                    <Td numeric>4</Td>
                    <Td numeric className="font-semibold">
                      520,00 €
                    </Td>
                  </tr>
                  <tr>
                    <Td className="font-semibold">Anna Schmidt</Td>
                    <Td>Вила „Тихи бряг“</Td>
                    <Td>
                      <Badge tone="danger" dot>
                        Airbnb
                      </Badge>
                    </Td>
                    <Td numeric>3</Td>
                    <Td numeric className="font-semibold">
                      390,00 €
                    </Td>
                  </tr>
                  <tr>
                    <Td className="font-semibold">Peter van Dijk</Td>
                    <Td>Студио „Морски бриз“</Td>
                    <Td>
                      <Badge tone="info" dot>
                        Booking.com
                      </Badge>
                    </Td>
                    <Td numeric>5</Td>
                    <Td numeric className="font-semibold">
                      1 284,50 €
                    </Td>
                  </tr>
                </tbody>
              </Table>
            </div>

            <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
              <EmptyState
                icon={Inbox}
                title="Още няма заявки"
                description="Когато гост изпрати заявка от публичната ви страница, ще я видите тук."
                action={<Button variant="secondary">Към публичната страница</Button>}
              />
              <Card padded>
                <Sub>Зареждане</Sub>
                <div className="space-y-4">
                  <div className="flex items-center gap-3 text-sm text-ink-soft">
                    <Spinner className="py-0" /> Кратък индикатор за действие
                  </div>
                  <div className="space-y-3" aria-hidden="true">
                    <Skeleton className="h-5 w-2/3" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                    <Skeleton className="h-11 w-32" />
                  </div>
                  <p className="text-xs text-ink-muted">Скелетът има формата на съдържанието — вместо въртящ се кръг върху целия екран.</p>
                </div>
              </Card>
            </div>

            <Card padded>
              <Sub>Прозорец</Sub>
              <p className="mb-4 text-sm text-ink-soft">На телефон е долен лист, на голям екран — центриран прозорец. Esc и клик извън го затварят; фокусът влиза вътре и се връща.</p>
              <Button variant="secondary" onClick={() => setModal(true)}>
                <KeyRound className="h-4 w-4" aria-hidden="true" /> Отвори прозорец
              </Button>
              <Modal
                open={modal}
                onClose={() => setModal(false)}
                title="Изтриване на запис"
                description="Записът ще бъде премахнат от Приходи. Действието не може да се върне."
                footer={
                  <>
                    <Button variant="secondary" onClick={() => setModal(false)}>
                      Отказ
                    </Button>
                    <Button variant="dangerSolid" onClick={() => setModal(false)}>
                      Изтрий записа
                    </Button>
                  </>
                }
              >
                <Field label="Причина (по избор)">
                  <Input placeholder="Например: дублиран запис" />
                </Field>
              </Modal>
            </Card>
          <Card padded>
            <Sub>Скелет на екран</Sub>
            <p className="mb-4 max-w-2xl text-sm text-ink-soft">
              Всеки екран е един и същ скелет: „назад“ (само във вложени екрани), надзаглавие, заглавие, описание и действие; после съдържание в карти.
              Празното състояние казва какво липсва и какво да се направи; зареждането е скелет с формата на съдържанието, а лентата и менюто остават на мястото си.
            </p>
            <div className="space-y-6 rounded-2xl bg-sunken p-4 sm:p-6">
              <div>
                <BackLink to="/design">Всички имоти</BackLink>
                <PageHeader eyebrow="Настройки" title="Поддръжка на имоти" description="Всички имоти, които управлявате." action={<Button>Добави имот</Button>} />
              </div>
              <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
                <div className="card">
                  <EmptyState compact icon={Inbox} title="Още няма заявки" description="Когато гост изпрати заявка, ще я видите тук." />
                </div>
                <LoadingCard rows={3} />
              </div>
              <div>
                <p className="type-label mb-2 text-ink-soft">Скелет на цял екран (докато се зарежда частта на екрана)</p>
                <div className="rounded-2xl bg-surface p-5"><PageSkeleton /></div>
              </div>
            </div>
          </Card>
          </div>
        </Section>

        {/* ------------------------------------------------------ достъпност */}
        <Section id="access" kicker="05" title="Достъпност — какво гарантира системата">
          <Card padded>
            <ul className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {[
                ['Контраст', `${passed} от ${results.length} двойки текст/фон минават изискването (≥ 4.5:1 за текст, ≥ 3:1 за граници и фокус). Проверява се автоматично от scripts/test-design.mjs.`],
                [
                  'Размер за пръст',
                  measure
                    ? `Най-малкият от ${measure.count} основни контрола на тази страница е ${measure.minH} px висок${measure.smallH && measure.smallH < 44 ? `; малките (sm) са ${measure.smallH} px — само при мишка, на тъч са 44 px` : ''}.`
                    : 'Измерва се…',
                ],
                ['Фокус', 'Видим контур 2 px за клавиатура навсякъде; полетата имат и мек ореол. Контурът никога не се маха.'],
                ['Намалено движение', 'При prefers-reduced-motion всички преходи и анимации се изключват; въртящият се индикатор само забавя ход.'],
                ['Полета', 'Видим етикет, подсказка и грешка под полето (role="alert"); шрифт 16 px — iOS не увеличава при фокус; граница ≥ 3:1.'],
                ['Прозорци', 'role="dialog", заглавие за екранен четец, Esc, капан за Tab, връщане на фокуса, без скрол на страницата отзад.'],
              ].map(([t, d]) => (
                <li key={t}>
                  <p className="type-label">{t}</p>
                  <p className="mt-1 text-sm text-ink-soft">{d}</p>
                </li>
              ))}
            </ul>
          </Card>
        </Section>

        <footer className="border-t border-line py-8 text-sm text-ink-muted">
          Токените са в <code className="rounded bg-sunken px-1.5 py-0.5 text-xs text-ink">src/styles/tokens.css</code>, компонентите в{' '}
          <code className="rounded bg-sunken px-1.5 py-0.5 text-xs text-ink">src/components/ui.jsx</code>.
        </footer>
      </main>
    </div>
  )
}
