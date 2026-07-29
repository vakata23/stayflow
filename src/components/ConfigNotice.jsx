import { Settings2 } from 'lucide-react'

export default function ConfigNotice() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50">
          <Settings2 className="h-6 w-6 text-brand-600" />
        </div>
        <h1 className="text-xl font-bold">Липсва Supabase конфигурация</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          Копирайте <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">.env.example</code> като{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">.env</code> и попълнете{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">VITE_SUPABASE_URL</code> и{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">VITE_SUPABASE_ANON_KEY</code> от
          Supabase Dashboard → Project Settings → API. След това рестартирайте dev сървъра.
        </p>
      </div>
    </div>
  )
}
