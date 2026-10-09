// Достъпност (axe-core) на отворени състояния: лист „Още“, лист за ден, форма за резервация (нова и редакция).
//   node scripts/visual/axe-states.mjs http://localhost:4174
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { USER } from './seed.mjs'

const require = createRequire(import.meta.url)
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
const base = process.argv[2] || 'http://localhost:4174'
const COARSE = ['--blink-settings=primaryPointerType=2,availablePointerTypes=2,primaryHoverType=1,availableHoverTypes=1']
const jwt = () => {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b({ alg: 'HS256', typ: 'JWT' })}.${b({ sub: USER.id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 86400 })}.sig`
}
const session = { access_token: jwt(), token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: USER }

const STATES = [
  ['375', 'лист „Още“', '/', async (p) => p.getByRole('button', { name: /^Още/ }).click()],
  ['375', 'лист за ден', '/calendar', async (p) => p.getByRole('button', { name: /^Петък, 9 октомври/ }).click()],
  ['375', 'нова резервация', '/bookings', async (p) => p.getByRole('button', { name: 'Нова резервация' }).first().click()],
  ['375', 'редакция на резервация', '/bookings', async (p) => p.locator('ul.md\\:hidden li button').first().click()],
  ['1440', 'нова резервация', '/bookings', async (p) => p.getByRole('button', { name: 'Нова резервация' }).first().click()],
  ['1440', 'редакция на резервация', '/bookings', async (p) => p.locator('tbody tr').first().click()],
  ['1440', 'календар: свободен ден → форма', '/calendar', async (p) => p.getByRole('button', { name: /^Нова резервация на/ }).first().click()],
]

let total = 0
const browser = await chromium.launch({ channel: 'chrome', args: COARSE })
for (const [w, label, route, act] of STATES) {
  const phone = Number(w) < 900
  const ctx = await browser.newContext({ viewport: { width: Number(w), height: phone ? 812 : 900 }, isMobile: phone, hasTouch: phone, locale: 'bg-BG' })
  await ctx.addInitScript((s) => { try { localStorage.setItem('sb-localhost-auth-token', JSON.stringify(s)); localStorage.setItem('stayflow.autoSetupSeen', '1') } catch {} }, session)
  const page = await ctx.newPage()
  await page.goto(base + route, { waitUntil: 'load' })
  await page.waitForTimeout(1300)
  await act(page)
  await page.waitForSelector('[role="dialog"]')
  await page.waitForTimeout(900)
  await page.evaluate(axeSource)
  const res = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } }))
  const n = res.violations.reduce((s, v) => s + v.nodes.length, 0)
  total += n
  console.log(`${w} ${label.padEnd(34)} нарушения: ${n}${n ? '  ' + res.violations.map((v) => `${v.id}(${v.nodes.length}) ${v.nodes[0].target.join(' ').slice(0, 70)}`).join(' | ') : ''}`)
  await ctx.close()
}
await browser.close()
console.log(`\nОБЩО: ${total}`)
process.exit(total ? 1 : 0)
