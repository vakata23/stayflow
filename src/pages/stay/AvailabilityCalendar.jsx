import { useEffect, useState } from 'react'
import { MONTHS_BG, WEEKDAYS_BG, monthGrid, toISODate, todayISO } from '../../lib/dates'
import { addMonths, startOfMonth, endOfMonth } from '../../lib/earnings'

function MonthCard({ year, month, busySet, today }) {
  const days = monthGrid(year, month)
  return (
    <div className="stay-month">
      <h3>
        {MONTHS_BG[month]} {year}
      </h3>
      <div className="stay-week" aria-hidden="true">
        {WEEKDAYS_BG.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="stay-days">
        {days.map((d) => {
          const isBusy = busySet.has(d.iso)
          const isPast = d.iso < today
          const isToday = d.iso === today
          const cls = !d.inMonth
            ? 'stay-day stay-day--blank'
            : isBusy || isPast
              ? 'stay-day stay-day--busy'
              : isToday
                ? 'stay-day stay-day--today'
                : 'stay-day'
          return (
            <div key={d.iso} className={cls}>
              {d.date.getDate()}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * loadBusy(fromISO, toISO) → Promise<string[]> заети нощувки ('YYYY-MM-DD').
 * Докато се зареди, държи мястото си със скелет — така страницата не „скача“.
 */
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

  if (loading) return <div className="stay-skel" style={{ height: 420 }} aria-hidden="true" />

  return (
    <div className="stay-card">
      <div className="stay-months">
        <MonthCard year={today.getFullYear()} month={today.getMonth()} busySet={busySet} today={todayISO()} />
        <MonthCard
          year={addMonths(today, 1).getFullYear()}
          month={addMonths(today, 1).getMonth()}
          busySet={busySet}
          today={todayISO()}
        />
      </div>
      <p className="stay-muted" style={{ margin: '18px 0 0', fontSize: 13 }}>
        Зачертаните дни вече са заети.
      </p>
    </div>
  )
}
