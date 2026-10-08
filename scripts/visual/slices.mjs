// Реже дълга страница на парчета (за детайлна проверка). node harness/slices.mjs <prefix> <url> <1440|375> <височина-в-css-px> [public]
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { USER } from './seed.mjs'

const [prefix, url, vpName, sliceH, pub] = process.argv.slice(2)
const vp = vpName === '375'
  ? { width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
  : { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false }
const H = Number(sliceH || 1000)
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out')
mkdirSync(OUT, { recursive: true })

const jwt = () => {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b({ alg: 'HS256', typ: 'JWT' })}.${b({ sub: USER.id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 86400 })}.sig`
}
const session = { access_token: jwt(), token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: USER }

const COARSE = ['--blink-settings=primaryPointerType=2,availablePointerTypes=2,primaryHoverType=1,availableHoverTypes=1']
const browser = await chromium.launch({ channel: 'chrome', args: vp.isMobile ? COARSE : [] })
const ctx = await browser.newContext({ ...vp, viewport: { width: vp.width, height: vp.height }, locale: 'bg-BG', timezoneId: 'Europe/Sofia' })
if (!pub) await ctx.addInitScript((s) => { localStorage.setItem('sb-localhost-auth-token', JSON.stringify(s)) }, session)
const page = await ctx.newPage()
await page.goto(url, { waitUntil: 'load' })
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(1200)
const total = await page.evaluate(() => document.documentElement.scrollHeight)
let n = 0
for (let y = 0; y < total; y += H) {
  await page.screenshot({ path: `${OUT}/${prefix}-${vpName}-s${String(n).padStart(2, '0')}.png`, fullPage: true, clip: { x: 0, y, width: vp.width, height: Math.min(H, total - y) } })
  n++
}
console.log(`${prefix} ${vpName}: ${n} парчета, височина ${total}px`)
await browser.close()
