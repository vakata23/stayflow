import { Link } from 'react-router-dom'
import { CheckCircle2, ChevronRight, Inbox, Wallet, AlertTriangle, ClipboardCheck } from 'lucide-react'
import { buildAttentionItems } from '../lib/attentionLogic'

const ICONS = { requests: Inbox, unpaid: Wallet, incomplete: AlertTriangle, cleaning: ClipboardCheck }
const TONES = {
  accent: 'bg-accent-soft text-accent',
  warning: 'bg-warning-soft text-warning',
}

/**
 * „Чака вас“: най-важното на таблото — какво изисква действие от собственика.
 * Всеки ред е връзка право към екрана, където се решава. Когато няма нищо — кратко успокояващо съобщение.
 */
export default function AttentionPanel({ facts }) {
  if (!facts) return null
  const items = buildAttentionItems(facts)

  if (items.length === 0) {
    return (
      <p className="card flex items-center gap-3 px-5 py-4 text-sm text-ink-soft" role="status">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden="true" />
        Всичко е наред — нищо не чака вас.
      </p>
    )
  }

  return (
    <section aria-labelledby="attention-title" className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 pb-1 pt-5 sm:px-7">
        <h2 id="attention-title" className="text-[1.375rem] sm:text-[1.625rem]">
          Чака вас
        </h2>
        <span className="grid h-7 min-w-7 place-items-center rounded-full bg-accent px-2 text-[0.8125rem] font-bold text-on-accent">{items.length}</span>
      </div>
      <ul className="px-2 pb-2 sm:px-4">
        {items.map((item) => {
          const Icon = ICONS[item.key]
          return (
            <li key={item.key}>
              <Link
                to={item.to}
                className="group flex min-h-16 items-center gap-3.5 rounded-2xl px-3 py-3 transition-colors active:bg-sunken [@media(hover:hover)_and_(pointer:fine)]:hover:bg-sunken sm:px-3.5"
              >
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${TONES[item.tone]}`}>
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold leading-tight">{item.title}</span>
                  <span className="mt-0.5 block text-sm leading-snug text-ink-soft">{item.detail}</span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
