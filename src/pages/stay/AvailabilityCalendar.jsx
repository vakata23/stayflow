import { useEffect, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { MONTHS_BG, WEEKDAYS_BG, monthGrid, toISODate, todayISO } from '../../lib/dates'
import { addMonths, startOfMonth, endOfMonth } from '../../lib/earnings'

function MonthCard({ year, month, busySet, today }) {
  const days = monthGrid(year, month)
  return (
    <div className="flex-1">
      <p className="mb-2 text-center text-sm font-semibold text-slate-700">
        {MONTHS_BG[month]} {year}
      </p>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase text-slate-400">
        {WEEKDAYS_BG.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {days.map((d) => {
          const isBusy = busySet.has(d.iso)
          const isPast = d.iso < today
          const isToday = d.iso === today
          return (
            <div
              key={d.iso}
              className={`flex h-8 items-center justify-center rounded-lg text-xs ${
                !d.inMonth
                  ? 'text-transparent'
                  : isBusy || isPast
                    ? 'text-slate-300 line-through'
                    : isToday
                      ? 'font-semibold text-brand-700 ring-1 ring-brand-300'
                      : 'text-slate-700'
              }`}
            >
              {d.date.getDate()}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** loadBusy(fromISO, toISO) → Promise<string[]> заети нощувки ('YYYY-MM-DD'). */
export default function AvailabilityCalendar({ loadBusy }) {
  const [busySet, setBusySet] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const today = new Date()

  useEffect(() => {
    let cancelled = false
    const from = toISODate(startOfMonth(today))
    const to = toISODate(endOfMonth(addMonths(today, 1)))

    Promise.resolve(loadBusy ? loadBusy(from, to) : [])
      .catch(() => [])
      .then((nights) => {
        if (cancelled) return
        setBusySet(new Set(nights))
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [loadBusy])

  if (loading) return null

  return (
    <div>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
        <CalendarDays className="h-4 w-4 text-slate-400" />
        Наличност
      </h2>
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
          <MonthCard year={today.getFullYear()} month={today.getMonth()} busySet={busySet} today={todayISO()} />
          <MonthCard
            year={addMonths(today, 1).getFullYear()}
            month={addMonths(today, 1).getMonth()}
            busySet={busySet}
            today={todayISO()}
          />
        </div>
        <p className="mt-4 text-xs text-slate-400">Зачертаните дни вече са заети.</p>
      </div>
    </div>
  )
}
