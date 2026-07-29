export default function Placeholder({ icon: Icon, title, description, stage }) {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}

      <div className="mt-8 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50">
          <Icon className="h-7 w-7 text-brand-600" />
        </div>
        <p className="mt-4 text-base font-semibold">Модулът предстои</p>
        <p className="mt-1 max-w-sm text-sm text-slate-500">
          „{title}“ ще бъде изграден в Етап {stage} от разработката.
        </p>
      </div>
    </div>
  )
}
