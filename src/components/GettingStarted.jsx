import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import { buildChecklist, checklistProgress } from '../lib/checklistLogic'

const KEY = 'stayflow.checklistCollapsed'
const read = () => {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}
const write = (v) => {
  try {
    localStorage.setItem(KEY, v ? '1' : '0')
  } catch {
    /* без запомняне — списъкът просто се показва отворен */
  }
}

/**
 * „Първи стъпки“: пътят от празен акаунт до първата резервация. Стъпките се отмятат сами от данните.
 * Може да се свие (запомня се), изчезва напълно, когато всичко е готово.
 * welcome = за акаунт без нито един имот: показва се като приветствие на мястото на таблото.
 */
export default function GettingStarted({ facts, welcome }) {
  const [collapsed, setCollapsed] = useState(read)
  if (!facts) return null

  const steps = buildChecklist(facts)
  const { done, total, complete, next } = checklistProgress(steps)
  if (complete) return null

  const open = welcome || !collapsed
  const toggle = () => {
    setCollapsed((v) => {
      write(!v)
      return !v
    })
  }

  return (
    <section aria-labelledby="gs-title" className="card card-pad">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 id="gs-title" className={welcome ? 'type-heading text-[1.5rem] sm:text-[1.75rem]' : 'text-[1.375rem] sm:text-[1.625rem]'}>
            {welcome ? 'Добре дошли в StayFlow' : 'Първи стъпки'}
          </h2>
          <p className="mt-1 max-w-[56ch] text-sm leading-relaxed text-ink-soft">
            {welcome
              ? 'Няколко кратки стъпки до първата ви резервация. Всяка се отбелязва сама, щом я направите.'
              : `${done} от ${total} стъпки са готови. Всяка се отбелязва сама.`}
          </p>
        </div>
        {!welcome && (
          <button type="button" onClick={toggle} aria-expanded={open} className="btn btn-ghost btn-sm shrink-0">
            {open ? (
              <>
                Скрий <ChevronUp className="h-4 w-4" aria-hidden="true" />
              </>
            ) : (
              <>
                Покажи <ChevronDown className="h-4 w-4" aria-hidden="true" />
              </>
            )}
          </button>
        )}
      </div>

      <div
        className="mt-4 h-1.5 overflow-hidden rounded-full bg-sunken"
        role="progressbar"
        aria-label="Изпълнени стъпки"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
      >
        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round((done / total) * 100)}%` }} />
      </div>

      {open && (
        <ol className="mt-3">
          {steps.map((s) => {
            const isNext = next?.key === s.key
            return (
              <li key={s.key} className="flex min-h-14 flex-wrap items-center gap-x-3.5 gap-y-1.5 border-t border-line py-3 first:border-t-0">
                <span
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${
                    s.done ? 'bg-success-soft text-success' : isNext ? 'bg-accent text-on-accent' : 'bg-sunken text-ink-muted'
                  }`}
                  aria-hidden="true"
                >
                  {s.done ? <Check className="h-4 w-4" strokeWidth={2.5} /> : <span className="h-2 w-2 rounded-full bg-current" />}
                </span>
                <span className="min-w-0 flex-1 basis-[12rem]">
                  <span className={`block font-semibold leading-tight ${s.done ? 'text-ink-muted line-through decoration-ink-muted/50' : ''}`}>
                    {s.title}
                    {s.optional && !s.done && <span className="ml-2 align-middle text-xs font-medium text-ink-muted no-underline">по желание</span>}
                  </span>
                  {!s.done && <span className="mt-0.5 block text-sm leading-snug text-ink-soft">{s.hint}</span>}
                </span>
                <span className="sr-only">{s.done ? 'Готово' : 'Предстои'}</span>
                {!s.done && (
                  <Link to={s.to} className={`btn btn-sm shrink-0 ${isNext ? '' : 'btn-secondary'}`}>
                    {s.cta}
                  </Link>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
