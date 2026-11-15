/**
 * PDF „Потвърждение за резервация“ към гост (jsPDF, шрифт Roboto с кирилица — както фактурата).
 * Библиотеката и шрифтът се зареждат динамично само когато собственикът поиска PDF.
 * data = резултатът на confirmationData() от guestConfirm.js. Връща { blob, filename }.
 */
import { formatMoney } from './money'
import { loadFontBase64 } from './invoicePdf'
import { confirmationFilename } from './guestConfirm'

const ACCENT = [166, 62, 30] // #a63e1e — като в приложението
const INK = [36, 26, 17]
const MUTED = [120, 105, 90]
const LINE = [227, 214, 193]

const bgDate = (iso) => {
  if (!iso) return ''
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return `${d}.${m}.${y}`
}

export async function generateConfirmationPdf(data, booking) {
  const [{ jsPDF }, fontBase64] = await Promise.all([import('jspdf'), loadFontBase64()])
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  doc.addFileToVFS('Roboto-Regular.ttf', fontBase64)
  doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal')
  doc.setFont('Roboto')

  const M = 20
  const W = 210
  let y = M

  doc.setFontSize(11)
  doc.setTextColor(...ACCENT)
  doc.text('StayFlow', M, y)
  doc.setTextColor(...MUTED)
  doc.text('Потвърждение за резервация', W - M, y, { align: 'right' })
  y += 6
  doc.setDrawColor(...ACCENT)
  doc.setLineWidth(0.6)
  doc.line(M, y, W - M, y)

  y += 14
  doc.setFontSize(22)
  doc.setTextColor(...INK)
  doc.text(doc.splitTextToSize(data.property.name || 'Резервация', W - 2 * M), M, y)
  y += 8
  if (data.property.address) {
    doc.setFontSize(10)
    doc.setTextColor(...MUTED)
    doc.text(data.property.address, M, y)
    y += 6
  }
  y += 6

  const row = (label, value, strong = false) => {
    doc.setFontSize(10)
    doc.setTextColor(...MUTED)
    doc.text(label, M, y)
    doc.setFontSize(strong ? 12 : 11)
    doc.setTextColor(...INK)
    doc.text(String(value), W - M, y, { align: 'right' })
    y += strong ? 9 : 7.5
  }
  const rule = () => {
    doc.setDrawColor(...LINE)
    doc.setLineWidth(0.3)
    doc.line(M, y - 3, W - M, y - 3)
    y += 4
  }

  row('Гост', data.guest.name)
  row('Настаняване', `${bgDate(data.period.checkIn)}${data.property.checkinTime ? ', от ' + data.property.checkinTime : ''}`)
  row('Напускане', `${bgDate(data.period.checkOut)}${data.property.checkoutTime ? ', до ' + data.property.checkoutTime : ''}`)
  row('Нощувки', data.period.nights)
  if (data.guests) row('Гости', data.guests)
  rule()

  if (data.viaPlatform) {
    row('Плащане', `през ${data.viaPlatform}`)
  } else if (data.total != null) {
    row('Цена за престоя', formatMoney(data.price))
    if (data.tax > 0) row('Туристически данък', formatMoney(data.tax))
    row('Общо', formatMoney(data.total))
    row('Платено', formatMoney(data.paid))
    doc.setFontSize(13)
    doc.setTextColor(...ACCENT)
    doc.text('Остава за плащане', M, y + 1)
    doc.text(formatMoney(data.balance ?? 0), W - M, y + 1, { align: 'right' })
    y += 12
  } else {
    doc.setFontSize(10)
    doc.setTextColor(...MUTED)
    doc.text('Цената ще бъде потвърдена допълнително.', M, y)
    y += 10
  }

  rule()
  doc.setFontSize(10)
  doc.setTextColor(...MUTED)
  const contact = [data.owner.name, data.owner.phone].filter(Boolean).join(' · ')
  if (contact) doc.text(doc.splitTextToSize(`Контакт: ${contact}`, W - 2 * M), M, y)

  doc.setFontSize(8)
  doc.text('Благодарим ви, че избрахте нас! Документът е издаден електронно чрез StayFlow.', W / 2, 285, { align: 'center' })

  return { blob: doc.output('blob'), filename: confirmationFilename(booking) }
}
