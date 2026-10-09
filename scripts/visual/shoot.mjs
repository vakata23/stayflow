// Снимки на екрани от тестовата среда с фалшива сесия.
//   node harness/shoot.mjs <prefix> <base> <route[,route...]> [--public]
// Пише shots/<prefix>-<routeSlug>-<375|1440>.png и печата структурни проверки (препълване, грешки в конзолата).
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { USER } from './seed.mjs'

const [prefix, base, routesArg, flag] = process.argv.slice(2)
const routes = routesArg.split(',')
const isPublic = flag === '--public'
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out')
mkdirSync(OUT, { recursive: true })

const VPS = [
  { name: '375', width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: '1440', width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
]
const jwt = () => {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b({ alg: 'HS256', typ: 'JWT' })}.${b({ sub: USER.id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 86400 })}.sig`
}
const session = {
  access_token: jwt(), token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: USER,
}
const slug = (r) => (r === '/' ? 'home' : r.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-'))

const COARSE = ['--blink-settings=primaryPointerType=2,availablePointerTypes=2,primaryHoverType=1,availableHoverTypes=1']
for (const vp of VPS) {
  const browser = await chromium.launch({ channel: 'chrome', args: vp.isMobile ? COARSE : [] })
  const ctx = await browser.newContext({ ...vp, viewport: { width: vp.width, height: vp.height }, locale: 'bg-BG', timezoneId: 'Europe/Sofia' })
  if (!isPublic) {
    await ctx.addInitScript((s) => {
      try { localStorage.setItem('sb-localhost-auth-token', JSON.stringify(s)); localStorage.setItem('stayflow.autoSetupSeen', '1') } catch {}
    }, session)
  }
  for (const route of routes) {
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 140)) })
    await page.goto(base + route, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready).catch(() => {})
    await page.waitForTimeout(1400)
    const m = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      iw: window.innerWidth,
      h1: document.querySelector('h1')?.textContent?.slice(0, 50) ?? null,
      font: getComputedStyle(document.body).fontFamily.slice(0, 40),
    }))
    await page.screenshot({ path: `${OUT}/${prefix}-${slug(route)}-${vp.name}.png`, fullPage: true })
    console.log(`${vp.name} ${route.padEnd(22)} h1=${JSON.stringify(m.h1)} overflow=${m.sw > m.iw ? 'ДА ' + m.sw : 'не'} errors=${errors.length ? errors.join(' | ') : '0'}`)
    await page.close()
  }
  await ctx.close()
  await browser.close()
}
