/**
 * iCal (RFC 5545) генериране и парсване.
 * Файлът е чист JavaScript без браузър-специфични API, за да може да
 * се използва както в клиента, така и в serverless функцията.
 */

const CRLF = '\r\n'

function escapeText(value = '') {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

/** 'YYYY-MM-DD' → 'YYYYMMDD' */
function toIcsDate(iso) {
  return iso.replace(/-/g, '')
}

/** Прегъва редове над 75 октета, както изисква RFC 5545. */
function foldLine(line) {
  if (line.length <= 75) return line
  const parts = []
  let rest = line
  parts.push(rest.slice(0, 75))
  rest = rest.slice(75)
  while (rest.length > 74) {
    parts.push(' ' + rest.slice(0, 74))
    rest = rest.slice(74)
  }
  if (rest.length) parts.push(' ' + rest)
  return parts.join(CRLF)
}

/**
 * Съставя .ics календар от резервации.
 * events: [{ uid, start: 'YYYY-MM-DD', end: 'YYYY-MM-DD', summary }]
 * DTEND е изключващ — точно както Airbnb/Booking очакват
 * (денят на напускане е свободен).
 */
export function buildIcs({ calendarName, events, stamp }) {
  const dtstamp = (stamp || new Date().toISOString()).replace(/[-:]/g, '').replace(/\.\d{3}/, '')

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//StayFlow//PMS//BG',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ]

  for (const ev of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${ev.uid}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${toIcsDate(ev.start)}`,
      `DTEND;VALUE=DATE:${toIcsDate(ev.end)}`,
      `SUMMARY:${escapeText(ev.summary)}`,
      'END:VEVENT'
    )
  }

  lines.push('END:VCALENDAR')
  return lines.map(foldLine).join(CRLF) + CRLF
}

/** Разгъва прегънатите редове обратно в цели редове. */
function unfold(text) {
  return text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '')
}

/** 'YYYYMMDD' или 'YYYYMMDDTHHMMSSZ' → 'YYYY-MM-DD' */
function parseIcsDate(value) {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})/)
  if (!m) return null
  return `${m[1]}-${m[2]}-${m[3]}`
}

/**
 * Извлича VEVENT записите от .ics текст.
 * Връща [{ uid, start, end, summary }] — само събития с валидни дати.
 */
export function parseIcs(text) {
  const content = unfold(text)
  const events = []
  const blocks = content.split('BEGIN:VEVENT').slice(1)

  for (const block of blocks) {
    const body = block.split('END:VEVENT')[0]
    const event = {}

    for (const rawLine of body.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line) continue

      const colon = line.indexOf(':')
      if (colon === -1) continue

      const name = line.slice(0, colon).split(';')[0].toUpperCase()
      const value = line.slice(colon + 1)

      if (name === 'UID') event.uid = value
      else if (name === 'DTSTART') event.start = parseIcsDate(value)
      else if (name === 'DTEND') event.end = parseIcsDate(value)
      else if (name === 'SUMMARY') {
        event.summary = value.replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/g, ' ').trim()
      }
    }

    if (event.start && event.end && event.end > event.start) {
      events.push({
        uid: event.uid || `${event.start}-${event.end}`,
        start: event.start,
        end: event.end,
        summary: event.summary || '',
      })
    }
  }

  return events
}

/** Познава платформата по iCal адреса, за да зададем source на резервацията. */
export function detectSource(url = '') {
  const u = url.toLowerCase()
  if (u.includes('airbnb')) return 'airbnb'
  if (u.includes('booking.com')) return 'booking'
  return 'direct'
}
