// Автоматична проверка за достъпност (axe-core, WCAG 2.0–2.2 A/AA + добри практики) върху екраните.
//   node harness/axe.mjs <base> <label> [route,route,...]
import { chromium } from 'playwright'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createRequire } from 'node:module'
import { USER } from './seed.mjs'

const require = createRequire(import.meta.url)
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out')
mkdirSync(OUT, { recursive: true })
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
const [base, label, routesArg] = process.argv.slice(2)
const routes = (routesArg || '/login,/,/calendar,/bookings,/earnings,/properties,/notifications,/booking-requests,/cleaning-tasks,/invoicing,/pricing').split(',')
const PUBLIC = new Set(['/login', '/design'])

const jwt = () => {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b({ alg: 'HS256', typ: 'JWT' })}.${b({ sub: USER.id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 86400 })}.sig`
}
const session = { access_token: jwt(), token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: USER }
const COARSE = ['--blink-settings=primaryPointerType=2,availablePointerTypes=2,primaryHoverType=1,availableHoverTypes=1']
const VPS = [
  { name: '375', width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: '1440', width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
]

const rows = []
const byRule = {}
for (const vp of VPS) {
  const browser = await chromium.launch({ channel: 'chrome', args: vp.isMobile ? COARSE : [] })
  const ctx = await browser.newContext({ ...vp, viewport: { width: vp.width, height: vp.height }, locale: 'bg-BG', timezoneId: 'Europe/Sofia' })
  await ctx.addInitScript((s) => { try { localStorage.setItem('sb-localhost-auth-token', JSON.stringify(s)); localStorage.setItem('stayflow.autoSetupSeen', '1') } catch {} }, session)
  for (const route of routes) {
    const page = await ctx.newPage()
    await page.goto(base + route, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready).catch(() => {})
    await page.waitForTimeout(1300)
    await page.evaluate(axeSource)
    const res = await page.evaluate(async () =>
      axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }, resultTypes: ['violations'] })
    )
    const v = res.violations.map((x) => ({ id: x.id, impact: x.impact, nodes: x.nodes.length, help: x.help }))
    const total = v.reduce((a, x) => a + x.nodes, 0)
    rows.push({ vp: vp.name, route, rules: v.length, nodes: total, v })
    for (const x of v) {
      byRule[x.id] ??= { impact: x.impact, help: x.help, nodes: 0, pages: 0 }
      byRule[x.id].nodes += x.nodes
      byRule[x.id].pages += 1
    }
    console.log(`${vp.name} ${route.padEnd(18)} правила=${String(v.length).padStart(2)} елементи=${String(total).padStart(3)}  ${v.map((x) => `${x.id}(${x.nodes})`).join(' ')}`)
    await page.close()
  }
  await ctx.close()
  await browser.close()
}
const totalNodes = rows.reduce((a, r) => a + r.nodes, 0)
console.log(`\n[${label}] ОБЩО нарушени елементи: ${totalNodes} в ${rows.length} изгледа`)
console.log(Object.entries(byRule).sort((a, b) => b[1].nodes - a[1].nodes).map(([id, r]) => `  ${id.padEnd(26)} ${String(r.nodes).padStart(4)} ел. / ${r.pages} стр.  [${r.impact}]  ${r.help}`).join('\n'))
writeFileSync(`${OUT}/axe-${label}.json`, JSON.stringify({ rows, byRule, totalNodes }, null, 1))
