import { useState } from 'react'
import { commissionCost, PLANS } from '../../lib/accessLogic'

const num = (s) => (s === '' ? NaN : Number(String(s).replace(',', '.')))

/** „Колко отива за платформите?“ — сметка в браузъра на посетителя, нищо не се записва и не се изпраща. */
export default function Calculator() {
  const [nights, setNights] = useState('18')
  const [price, setPrice] = useState('70')
  const [percent, setPercent] = useState('15')
  const res = commissionCost({ nights: num(nights), price: num(price), percent: num(percent) })
  const fmt = (n) => n.toLocaleString('bg-BG')

  return (
    <div className="lp-calc">
      <div className="lp-calc__in">
        <div className="lp-field">
          <label htmlFor="calc-nights">Заети нощувки на месец</label>
          <input id="calc-nights" inputMode="numeric" value={nights} onChange={(e) => setNights(e.target.value)} />
        </div>
        <div className="lp-field">
          <label htmlFor="calc-price">Средна цена за нощувка (€)</label>
          <input id="calc-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <div className="lp-field">
          <label htmlFor="calc-pct">Комисиона на платформата (%)</label>
          <input id="calc-pct" inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value)} aria-describedby="calc-hint" />
          <p className="lp-hint" id="calc-hint">
            Вашият процент е в акаунта ви в Airbnb или Booking.com.
          </p>
        </div>
      </div>
      <div className="lp-calc__out" role="status" aria-live="polite">
        {res ? (
          <>
            <p>Платформите вземат около</p>
            <p className="lp-calc__big">{fmt(res.month)} € на месец</p>
            <p className="lp-calc__year">≈ {fmt(res.year)} € на година</p>
            <p className="lp-calc__note">
              Всяка резервация, която дойде директно, оставя тази комисиона у вас. За сравнение: {PLANS.start.name} струва {PLANS.start.monthly} € на месец.
            </p>
          </>
        ) : (
          <p>Въведете нощувки (0–31), цена и комисиона (0–40%), за да видите сметката.</p>
        )}
      </div>
    </div>
  )
}
