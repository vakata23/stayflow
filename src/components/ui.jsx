import { forwardRef, useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, X, AlertCircle, AlertTriangle, CheckCircle2, Info, ArrowLeft } from 'lucide-react'

/**
 * Общи компоненти на приложението. Стиловете са в src/styles/components.css и
 * четат само токените от src/styles/tokens.css; витрината е на /design.
 * Съществуващите имена и props (Field, Input, Select, Button, Alert, PageHeader,
 * Card, EmptyState, Spinner, Modal) са запазени — екраните не се променят.
 */

import { DURATION, prefersReducedMotion } from '../lib/motion'

export const cx = (...parts) => parts.filter(Boolean).join(' ')

/* ------------------------------------------------------------------ полета */

export function Field({ label, hint, error, required, children }) {
  return (
    <label className="field">
      {label && (
        <span className="field-label">
          {label}
          {required && (
            <span className="field-req" aria-hidden="true">
              *
            </span>
          )}
        </span>
      )}
      {children}
      {error ? (
        <span className="field-error" role="alert">
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </span>
      ) : (
        hint && <span className="field-hint">{hint}</span>
      )}
    </label>
  )
}

const invalidProps = (invalid, props) => (invalid || props['aria-invalid'] ? { 'aria-invalid': true } : {})

export const Input = forwardRef(function Input({ className = '', invalid, ...props }, ref) {
  return <input ref={ref} {...props} {...invalidProps(invalid, props)} className={cx('control', className)} />
})

export const Textarea = forwardRef(function Textarea({ className = '', rows = 4, invalid, ...props }, ref) {
  return <textarea ref={ref} {...props} {...invalidProps(invalid, props)} rows={rows} className={cx('control', className)} />
})

export const Select = forwardRef(function Select({ className = '', invalid, children, ...props }, ref) {
  return (
    <select ref={ref} {...props} {...invalidProps(invalid, props)} className={cx('control', className)}>
      {children}
    </select>
  )
})

/** Отметка; целият ред е ≥ 44 px висок. */
export function Checkbox({ label, className = '', ...props }) {
  return (
    <label className={cx('check', className)}>
      <input type="checkbox" {...props} />
      {label && <span>{label}</span>}
    </label>
  )
}

export function Radio({ label, className = '', ...props }) {
  return (
    <label className={cx('check', className)}>
      <input type="radio" {...props} />
      {label && <span>{label}</span>}
    </label>
  )
}

/** Превключвател (включено/изключено); ползва native checkbox с role=switch. */
export function Switch({ label, className = '', ...props }) {
  return (
    <label className={cx('check switch', className)}>
      <input type="checkbox" role="switch" {...props} />
      {label && <span>{label}</span>}
    </label>
  )
}

/* ----------------------------------------------------------------- бутони */

const BUTTON_VARIANTS = {
  primary: '',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  soft: 'btn-soft',
  danger: 'btn-danger',
  dangerSolid: 'btn-danger-solid',
  link: 'btn-link',
}

export const Button = forwardRef(function Button(
  { loading, variant = 'primary', size = 'md', block, className = '', children, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      {...props}
      disabled={loading || props.disabled}
      aria-busy={loading || undefined}
      className={cx('btn', BUTTON_VARIANTS[variant], size === 'sm' && 'btn-sm', size === 'lg' && 'btn-lg', block && 'btn-block', className)}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  )
})

/** Бутон само с иконка: aria-label е задължителен; областта за докосване е ≥ 44×44 px. */
export const IconButton = forwardRef(function IconButton({ label, tone, className = '', children, ...props }, ref) {
  return (
    <button ref={ref} type="button" aria-label={label} title={props.title ?? label} {...props} className={cx('icon-btn', tone === 'danger' && 'icon-btn-danger', className)}>
      {children}
    </button>
  )
})

/* ------------------------------------------------------ съобщения и значки */

const ALERT_ICONS = { error: AlertCircle, warning: AlertTriangle, success: CheckCircle2, info: Info }

export function Alert({ kind = 'error', title, children, className = '' }) {
  const Icon = ALERT_ICONS[kind] ?? AlertCircle
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={cx('alert', `alert-${kind}`, className)}>
      <Icon aria-hidden="true" />
      <div className="min-w-0">
        {title && <span className="alert-title">{title}</span>}
        {children}
      </div>
    </div>
  )
}

