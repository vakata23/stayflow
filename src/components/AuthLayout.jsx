import { Waves } from 'lucide-react'

export default function AuthLayout({ title, subtitle, children }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-accent text-on-accent shadow-accent">
            <Waves className="h-6 w-6" aria-hidden="true" />
          </div>
          <p className="mt-3 font-display text-3xl font-bold tracking-tight">StayFlow</p>
          <p className="text-xs font-medium uppercase tracking-widest text-ink-muted">Property Management</p>
        </div>
        <div className="card p-6 sm:p-8">
          <h1 className="type-title">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </main>
  )
}
