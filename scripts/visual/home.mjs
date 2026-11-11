// Табло: „Чака вас“, „Първи стъпки“ (празен / частично готов / завършен акаунт), „Нова резервация“, редове с клик,
// запомняне на свиването, менюто отстрани на нисък екран, препълване на телефон, достъпност.
//   node scripts/visual/home.mjs http://localhost:4174 [папка за снимки]
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createRequire } from 'node:module'
import { USER } from './seed.mjs'

const require = createRequire(import.meta.url)
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
const [base = 'http://localhost:4174', shotsArg] = process.argv.slice(2)
const OUT = shotsArg ? path.resolve(shotsArg) : path.join(path.dirname(fileURLToPath(import.meta.url)), 'out', 'home')
mkdirSync(OUT, { recursive: true })

let pass = 0
let fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) pass++
  else {
    fail++
    console.log('  ПРОВАЛ:', name, extra)
  }
}

const jwt = () => {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b({ alg: 'HS256', typ: 'JWT' })}.${b({ sub: USER.id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 86400 })}.sig`
}
const session = { access_token: jwt(), token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: USER }
const COARSE = ['--blink-settings=primaryPointerType=2,availablePointerTypes=2,primaryHoverType=1,availableHoverTypes=1']
const DESK = { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false }
const PHONE = { width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true }

const browsers = []
async function open(vp, { height } = {}) {
  const browser = await chromium.launch({ channel: 'chrome', args: vp.isMobile ? COARSE : [] })
  browsers.push(browser)
  const ctx = await browser.newContext({ ...vp, viewport: { width: vp.width, height: height ?? vp.height }, locale: 'bg-BG', timezoneId: 'Europe/Sofia' })
  await ctx.addInitScript((s) => { try { localStorage.setItem('sb-localhost-auth-token', JSON.stringify(s)); localStorage.setItem('stayflow.autoSetupSeen', '1') } catch {} }, session)
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text()) && errors.push(m.text()))
  return { page, ctx, errors }
}
const empty = (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '*/0' }, body: '[]' })
const emptyCount = (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '*/0' }, body: route.request().method() === 'HEAD' ? '' : '[]' })
const settle = async (page) => {
  await page.evaluate(() => document.fonts.ready).catch(() => {})
  await page.waitForTimeout(700)
}
const axe = async (page) =>
  page.evaluate(async (src) => {
    // eslint-disable-next-line no-eval
    ;(0, eval)(src)
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }, resultTypes: ['violations'] })
    return r.violations.map((v) => `${v.id}×${v.nodes.length}`)
  }, axeSource)

/* ---------- 1. Акаунт с данни (тестовите): „Чака вас“ и бутонът ---------- */
{
  const { page, errors } = await open(DESK)
  await page.goto(base + '/', { waitUntil: 'load' })
  await page.getByRole('heading', { name: 'Табло', level: 1 }).waitFor()
  await settle(page)

  const panel = page.getByRole('region', { name: 'Чака вас' })
  ok('„Чака вас“ се показва', await panel.isVisible())
  const hrefs = await panel.getByRole('link').evaluateAll((els) => els.map((e) => e.getAttribute('href')))
  ok('четири реда със верните връзки', hrefs.join() === '/booking-requests,/earnings,/bookings?incomplete=1,/cleaning-tasks', hrefs.join())
  const txt = await panel.innerText()
  ok('2 нови заявки от гости (колкото е в заявките)', /2 нови заявки от гости/.test(txt))
  ok('просрочено почистване е 1 (от тестовите данни: една задача с минал срок)', /Просрочено почистване/.test(txt))
  ok('неплатено: само директни/ръчни, с обща сума в евро', /гости с неплатен остатък/.test(txt) && /Общо \d+\.\d\d €/.test(txt), txt)
  ok('завършеният акаунт не показва „Първи стъпки“', (await page.getByRole('region', { name: 'Първи стъпки' }).count()) === 0)

  const newBtn = page.getByRole('link', { name: 'Нова резервация' })
  ok('бутон „Нова резервация“ води към /bookings?new=1', (await newBtn.getAttribute('href')) === '/bookings?new=1')

  // менюто отстрани: на 900 px всички места са видими
  const rules = page.getByRole('navigation', { name: 'Основно меню' }).getByRole('link', { name: 'Правила' })
  const box = await rules.boundingBox()
  ok('на 1440×900 „Правила“ е изцяло във видимото меню', box && box.y + box.height <= 900 - 140, JSON.stringify(box))
  const scrollable = await page.getByRole('navigation', { name: 'Основно меню' }).evaluate((n) => n.scrollHeight > n.clientHeight + 4)
  ok('на 900 px менюто не се превърта', !scrollable)

  await newBtn.click()
  // формата на резервацията не е role=dialog (стар вид) — намира се по заглавието
  const form = page.getByRole('heading', { name: 'Нова резервация', level: 2 })
  await form.waitFor()
  ok('„Нова резервация“ отваря формата', await form.isVisible())
  const fb = await form.boundingBox()
  ok('формата е във видимата част на екрана', fb && fb.y >= 0 && fb.y < 900, JSON.stringify(fb))
  ok('адресът е /bookings без ?new', new URL(page.url()).pathname === '/bookings' && !page.url().includes('new='), page.url())
  await page.screenshot({ path: path.join(OUT, 'desk-new-booking.png') })
  ok('без грешки в конзолата', errors.length === 0, errors.join(' | '))
}

/* ---------- 2. Клик по ред на таблото отваря резервацията ---------- */
{
  const { page } = await open(DESK)
  await page.goto(base + '/', { waitUntil: 'load' })
  await page.getByRole('heading', { name: 'Табло', level: 1 }).waitFor()
  await settle(page)
  const card = page.getByRole('link', { name: /Anna Schmidt/ }).first()
  const href = await card.getAttribute('href')
  ok('картата на гост води към /bookings?focus=<id>', /^\/bookings\?focus=[0-9a-f-]{36}$/.test(href ?? ''), href)
  await card.click()
  const dlg = page.locator('form').filter({ has: page.getByLabel('Име на госта') })
  await dlg.waitFor()
  ok('резервацията се отваря за редакция (името на госта е във формата)', (await dlg.locator('input').evaluateAll((els) => els.map((e) => e.value))).some((v) => v === 'Anna Schmidt'))

  await page.goto(base + '/', { waitUntil: 'load' })
  await page.getByRole('heading', { name: 'Табло', level: 1 }).waitFor()
  await settle(page)
  const row = page.getByRole('list').getByRole('link', { name: /Георги Димитров/ }).last()
  ok('и редът в „Следващите 14 дни“ е връзка', /^\/bookings\?focus=/.test((await row.getAttribute('href')) ?? ''))
}

/* ---------- 2б. Бъг на живо: прозорец, отворен след превъртане, излизаше извън екрана ---------- */
{
  const { page } = await open(DESK)
  await page.goto(base + '/bookings', { waitUntil: 'load' })
  await page.getByRole('heading', { name: 'Резервации', level: 1 }).waitFor()
  await settle(page)
  await page.evaluate(() => window.scrollTo(0, 700))
  await page.waitForTimeout(250)
  const scrolled = await page.evaluate(() => window.scrollY)
  ok('страницата е превъртяна (тестът е смислен)', scrolled > 300, String(scrolled))
  await page.getByRole('button', { name: 'Нова резервация' }).first().evaluate((e) => e.click())
  const h = page.getByRole('heading', { name: 'Нова резервация', level: 2 })
  await h.waitFor()
  await page.waitForTimeout(400)
  const b = await h.boundingBox()
  ok('форма, отворена при превъртяна страница, е във видимата част (не на −603 px)', b && b.y >= 0 && b.y < 900, JSON.stringify(b))
  const fill = await page.evaluate(() => getComputedStyle(document.querySelector('.page-in')).animationFillMode)
  ok('анимацията на екрана не остава „приложена“ (fill-mode backwards)', fill === 'backwards', fill)
}

/* ---------- 3. Празен акаунт: приветствие с пътя до първата резервация ---------- */
{
  const { page, errors } = await open(DESK)
  for (const t of ['properties', 'bookings', 'booking_requests', 'cleaning_tasks', 'booking_balances', 'property_photos', 'price_seasons', 'notification_targets']) {
    await page.route(new RegExp(`/rest/v1/${t}(\\?|$)`), emptyCount)
  }
  await page.goto(base + '/', { waitUntil: 'load' })
  await page.getByRole('heading', { name: 'Добре дошли в StayFlow' }).waitFor()
  await settle(page)
  const gs = page.getByRole('region', { name: 'Добре дошли в StayFlow' })
  ok('приветствие със 7 стъпки', (await gs.getByRole('listitem').count()) === 7)
  ok('няма бутон „Свий“ при приветствие (винаги отворено)', (await gs.getByRole('button', { name: /Скрий|Покажи/ }).count()) === 0)
  const btns = await gs.getByRole('link').evaluateAll((els) => els.map((e) => `${e.textContent.trim()}→${e.getAttribute('href')}`))
  ok('първата стъпка е „Добави имот“ → /properties/new', btns[0] === 'Добави имот→/properties/new', btns.join(' | '))
  ok('0 от 7 в лентата за напредък', (await gs.getByRole('progressbar').getAttribute('aria-valuenow')) === '0')
  ok('без бутон „Нова резервация“ в заглавието (няма имот) — само стъпката в списъка', (await page.getByRole('main').getByRole('link', { name: 'Нова резервация' }).count()) === 1 && (await gs.getByRole('link', { name: 'Нова резервация' }).count()) === 1)
  ok('„Чака вас“ не се показва без имот', (await page.getByRole('region', { name: 'Чака вас' }).count()) === 0)
  await page.screenshot({ path: path.join(OUT, 'desk-welcome.png') })
  ok('без грешки в конзолата (празен акаунт)', errors.length === 0, errors.join(' | '))
  const v = await axe(page)
  ok('axe: 0 нарушения при празен акаунт', v.length === 0, v.join(', '))
}

/* ---------- 4. Нов собственик с един имот: частично готов списък ---------- */
{
  const { page, errors } = await open(DESK)
  // един имот без снимки, без цена/сезон, без страница, без календар; без резервации и известия
  const prop = { id: '21111111-0000-4000-8000-000000000001', name: 'Вила „Тихи бряг“', base_price: 0, is_listed: false, ical_url: null }
  await page.route(/\/rest\/v1\/properties(\?|$)/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-0/1' }, body: JSON.stringify([prop]) })
  )
  for (const t of ['bookings', 'booking_requests', 'cleaning_tasks', 'booking_balances', 'property_photos', 'price_seasons', 'notification_targets']) {
    await page.route(new RegExp(`/rest/v1/${t}(\\?|$)`), emptyCount)
  }
  await page.goto(base + '/', { waitUntil: 'load' })
  await page.getByRole('heading', { name: 'Първи стъпки' }).waitFor()
  await settle(page)
  const gs = page.getByRole('region', { name: 'Първи стъпки' })
  ok('„1 от 7“ — имотът е добавен', (await gs.getByRole('progressbar').getAttribute('aria-valuenow')) === '1' && /1 от 7 стъпки са готови/.test(await gs.innerText()))
  const links = await gs.getByRole('link').evaluateAll((els) => els.map((e) => `${e.textContent.trim()}→${e.getAttribute('href')}`))
  ok('следващата стъпка е „Качи снимки“ към самия имот', links[0] === 'Качи снимки→/properties/21111111-0000-4000-8000-000000000001', links.join(' | '))
  ok('„Нова резервация“ в списъка води към /bookings?new=1', links.includes('Нова резервация→/bookings?new=1'))
  ok('„Включи известия“ → /notifications', links.includes('Включи известия→/notifications'))
  ok('двете по желание са означени', (await gs.getByText('по желание').count()) === 2)
  ok('„Всичко е наред“ при празни заявки/почиствания', /Всичко е наред — нищо не чака вас/.test(await page.locator('main').innerText()))
  const firstIsPrimary = await gs.getByRole('link').first().evaluate((e) => !e.className.includes('btn-secondary'))
  const secondIsSecondary = await gs.getByRole('link').nth(1).evaluate((e) => e.className.includes('btn-secondary'))
  ok('само следващата стъпка е основен бутон', firstIsPrimary && secondIsSecondary)
  await page.screenshot({ path: path.join(OUT, 'desk-checklist.png') })

  // свиване и запомняне
  const toggle = gs.getByRole('button', { name: 'Скрий' })
  await toggle.click()
  ok('„Скрий“ свива списъка (остава заглавие и лента)', (await gs.getByRole('listitem').count()) === 0 && (await gs.getByRole('progressbar').isVisible()))
  ok('бутонът става „Покажи“ с aria-expanded=false', (await gs.getByRole('button', { name: 'Покажи' }).getAttribute('aria-expanded')) === 'false')
  await page.reload({ waitUntil: 'load' })
  await page.getByRole('heading', { name: 'Първи стъпки' }).waitFor()
  await settle(page)
  ok('свиването се помни след презареждане', (await page.getByRole('region', { name: 'Първи стъпки' }).getByRole('listitem').count()) === 0)
  await page.getByRole('region', { name: 'Първи стъпки' }).getByRole('button', { name: 'Покажи' }).click()
  ok('„Покажи“ връща списъка', (await page.getByRole('region', { name: 'Първи стъпки' }).getByRole('listitem').count()) === 7)
  ok('без грешки в конзолата (частичен акаунт)', errors.length === 0, errors.join(' | '))
  const v = await axe(page)
  ok('axe: 0 нарушения (частичен акаунт)', v.length === 0, v.join(', '))
}

/* ---------- 5. Нисък екран: менюто бледнее и се превърта до края ---------- */
{
  const { page } = await open(DESK, { height: 640 })
  await page.goto(base + '/', { waitUntil: 'load' })
  await page.getByRole('heading', { name: 'Табло', level: 1 }).waitFor()
  await settle(page)
  const nav = page.getByRole('navigation', { name: 'Основно меню' })
  const info = await nav.evaluate((n) => ({ scroll: n.scrollHeight > n.clientHeight + 4, mask: getComputedStyle(n).maskImage || getComputedStyle(n).webkitMaskImage }))
  ok('на 640 px менюто се превърта и долният ръб бледнее', info.scroll && /gradient/.test(info.mask), JSON.stringify(info))
  await nav.evaluate((n) => (n.scrollTop = n.scrollHeight))
  await page.waitForTimeout(200)
  const end = await nav.evaluate((n) => getComputedStyle(n).maskImage || getComputedStyle(n).webkitMaskImage)
  ok('в края на превъртането бледнеенето изчезва', !/gradient/.test(end), end)
  const bottom = await nav.getByRole('link', { name: 'Правила' }).boundingBox()
  ok('„Правила“ се достига с превъртане', bottom && bottom.y + bottom.height <= 640)
}

/* ---------- 6. Телефон: без препълване, докосване ≥ 44 px, „Чака вас“ и свит списък ---------- */
{
  const { page, errors } = await open(PHONE)
  await page.goto(base + '/', { waitUntil: 'load' })
  await page.getByRole('heading', { name: 'Табло', level: 1 }).waitFor()
  await settle(page)
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  ok('няма хоризонтално препълване на 375 px', over <= 0, String(over))
  const small = await page.getByRole('region', { name: 'Чака вас' }).getByRole('link').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height < 44).length)
  ok('всички редове в „Чака вас“ са поне 44 px високи', small === 0)
  const small2 = await page.getByRole('main').getByRole('link').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height < 44 && e.getBoundingClientRect().height > 0).map((e) => e.textContent.trim().slice(0, 20)))
  ok('всички връзки на таблото са поне 44 px високи', small2.length === 0, small2.join(' | '))
  await page.screenshot({ path: path.join(OUT, 'phone-home.png') })
  const v = await axe(page)
  ok('axe: 0 нарушения на телефон', v.length === 0, v.join(', '))
  ok('без грешки в конзолата (телефон)', errors.length === 0, errors.join(' | '))
}

/* ---------- 7. Заглавие на „Имоти“ ---------- */
{
  const { page } = await open(DESK)
  await page.goto(base + '/properties', { waitUntil: 'load' })
  await page.getByRole('heading', { level: 1 }).waitFor()
  ok('страницата „Имоти“ се казва „Имоти“ (не „Поддръжка на имоти“)', (await page.getByRole('heading', { level: 1 }).innerText()) === 'Имоти')
}

for (const b of browsers) await b.close()
console.log(`home: ${pass} успешни, ${fail} провалени`)
process.exit(fail ? 1 : 0)