const BADGE_TONES = { neutral: '', accent: 'badge-accent', success: 'badge-success', warning: 'badge-warning', danger: 'badge-danger', info: 'badge-info' }

/** Значка със статус. Цветът никога не е единственият знак — винаги има текст. */
export function Badge({ tone = 'neutral', dot, count, className = '', children }) {
  return <span className={cx('badge', BADGE_TONES[tone], dot && 'badge-dot', count && 'badge-count', className)}>{children}</span>
}

/* ----------------------------------------------------- страница и повърхности */

/** Заглавие на екран: по желание италик „надзаглавие“ в акцент, голямо серифно заглавие, кратко описание, действие вдясно. */
export function PageHeader({ eyebrow, title, description, action }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1.5 font-display text-[1.0625rem] font-medium italic text-accent">{eyebrow}</p>}
        <h1 className="type-display">{title}</h1>
        {description && <p className="mt-2 max-w-[56ch] text-[1.0625rem] leading-relaxed text-ink-soft">{description}</p>}
      </div>
      {action}
    </div>
  )
}

/** Карта. По подразбиране без вътрешен отстъп (както досега); padded добавя стандартния. */
export function Card({ as: Tag = 'div', padded, flat, tinted, interactive, className = '', children, ...props }) {
  return (
    <Tag {...props} className={cx('card', padded && 'card-pad', flat && 'card-flat', tinted && 'card-tinted', interactive && 'card-interactive', className)}>
      {children}
    </Tag>
  )
}

/** Показател (KPI): етикет, голямо число с таблични цифри, подсказка. */
export function Stat({ label, value, hint, icon: Icon, className = '' }) {
  return (
    <Card padded className={className}>
      <div className="flex items-center justify-between gap-2">
        <p className="stat-label">{label}</p>
        {Icon && <Icon className="h-4 w-4 text-ink-muted" aria-hidden="true" />}
      </div>
      <p className="stat-value">{value}</p>
      {hint && <p className="stat-hint">{hint}</p>}
    </Card>
  )
}

/** Празно състояние: икона, какво липсва, какво да се направи. compact — вътре в карта (без собствена повърхност). */
export function EmptyState({ icon: Icon, title, description, action, compact, className = '', titleAs: Title = 'p' }) {
  return (
    <div className={cx('empty', compact && 'empty-compact', className)}>
      {Icon && (
        <div className="empty-icon">
          <Icon className={compact ? 'h-5 w-5' : 'h-7 w-7'} strokeWidth={1.6} aria-hidden="true" />
        </div>
      )}
      <Title className={cx('type-heading', compact ? 'mt-3' : 'mt-4')}>{title}</Title>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-soft">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Spinner({ className = '', label = 'Зареждане' }) {
  return (
    <div role="status" className={cx('flex items-center justify-center py-16', className)}>
      <Loader2 className="h-6 w-6 animate-spin text-accent" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  )
}

/** Скелет със същата форма като съдържанието — вместо въртящ се кръг за целия екран. */
export function Skeleton({ className = '', style }) {
  return <div aria-hidden="true" className={cx('skeleton', className)} style={style} />
}

function SkeletonRows({ rows }) {
  return (
    <div className="space-y-5" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3.5">
          <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="h-3.5 w-14" />
        </div>
      ))}
    </div>
  )
}

/** Зареждане на списък вътре в екран: карта със скелет с формата на редовете (вместо въртящ се кръг). */
export function LoadingCard({ rows = 4, className = '' }) {
  return (
    <div role="status" aria-busy="true" className={cx('card p-5 sm:p-6', className)}>
      <span className="sr-only">Зареждане</span>
      <SkeletonRows rows={rows} />
    </div>
  )
}

/** Зареждане на цял екран: заглавие + карти. Обвивката (лентата, менюто) остава на мястото си. */
export function PageSkeleton() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Зареждане</span>
      <div aria-hidden="true">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-3 h-10 w-64 max-w-full" />
        <Skeleton className="mt-3 h-4 w-80 max-w-full" />
      </div>
      <div className="card mt-8 p-5 sm:mt-10 sm:p-6">
        <SkeletonRows rows={4} />
      </div>
    </div>
  )
}

