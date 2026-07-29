import { Loader2 } from 'lucide-react'

export function Field({ label, hint, required, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  )
}

const controlBase =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-xs outline-none transition-colors placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50 disabled:text-slate-500'

export function Input({ className = '', ...props }) {
  return <input {...props} className={`${controlBase} ${className}`} />
}

export function Textarea({ className = '', rows = 4, ...props }) {
  return <textarea {...props} rows={rows} className={`${controlBase} resize-y ${className}`} />
}

export function Select({ className = '', children, ...props }) {
  return (
    <select {...props} className={`${controlBase} bg-white ${className}`}>
      {children}
    </select>
  )
}

const variants = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700',
  secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
  danger: 'border border-red-200 bg-white text-red-600 hover:bg-red-50',
  dangerSolid: 'bg-red-600 text-white hover:bg-red-700',
}

export function Button({ loading, variant = 'primary', children, className = '', ...props }) {
  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${className}`}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  )
}

export function Alert({ kind = 'error', children }) {
  const styles =
    kind === 'error'
      ? 'border-red-200 bg-red-50 text-red-700'
      : kind === 'info'
        ? 'border-slate-200 bg-slate-50 text-slate-600'
        : 'border-emerald-200 bg-emerald-50 text-emerald-700'
  return <div className={`rounded-lg border px-3.5 py-2.5 text-sm ${styles}`}>{children}</div>
}

export function PageHeader({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50">
            <Icon className="h-6 w-6 text-brand-600" />
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}

export function Card({ className = '', children }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {children}
    </div>
  )
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
      {Icon && (
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
          <Icon className="h-7 w-7 text-slate-400" />
        </div>
      )}
      <p className="mt-4 text-base font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Spinner({ className = '' }) {
  return (
    <div className={`flex items-center justify-center py-16 ${className}`}>
      <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
    </div>
  )
}

export function Modal({ open, onClose, title, children }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold">{title}</h2>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  )
}
