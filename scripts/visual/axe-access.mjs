// axe-core (WCAG 2.0–2.2 A/AA + добри практики) върху публичните страници и екраните на платения достъп:
// „/“, /access, /signup, /privacy, /terms (без вход) и „на пауза“ + „Клиенти“ (с вход, състоянието се сменя през мок сървъра).
//   node scripts/visual/axe-access.mjs http://localhost:4175
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { USER } from './seed.mjs'

const require = createRequire(import.meta.url)
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
const base = process.argv[2] || 'http://localhost:4175'
const jwt = () => {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b({ alg: 'HS256', typ: 'JWT' })}.${b({ sub: USER.id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 86400 })}.sig`
}
const session = { access_token: jwt(), token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: USER }
const mock = (state) => fetch(`${base}/__mock/access?state=${state}`)

const CASES = [
  { route: '/', logged: false },
  { route: '/access', logged: false },
  { route: '/signup', logged: false },
  { route: '/privacy', logged: false },
  { route: '/terms', logged: false },
  { route: '/', logged: true, state: 'pending' },
  { route: '/', logged: true, state: 'expired' },
  { route: '/', logged: true, state: 'soon' },
  { route: '/admin/clients', logged: true, state: 'admin', click: /^Клиенти/ },
  { route: '/admin/clients', logged: true, state: 'admin' },
]
let bad = 0
let total = 0
const browser = await chromium.launch({ channel: 'chrome' })
for (const width of [375, 1440]) {
  for (const c of CASES) {
    await mock(c.state ?? 'active')
    const ctx = await browser.newContext({ viewport: { width, height: width < 700 ? 812 : 900 }, locale: 'bg-BG', timezoneId: 'Europe/Sofia' })
    await ctx.addInitScript(
      ([s, logged]) => {
        try {
          localStorage.setItem('stayflow.consent', JSON.stringify({ v: 1, choice: 'necessary', at: new Date().toISOString() }))
          if (logged) { localStorage.setItem('sb-localhost-auth-token', JSON.stringify(s)); localStorage.setItem('stayflow.autoSetupSeen', '1') }
        } catch {}
      },
      [session, c.logged]
    )
    const page = await ctx.newPage()
    await page.goto(base + c.route, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready).catch(() => {})
    await page.waitForTimeout(1400)
    if (c.click) {
      await page.getByRole('button', { name: c.click }).click()
      await page.waitForTimeout(500)
    }
    await page.evaluate(axeSource)
    const res = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }, resultTypes: ['violations'] }))
    total++
    const nodes = res.violations.reduce((a, x) => a + x.nodes.length, 0)
    const name = `${c.route}${c.state ? ' [' + c.state + ']' : ''}${c.click ? ' (раздел)' : ''} @${width}`
    if (nodes) {
      bad++
      console.log(`FAIL ${name}: ${res.violations.map((x) => `${x.id} (${x.nodes.length}) ${x.nodes[0].target.join(' ')}`).join(' | ')}`)
    } else console.log(`PASS ${name}`)
    await ctx.close()
  }
}
await mock('active')
await browser.close()
console.log(`\naxe-access: ${total - bad} от ${total} изгледа без нарушения`)
process.exit(bad ? 1 : 0)
