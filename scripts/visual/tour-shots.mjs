// Снимки на екраните на приложението за „Какво има вътре“ на /demo: истинският интерфейс с измислените данни от seed.mjs
// (снимките на имотите са подменени с демо снимките от public/demo). Пише PNG в <папка>; scripts/make-tour-images.py ги прави WebP.
//   node scripts/visual/tour-shots.mjs http://localhost:4174 <папка>
import { chromium } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'
import { USER } from './seed.mjs'

const base = process.argv[2] || 'http://localhost:4174'
const out = process.argv[3]
if (!out) throw new Error('липсва папка за снимките')
mkdirSync(out, { recursive: true })

const P1 = '21111111-0000-4000-8000-000000000001'
// измислените имоти от seed.mjs ползват снимки 116, 42, 10, 37, 1018, 1043, 164, 1015 → подменяме с демо снимките
const SWAP = { 116: 'terrace-4', 42: 'living-4', 10: 'bedroom-1', 37: 'kitchen-1', 1018: 'terrace-3', 1043: 'living-1', 164: 'bedroom-2', 1015: 'view-2' }
const demoPhoto = (kind, id) => {
  const name = SWAP[id] ?? 'living-4'
  return readFileSync(`public/demo/${name}-${kind === 'thumb' ? 480 : 1200}.webp`)
}

const jwt = () => {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b({ alg: 'HS256', typ: 'JWT' })}.${b({ sub: USER.id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 86400 })}.sig`
}
const session = { access_token: jwt(), token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: USER }

// Скролира така, че елементът да е близо до горния край (скрива предупрежденията в началото на страницата)
const topAt = (name, offset = 24) => async (p) => {
  const el = typeof name === 'string' ? p.getByText(name).first() : name(p)
  await el.scrollIntoViewIfNeeded().catch(() => {})
  await p.evaluate((o) => window.scrollBy(0, -o), offset)
}

// key, маршрут, действие преди снимката
const DESKTOP = [
  ['dashboard', '/'],
  ['calendar', '/calendar'],
  ['bookings', '/bookings', async (p) => { await p.evaluate(() => window.scrollTo(0, 150)) }],
  ['earnings', '/earnings', topAt('Печалба за', 60)],
  ['property', `/properties/${P1}`, async (p) => { await p.getByRole('heading', { name: 'Сезонни цени' }).first().scrollIntoViewIfNeeded().catch(() => {}); await p.evaluate(() => window.scrollBy(0, -90)) }],
  ['cleaning', '/cleaning-tasks'],
  ['invoicing', '/invoicing'],
  ['requests', '/booking-requests'],
  ['greek', '/', null, { lang: 'el' }],
]
const PHONE = [
  ['dashboard', '/'],
  ['calendar', '/calendar'],
  ['bookings', '/bookings', async (p) => { await p.evaluate(() => window.scrollTo(0, 400)) }],
  ['earnings', '/earnings', async (p) => { await p.evaluate(() => window.scrollTo(0, 190)) }],
  ['property', `/properties/${P1}`, async (p) => { await p.getByRole('heading', { name: 'Сезонни цени' }).first().scrollIntoViewIfNeeded().catch(() => {}); await p.evaluate(() => window.scrollBy(0, -20)) }],
  ['cleaning', '/cleaning-tasks'],
  ['invoicing', '/invoicing'],
  ['requests', '/booking-requests'],
  ['greek', '/', null, { lang: 'el' }],
]

const COARSE = ['--blink-settings=primaryPointerType=2,availablePointerTypes=2,primaryHoverType=1,availableHoverTypes=1']
async function shoot(kind, list) {
  const phone = kind === 'phone'
  const browser = await chromium.launch({ channel: 'chrome', args: phone ? COARSE : [] })
  for (const [key, route, action, opts = {}] of list) {
    const ctx = await browser.newContext({
      viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 },
      deviceScaleFactor: phone ? 2 : 1, isMobile: phone, hasTouch: phone, locale: 'bg-BG', timezoneId: 'Europe/Sofia',
    })
    await ctx.addInitScript(([s, lang]) => {
      try {
        localStorage.setItem('sb-localhost-auth-token', JSON.stringify(s))
        localStorage.setItem('stayflow.autoSetupSeen', '1')
        if (lang) localStorage.setItem('stayflow.appLang', lang)
      } catch {}
    }, [session, opts.lang ?? null])
    await ctx.route('**/photos/**', (route) => {
      const m = route.request().url().match(/photos\/(full|thumb)-(\d+)\.webp/)
      return m ? route.fulfill({ status: 200, contentType: 'image/webp', body: demoPhoto(m[1], Number(m[2])) }) : route.continue()
    })
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(base + route, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(1600)
    if (action) await action(page)
    await page.waitForTimeout(700)
    await page.screenshot({ path: `${out}/${kind}-${key}.png` })
    console.log(kind, key, errors.length ? 'ГРЕШКИ ' + errors.join(' | ') : 'ok')
    await ctx.close()
  }
  await browser.close()
}
await shoot('desktop', DESKTOP)
await shoot('phone', PHONE)
