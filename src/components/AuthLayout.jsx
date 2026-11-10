import { Link } from 'react-router-dom'
import { Eye } from 'lucide-react'
import AppLangSwitch from '../i18n/AppLangSwitch'

export default function AuthLayout({ title, subtitle, children, demoLink = false }) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center bg-surface p-4">
      <div className="absolute right-4 top-4 w-48">
        <AppLangSwitch />
      </div>
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center">
          <img src="/brand/logo-full.png" alt="StayFlow — Property Management" width="640" height="474" className="h-auto w-48 sm:w-56" />
        </div>
        <div className="card p-6 sm:p-8">
          <h1 className="type-title">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {demoLink && (
          <p className="mt-5 text-center">
            <Link to="/demo" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-accent hover:text-accent-ink">
              <Eye className="h-4 w-4" aria-hidden="true" />
              Разгледайте демо без регистрация
            </Link>
          </p>
        )}
      </div>
    </main>
  )
}
