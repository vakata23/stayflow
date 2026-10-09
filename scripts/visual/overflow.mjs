// Хоризонтално препълване на всички екрани на 360 / 375 / 768 / 1440 px (без мобилна емулация, която „смаляваше“ страницата).
//   node scripts/visual/overflow.mjs http://localhost:4174
import { chromium } from 'playwright'
import { USER } from './seed.mjs'

const base = process.argv[2] || 'http://localhost:4174'
const routes = [
  '/', '/calendar', '/bookings', '/earnings', '/earnings/rules', '/booking-requests', '/cleaning-tasks', '/cleaning-notes', '/pricing',
  '/guest-cards', '/access-codes', '/invoicing', '/notifications', '/properties', '/properties/new', '/design',
]
const widths = [360, 375, 768, 1440]
const jwt = () => {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b({ alg: 'HS256', typ: 'JWT' })}.${b({ sub: USER.id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 86400 })}.sig`
}
const session = { access_token: jwt(), token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: USER }

let bad = 0
let total = 0
const browser = await chromium.launch({ channel: 'chrome' })
for (const width of widths) {
  const ctx = await browser.newContext({ viewport: { width, height: 800 }, locale: 'bg-BG', timezoneId: 'Europe/Sofia' })
  await ctx.addInitScript((s) => {
    try { localStorage.setItem('sb-localhost-auth-token', JSON.stringify(s)); localStorage.setItem('stayflow.autoSetupSeen', '1') } catch {}
  }, session)
  for (const route of routes) {
    const page = await ctx.newPage()
    await page.goto(base + route, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready).catch(() => {})
    await page.waitForTimeout(900)
    const r = await page.evaluate(() => {
      const iw = document.documentElement.clientWidth
      const offenders = []
      for (const el of document.querySelectorAll('body *')) {
        const rect = el.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) continue
        if (rect.right > iw + 1) {
          // елементи в скролиращ контейнер са в ред
          let p = el.parentElement
          let scrolls = false
          while (p && p !== document.body) {
            const cs = getComputedStyle(p)
            if (/(auto|scroll|hidden)/.test(cs.overflowX) && p.getBoundingClientRect().right <= iw + 1) { scrolls = true; break }
            p = p.parentElement
          }
          if (!scrolls && getComputedStyle(el).position !== 'fixed') offenders.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 3).join('.')} → ${Math.round(rect.right)}`)
        }
      }
      return { sw: document.documentElement.scrollWidth, iw, offenders: offenders.slice(0, 3) }
    })
    total++
    if (r.sw > r.iw + 1 || r.offenders.length) {
      bad++
      console.log(`FAIL ${width} ${route}: scrollWidth ${r.sw} > ${r.iw}; ${r.offenders.join(' | ')}`)
    }
    await page.close()
  }
  await ctx.close()
}
await browser.close()
console.log(`\n${total - bad} от ${total} екрана/ширини без хоризонтално препълване`)
process.exit(bad ? 1 : 0)
