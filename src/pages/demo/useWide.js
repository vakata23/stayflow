import { useEffect, useState } from 'react'

/** true на екран ≥ query (по подразбиране 900 px) — за да не теглим снимки, които няма да се виждат. */
export default function useWide(query = '(min-width: 900px)') {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setWide(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return wide
}
