export default function AuthLayout({ title, subtitle, children }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center">
          <img src="/brand/logo-full.png" alt="StayFlow — Property Management" width="640" height="474" className="h-auto w-48 sm:w-56" />
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
