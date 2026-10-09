import { useCountUp } from '../lib/motion'

/**
 * Число, което се брои нагоре веднъж при първо показване (≤ 600 ms), после стои
 * на място. Екранният четец чете крайната стойност, не междинните.
 *   <CountUp value={1234.5} format={formatMoney} id="earnings-profit" />
 */
export default function CountUp({ value, format = (v) => String(Math.round(v)), id, duration, className }) {
  const ref = useCountUp(value, format, { id, duration })
  return (
    <>
      <span ref={ref} aria-hidden="true" className={className} />
      <span className="sr-only">{value == null || !Number.isFinite(Number(value)) ? '' : format(Number(value))}</span>
    </>
  )
}
