// Начална страница „/“: невлезлият посетител вижда демото (не вход), влезлият — таблото; вход/регистрация са на един клик;
// инсталираното приложение и всички вътрешни адреси без вход пак отиват на вход; заглавие, една индексируема страница, достъпност.
//   node scripts/visual/root.mjs http://localhost:4174 [папка за снимки]
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { USER } from './seed.mjs'

const require = createRequire(import.meta.url)
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
const base = process.argv[2] || 'http://localhost:4174'
const shots = process.argv[3]
if (shots) mkdirSync(shots, { recursive: true })
let pass = 0
let fail = 0
const ok = (name, cond, extra = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`)
}
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER.id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 86400 })}.sig`
const session = { access_token: jwt, token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: USER }
const browser = await chromium.launch({ channel: 'chrome' })

async function open(path, width, height, { signedIn = false, standalone = false } = {}) {
  const phone = width < 900
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, locale: 'bg-BG', timezoneId: 'Europe/Sofia', deviceScaleFactor: phone ? 2 : 1 })
  await ctx.addInitScript(([s, signed, sa]) => {
    try {
      if (signed) {
        localStorage.setItem('sb-localhost-auth-token', JSON.stringify(s))
        localStorage.setItem('stayflow.autoSetupSeen', '1')
      }
      if (sa) {
        // имитира инсталирано приложение (display-mode: standalone)
        const real = window.matchMedia.bind(window)
        window.matchMedia = (q) => (/display-mode:\s*standalone/.test(q) ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} } : real(q))
      }
    } catch {}
  }, [session, signedIn, standalone])
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|the server responded|tile|openstreetmap/i.test(m.text())) errors.push(m.text().slice(0, 140)) })
  await page.goto(base + path, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(900)
  return { ctx, page, errors }
}
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
const axe = async (page) => {
  await page.evaluate(axeSource)
  return page.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map((v) => `${v.id}(${v.nodes.length})`))
}

/* ---- невлезъл посетител на „/“ ---- */
for (const [w, h] of [[1440, 900], [375, 812]]) {
  const { ctx, page, errors } = await open('/', w, h)
  const m = await page.evaluate(() => ({
    path: location.pathname,
    h1: document.querySelector('h1')?.textContent ?? '',
    h1n: document.querySelectorAll('h1').length,
    mains: document.querySelectorAll('main').length,
    title: document.title,
    desc: document.querySelector('meta[name="description"]')?.content ?? '',
    login: !!document.querySelector('a[href="/login"]'),
    signup: !!document.querySelector('a[href="/signup"]'),
    cards: document.querySelectorAll('.demo-card').length,
    tabs: document.querySelectorAll('[role=tab]').length,
    robots: document.querySelector('meta[name="robots"]')?.content ?? null,
    brand: document.querySelector('.demo-brand')?.getAttribute('href'),
  }))
  ok(`/ @${w}: невлезлият остава на „/“ и вижда демото`, m.path === '/' && /Резервациите от Airbnb и Booking/.test(m.h1) && m.h1n === 1 && m.mains === 1, `${m.path} | ${m.h1}`)
  ok(`/ @${w}: заглавие и описание на продукта (не „демо“)`, m.title === 'StayFlow — Управление на краткосрочни наеми' && /^Управление на краткосрочни наеми/.test(m.desc), m.title)
  ok(`/ @${w}: има „Вход“ и „Създай профил“, 3 примера, 9 таба с екрани`, m.login && m.signup && m.cards === 3 && m.tabs === 9, JSON.stringify({ l: m.login, s: m.signup, c: m.cards, t: m.tabs }))
  ok(`/ @${w}: връзката на логото води към „/“, страницата не е noindex`, m.brand === '/' && m.robots === null, `${m.brand} ${m.robots}`)
  ok(`/ @${w}: без препълване и без грешки`, !(await overflow(page)) && errors.length === 0, errors.join(' | '))
  const v = await axe(page)
  ok(`/ @${w}: axe — 0 нарушения`, v.length === 0, v.join(', '))
  if (shots) await page.screenshot({ path: `${shots}/root-${w}.png` })
  if (w === 1440) {
    await page.getByRole('link', { name: 'Вход' }).first().click()
    await page.waitForURL('**/login')
    ok('„Вход“ от началната страница отвежда към /login', new URL(page.url()).pathname === '/login')
    await page.goBack()
    await page.waitForSelector('.demo-hero h1')
    await page.getByRole('link', { name: 'Създай профил' }).first().click()
    await page.waitForURL('**/signup')
    ok('„Създай профил“ отвежда към /signup', new URL(page.url()).pathname === '/signup')
  }
  await ctx.close()
}

/* ---- /demo е същото съдържание, със заглавие на демото ---- */
{
  const { ctx, page } = await open('/demo', 1440, 900)
  const m = await page.evaluate(() => ({ title: document.title, brand: document.querySelector('.demo-brand')?.getAttribute('href') }))
  ok('/demo: заглавие на демото, логото води към /demo', /демо на StayFlow/.test(m.title) && m.brand === '/demo', JSON.stringify(m))
  await ctx.close()
}

/* ---- влезлият собственик вижда таблото ---- */
{
  const { ctx, page, errors } = await open('/', 1440, 900, { signedIn: true })
  await page.waitForSelector('main, [data-testid], nav', { timeout: 8000 })
  const m = await page.evaluate(() => ({ path: location.pathname, demo: !!document.querySelector('.demo-hero'), nav: !!document.querySelector('nav') }))
  ok('влезъл: „/“ показва таблото на приложението, не демото', m.path === '/' && !m.demo && m.nav, JSON.stringify(m))
  ok('влезъл: без грешки', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

/* ---- инсталирано приложение (PWA/Capacitor): невлезлият собственик отива на вход ---- */
{
  const { ctx, page } = await open('/', 375, 812, { standalone: true })
  await page.waitForURL('**/login', { timeout: 8000 }).catch(() => {})
  ok('инсталирано приложение без сесия: „/“ → /login (не демо)', new URL(page.url()).pathname === '/login', page.url())
  await ctx.close()
}

/* ---- вътрешни адреси без вход пак отиват на вход ---- */
for (const p of ['/bookings', '/calendar', '/properties', '/earnings']) {
  const { ctx, page } = await open(p, 1440, 900)
  await page.waitForURL('**/login', { timeout: 8000 }).catch(() => {})
  ok(`${p} без вход → /login`, new URL(page.url()).pathname === '/login', page.url())
  await ctx.close()
}

await browser.close()
console.log(`\nroot: ${pass} успешни, ${fail} провалени`)
process.exit(fail ? 1 : 0)
