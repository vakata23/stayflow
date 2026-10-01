/**
 * Генериране на PDF фактура с jsPDF.
 *
 * Кирилица: стандартните шрифтове на jsPDF (Helvetica) са Latin-1 и
 * чупят кирилицата. Затова зареждаме Roboto (TTF с кирилски глифи) от
 * /fonts и го регистрираме във jsPDF. Шрифтът и самата библиотека се
 * зареждат динамично — само когато потребителят реално издава фактура,
 * за да не тежат на началния bundle. Roboto покрива и знака €.
 */
import { formatMoney } from './money'

let fontBase64Cache = null

async function loadFontBase64() {
  if (fontBase64Cache) return fontBase64Cache

  const res = await fetch('/fonts/Roboto-Regular.ttf')
  if (!res.ok) throw new Error('Шрифтът за фактурата не можа да се зареди.')
  const buffer = await res.arrayBuffer()

  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  fontBase64Cache = btoa(binary)
  return fontBase64Cache
}

const BRAND = [27, 120, 124] // #1b787c
const SLATE = [51, 65, 85] // slate-700
const MUTED = [148, 163, 184] // slate-400

function formatDate(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

/**
 * data = {
 *   invoiceNumber, issueDate,
 *   business: { name, phone },
 *   guest: { name, phone, email },
 *   property: { name },
 *   period: { checkIn, checkOut, nights },
 *   amount
 * }
 * Връща { blob, filename }.
 */
export async function generateInvoicePdf(data) {
  const [{ jsPDF }, fontBase64] = await Promise.all([import('jspdf'), loadFontBase64()])

  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  doc.addFileToVFS('Roboto-Regular.ttf', fontBase64)
  doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal')
  doc.setFont('Roboto')

  const M = 20 // margin
  const W = 210
  let y = M

  // ---- Заглавие ----
  doc.setFontSize(24)
  doc.setTextColor(...BRAND)
  doc.text('ФАКТУРА', M, y)

  doc.setFontSize(10)
  doc.setTextColor(...MUTED)
  doc.text('StayFlow', W - M, y - 5, { align: 'right' })
  doc.setTextColor(...SLATE)
  doc.text(`№ ${data.invoiceNumber}`, W - M, y, { align: 'right' })
  doc.text(`Дата: ${formatDate(data.issueDate)}`, W - M, y + 5, { align: 'right' })

  y += 12
  doc.setDrawColor(...BRAND)
  doc.setLineWidth(0.6)
  doc.line(M, y, W - M, y)
  y += 10

  // ---- Доставчик / Получател ----
  const colR = 110
  doc.setFontSize(9)
  doc.setTextColor(...MUTED)
  doc.text('ДОСТАВЧИК', M, y)
  doc.text('ПОЛУЧАТЕЛ', colR, y)
  y += 6

  doc.setFontSize(11)
  doc.setTextColor(...SLATE)
  doc.text(data.business.name || 'StayFlow', M, y)
  doc.text(data.guest.name || '', colR, y)
  y += 6

  doc.setFontSize(9)
  doc.setTextColor(...MUTED)
  const bizLines = []
  if (data.business.phone) bizLines.push(`Тел.: ${data.business.phone}`)
  const guestLines = []
  if (data.guest.phone) guestLines.push(`Тел.: ${data.guest.phone}`)
  if (data.guest.email) guestLines.push(data.guest.email)

  const maxLines = Math.max(bizLines.length, guestLines.length)
  for (let i = 0; i < maxLines; i++) {
    if (bizLines[i]) doc.text(bizLines[i], M, y)
    if (guestLines[i]) doc.text(guestLines[i], colR, y)
    y += 5
  }

  y += 8

  // ---- Таблица ----
  doc.setFillColor(241, 245, 249) // slate-100
  doc.rect(M, y - 5, W - 2 * M, 9, 'F')
  doc.setFontSize(9)
  doc.setTextColor(...SLATE)
  doc.text('ОПИСАНИЕ', M + 3, y)
  doc.text('ПЕРИОД', 120, y)
  doc.text('СУМА', W - M - 3, y, { align: 'right' })
  y += 10

  doc.setFontSize(10)
  doc.setTextColor(...SLATE)
  const desc = `Настаняване — ${data.property.name}`
  const descWrapped = doc.splitTextToSize(desc, 90)
  doc.text(descWrapped, M + 3, y)

  const nightsLabel = data.period.nights
    ? `${data.period.nights} ${data.period.nights === 1 ? 'нощувка' : 'нощувки'}`
    : ''
  doc.setFontSize(9)
  doc.setTextColor(...MUTED)
  doc.text(`${formatDate(data.period.checkIn)} – ${formatDate(data.period.checkOut)}`, 120, y)
  if (nightsLabel) doc.text(nightsLabel, 120, y + 5)

  doc.setFontSize(10)
  doc.setTextColor(...SLATE)
  doc.text(formatMoney(data.amount), W - M - 3, y, { align: 'right' })

  y += Math.max(descWrapped.length * 5, 12) + 6
  doc.setDrawColor(226, 232, 240) // slate-200
  doc.setLineWidth(0.3)
  doc.line(M, y, W - M, y)
  y += 8

  // ---- Общо ----
  doc.setFontSize(12)
  doc.setTextColor(...SLATE)
  doc.text('Общо за плащане:', 120, y)
  doc.setFontSize(14)
  doc.setTextColor(...BRAND)
  doc.text(formatMoney(data.amount), W - M - 3, y, { align: 'right' })

  // ---- Долен колонтитул ----
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  doc.text(
    'Благодарим Ви! Този документ е издаден електронно чрез StayFlow.',
    W / 2,
    285,
    { align: 'center' }
  )

  const blob = doc.output('blob')
  const filename = `Фактура-${data.invoiceNumber}.pdf`
  return { blob, filename }
}

/** Помощник за директно сваляне на blob. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
