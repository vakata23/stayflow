import { Link } from 'react-router-dom'
import { Eye } from 'lucide-react'
import AppLangSwitch from '../i18n/AppLangSwitch'

export default function AuthLayout({ title, subtitle, children, demoLink = false }) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center bg-surface p-4">
      <div className="w-full max-w-md">
        <div className="mb-5 flex justify-end">
          <div className="w-44">
            <AppLangSwitch />
          </div>
        </div>
        <div className="mb-8 flex flex-col items-center">
          <img src="/brand/logo-horizontal.png" alt="StayFlow" width="1100" height="241" className="h-auto w-52 sm:w-60" />
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