/** „Назад“ към родителския екран — един и същ вид навсякъде, ≥ 44 px. */
export function BackLink({ to, children }) {
  return (
    <Link to={to} className="-ml-2 mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-ink-soft transition-colors hover:text-ink">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {children}
    </Link>
  )
}

export function Divider({ className = '' }) {
  return <hr className={cx('divider', className)} />
}

/* ---------------------------------------------------------------- таблица */

/** Широките таблици скролират хоризонтално — обвивката е достъпна с клавиатура (Tab, стрелки). */
export function Table({ className = '', label = 'Таблица', children }) {
  return (
    <div className="table-wrap" tabIndex={0} role="region" aria-label={label}>
      <table className={cx('table', className)}>{children}</table>
    </div>
  )
}
export const Th = ({ numeric, className = '', ...props }) => <th scope="col" {...props} className={cx(numeric && 'num', className)} />
export const Td = ({ numeric, className = '', ...props }) => <td {...props} className={cx(numeric && 'num', className)} />

/* --------------------------------------------------------- сегментиран избор */

/** options: [{ value, label }]. Бутоните са aria-pressed; групата има име за екранен четец. */
export function Segmented({ options, value, onChange, label, className = '' }) {
  return (
    <div role="group" aria-label={label} className={cx('segmented', className)}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ прозорец */

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Достъпен прозорец: роля dialog, заглавие за екранен четец, Esc и клик извън
 * го затварят, фокусът влиза вътре, не излиза с Tab и се връща където е бил,
 * страницата отзад не се скролира. На телефон е долен лист, на голям екран —
 * центриран прозорец. size: md (по подразбиране) | lg | xl. variant="sheet" — долен лист на всички размери
 * (меню „Още“). Влиза с плъзгане (280 ms), излиза по-бързо (180 ms, ease-in); при намалено движение — веднага.
 */
export function Modal({ open, onClose, title, description, size = 'md', variant, footer, children }) {
  const panel = useRef(null)
  // Оставаме в DOM-а, докато върви анимацията за затваряне.
  const [present, setPresent] = useState(open)
  useEffect(() => {
    if (open) {
      setPresent(true)
      return undefined
    }
    const t = setTimeout(() => setPresent(false), prefersReducedMotion() ? 0 : DURATION.base)
    return () => clearTimeout(t)
  }, [open])
  const closing = !open && present
  const titleId = useId()
  const descId = useId()
  // onClose обикновено е нова функция при всеки рендер на родителя — държим я в ref,
  // за да не се връща фокусът в прозореца (и да не се нулира скролът) при всяко писане.
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return undefined
    const opener = document.activeElement
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.focus({ preventScroll: true })

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeRef.current?.()
      } else if (e.key === 'Tab' && panel.current) {
        const items = [...panel.current.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null)
        if (items.length === 0) {
          e.preventDefault()
          return
        }
        const first = items[0]
        const last = items[items.length - 1]
        if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      if (opener instanceof HTMLElement) opener.focus({ preventScroll: true })
    }
  }, [open])

  if (!open && !present) return null
  return (
    <div className={cx('modal-root', variant === 'sheet' && 'modal-root-sheet')} data-state={closing ? 'closing' : 'open'} inert={closing ? '' : undefined}>
      <div className="modal-scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cx('modal-panel', size === 'lg' && 'modal-lg', size === 'xl' && 'modal-xl')}
      >
        <div className="modal-head">
          <h2 id={titleId} className="type-heading pt-2.5">
            {title}
          </h2>
          <IconButton label="Затвори" onClick={onClose} className="-mr-2 -mt-1">
            <X className="h-5 w-5" aria-hidden="true" />
          </IconButton>
        </div>
        {description && (
          <p id={descId} className="-mt-1 mb-3 text-sm text-ink-soft">
            {description}
          </p>
        )}
        {children}
        {footer && (
          <div className="modal-foot">
            <div className="flex gap-2 sm:justify-end">{footer}</div>
          </div>
        )}
      </div>
    </div>
  )
}
