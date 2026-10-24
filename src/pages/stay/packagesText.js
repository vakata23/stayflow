import { formatDate } from '../../lib/localeDates.js'

/**
 * Офертите (пакетите) за госта на езика на страницата. pkg е ред от public_packages (или от таблицата, при преглед).
 * Връща { title, lines }: заглавието е името на офертата, а ако няма име — описанието; lines са подробностите
 * (описанието при име, повторение, ден от седмицата, период на важене).
 */
export function describeOffer(pkg, t, locale) {
  const nights = (n) => t('nights', { n })
  const days = (n) => t('days', { n })
  const percent = String(Number(pkg.percent))
  const money = (v) => `${Number(v) % 1 === 0 ? Number(v) : Number(v).toFixed(2)} €`
  let main = ''
  const extra = []
  if (pkg.kind === 'free_nights') {
    main = t('pkgFreeNights', { paid: nights(pkg.paid_nights), total: nights(Number(pkg.paid_nights) + Number(pkg.free_nights)) })
    if (pkg.repeat_block) extra.push(t('pkgRepeat'))
  } else if (pkg.kind === 'percent_off') {
    main = t('pkgPercent', { percent, nights: nights(pkg.min_nights) })
  } else if (pkg.kind === 'fixed_price') {
    main = t('pkgFixed', { nights: nights(pkg.fixed_nights), price: money(pkg.fixed_total) })
    if (pkg.checkin_weekday) {
      const wd = formatDate(locale, new Date(Date.UTC(2001, 0, Number(pkg.checkin_weekday))), { weekday: 'long', timeZone: 'UTC' })
      extra.push(t('pkgFixedWeekday', { weekday: wd }))
    }
  } else if (pkg.kind === 'early_bird') {
    main = t('pkgEarly', { percent, days: days(pkg.days_before) })
  } else if (pkg.kind === 'last_minute') {
    main = Number(pkg.days_before) === 0 ? t('pkgLastToday', { percent }) : t('pkgLast', { percent, days: days(pkg.days_before) })
  }
  const date = (iso) => formatDate(locale, new Date(`${iso}T12:00:00Z`), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  if (pkg.valid_from && pkg.valid_to) extra.push(t('pkgValidBetween', { from: date(pkg.valid_from), to: date(pkg.valid_to) }))
  else if (pkg.valid_from) extra.push(t('pkgValidFrom', { from: date(pkg.valid_from) }))
  else if (pkg.valid_to) extra.push(t('pkgValidTo', { to: date(pkg.valid_to) }))
  const name = (pkg.name ?? '').trim()
  return { title: name || main, lines: name ? [main, ...extra] : extra, label: name || main }
}
