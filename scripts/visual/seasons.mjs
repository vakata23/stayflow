// Сезонни цени: редактор в управлението на имота и при „Нов имот“, цена в календара, секция „Цени по сезон“ и
// най-ниска цена „от“ на страницата за гости; без таблицата (миграция 014 непусната) нищо не се показва.
//   node scripts/visual/seasons.mjs http://localhost:4174
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { USER } from './seed.mjs'

const require = createRequire(import.meta.url)
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
const base = process.argv[2] || 'http://localhost:4174'
const P1 = '21111111-0000-4000-8000-000000000001' // „Тихи бряг“: сезони Зима (1.11–31.03, 60 €, мин. 3) и Лято (1.06–30.09, 120 €, мин. 2); основна цена 87 €
const ZIMA_ID = 'e1111111-0000-4000-8000-000000000001'
const LYATO_ID = 'e1111111-0000-4000-8000-000000000002'
const COARSE = ['--blink-settings=primaryPointerType=2,availablePointerTypes=2,primaryHoverType=1,availableHoverTypes=1']
mkdirSync('scripts/visual/out', { recursive: true })
let pass = 0
let fail = 0
const ok = (name, cond, extra = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`)
}
const squash = (s) => s.replace(/\s+/g, ' ').trim()

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER.id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 86400 })}.sig`
const session = { access_token: jwt, token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: USER }

const browser = await chromium.launch({ channel: 'chrome', args: COARSE })

const MISSING_TABLE = { status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST205', message: "Could not find the table 'public.price_seasons' in the schema cache" }) }

async function open(path, width, height, { signedIn = true, missingTable = false, wait } = {}) {
  const phone = width < 900
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, locale: 'bg-BG', timezoneId: 'Europe/Sofia', deviceScaleFactor: phone ? 2 : 1 })
  if (signedIn) {
    await ctx.addInitScript((s) => {
      try { localStorage.setItem('sb-localhost-auth-token', JSON.stringify(s)); localStorage.setItem('stayflow.autoSetupSeen', '1') } catch {}
    }, session)
  }
  const page = await ctx.newPage()
  const errors = []
  const writes = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('request', (r) => {
    if (r.url().includes('/rest/v1/price_seasons') && r.method() !== 'GET') writes.push({ method: r.method(), url: decodeURIComponent(r.url()), body: r.postData() ? JSON.parse(r.postData()) : null })
  })
  if (missingTable) await page.route('**/rest/v1/price_seasons*', (route) => route.fulfill(MISSING_TABLE))
  await page.goto(base + path, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  if (wait) await page.waitForSelector(wait, { timeout: 10000 })
  await page.waitForTimeout(500)
  return { ctx, page, errors, writes }
}

const tap = async (page, locator) => {
  await locator.scrollIntoViewIfNeeded()
  const r = await locator.boundingBox()
  await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2)
  await page.waitForTimeout(200)
}
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
const axeOn = async (page, selector) => {
  await page.evaluate(axeSource)
  const res = await page.evaluate((sel) => axe.run(document.querySelector(sel), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } }), selector)
  return res.violations.map((v) => `${v.id}(${v.nodes.length}) ${v.nodes[0].target.join(' ').slice(0, 70)}`)
}

/* ============================================================ управление на имота */
for (const [w, h] of [[1440, 900], [375, 812]]) {
  const { ctx, page, errors, writes } = await open(`/properties/${P1}`, w, h, { wait: '#season-prices-title' })
  const card = page.locator('section[aria-labelledby="season-prices-title"]')
  const items = card.locator('ul > li')

  ok(`${w}: карта „Сезонни цени“ със два сезона (Зима, Лято)`, (await items.count()) === 2 && (await card.locator('h3').allTextContents()).join('|') === 'Лято|Зима')
  const info = squash(await card.innerText())
  ok(`${w}: периодите са ясни — „1 ноември – 31 март, всяка година“ и „1 юни – 30 септември“`, info.includes('1 ноември – 31 март, всяка година') && info.includes('1 юни – 30 септември, всяка година'), info.slice(0, 200))
  ok(`${w}: сезоните са по ред на годината; цени 120 (Лято) и 60 (Зима), мин. престой 2 и 3`, (await items.nth(0).getByLabel(/Цена на нощувка/).inputValue()) === '120' && (await items.nth(1).getByLabel(/Цена на нощувка/).inputValue()) === '60' && (await items.nth(0).getByLabel('Мин. нощувки').inputValue()) === '2' && (await items.nth(1).getByLabel('Мин. нощувки').inputValue()) === '3')
  ok(`${w}: казва, че извън сезоните важи основната цена 87 € и колко дни са това (92)`, /Извън сезоните важи основната цена \(87 € на нощувка\)\. Това са 92 дни/.test(info), info.slice(-160))
  ok(`${w}: „Запази сезоните“ е изключен, докато няма промяна`, await card.getByRole('button', { name: 'Запази сезоните' }).isDisabled())
  const startMonth = await items.nth(1).getByLabel('Сезон 2: начало, месец').inputValue()
  const endMonth = await items.nth(1).getByLabel('Сезон 2: край, месец').inputValue()
  ok(`${w}: Зима започва в месец 11 и свършва в месец 3 (минава през Нова година)`, startMonth === '11' && endMonth === '3')
  ok(`${w}: без препълване встрани`, !(await overflow(page)))

  // добавяне на сезон от образец, без цена → грешка и нищо не се записва
  await tap(page, card.getByRole('button', { name: /^Зима \(ноември–март\)/ }))
  ok(`${w}: образец „Зима“ добавя трети сезон с 1.11–31.03 и без цена`, (await items.count()) === 3 && (await items.nth(2).getByLabel(/Цена на нощувка/).inputValue()) === '')
  ok(`${w}: застъпване със „Зима“ се показва като съобщение`, /Застъпва се със „Зима“ \(1 ноември – 31 март\)/.test(await items.nth(2).innerText()) && /Застъпва се със „Зима“ \(1 ноември – 31 март\)/.test(await items.nth(1).innerText()))
  await tap(page, card.getByRole('button', { name: 'Запази сезоните' }))
  const err1 = squash(await card.innerText())
  ok(`${w}: запис без цена → „Въведете цена на нощувка“ и общо съобщение; нищо не е изпратено`, /Въведете цена на нощувка/.test(err1) && /Поправете отбелязаните сезони/.test(err1) && writes.length === 0, `записи: ${writes.length}`)
  const axeErr = await axeOn(page, 'section[aria-labelledby="season-prices-title"]')
  ok(`${w}: axe на картата (със съобщения за грешка) — 0 нарушения`, axeErr.length === 0, axeErr.join(' | '))
  await page.screenshot({ path: `scripts/visual/out/seasons-owner-${w}.png`, fullPage: false })

  // невалиден ден
  await items.nth(2).getByLabel(/Цена на нощувка/).fill('55')
  await items.nth(2).getByLabel('Сезон 3: начало, месец').selectOption('2')
  await items.nth(2).getByLabel('Сезон 3: начало, ден от месеца').fill('30')
  await tap(page, card.getByRole('button', { name: 'Запази сезоните' }))
  ok(`${w}: 30 февруари → „В този месец няма 30-и ден“`, /В този месец няма 30-и ден/.test(await items.nth(2).innerText()) && writes.length === 0)

  // валиден нов сезон → един POST
  await items.nth(2).getByLabel('Сезон 3: начало, месец').selectOption('11')
  await items.nth(2).getByLabel('Сезон 3: начало, ден от месеца').fill('1')
  await tap(page, card.getByRole('button', { name: 'Запази сезоните' }))
  await page.waitForTimeout(400)
  const posts = writes.filter((x) => x.method === 'POST')
  ok(`${w}: валиден нов сезон → един POST с правилните полета`, posts.length === 1 && writes.length === 1 && Array.isArray(posts[0].body) && posts[0].body.length === 1 && posts[0].body[0].property_id === P1 && posts[0].body[0].name === 'Зима' && posts[0].body[0].start_month === 11 && posts[0].body[0].start_day === 1 && posts[0].body[0].end_month === 3 && posts[0].body[0].price_per_night === 55 && posts[0].body[0].min_nights === 1, JSON.stringify(posts[0]?.body))
  ok(`${w}: след записа се показва „Сезоните са записани.“`, /Сезоните са записани/.test(await card.innerText()))
  writes.length = 0

  // промяна на цена → един PATCH само за този сезон
  await items.nth(1).getByLabel(/Цена на нощувка/).fill('65')
  ok(`${w}: след промяна „Запази сезоните“ се включва и се вижда „незаписани промени“`, (await card.getByRole('button', { name: 'Запази сезоните' }).isEnabled()) && /незаписани промени/.test(await card.innerText()))
  await tap(page, card.getByRole('button', { name: 'Запази сезоните' }))
  await page.waitForTimeout(400)
  ok(`${w}: промяна на цената → един PATCH (само променения сезон), без POST/DELETE`, writes.length === 1 && writes[0].method === 'PATCH' && writes[0].url.includes(`id=eq.${ZIMA_ID}`) && writes[0].body.price_per_night === 65 && writes[0].body.name === 'Зима', JSON.stringify(writes))
  writes.length = 0

  // премахване → DELETE
  await tap(page, card.getByRole('button', { name: 'Премахни сезон Лято' }))
  ok(`${w}: „Премахни“ маха реда от списъка (още не от базата)`, (await items.count()) === 1 && writes.length === 0)
  await tap(page, card.getByRole('button', { name: 'Запази сезоните' }))
  await page.waitForTimeout(400)
  ok(`${w}: запис след премахване → DELETE на Лято`, writes.length === 1 && writes[0].method === 'DELETE' && writes[0].url.includes(LYATO_ID), JSON.stringify(writes))
  ok(`${w}: без грешки в конзолата`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

/* ============================================================ без таблицата (миграцията още не е пусната) */
{
  const { ctx, page, errors } = await open(`/properties/${P1}`, 1440, 900, { missingTable: true, wait: 'h2' })
  await page.waitForTimeout(800)
  const heads = await page.evaluate(() => [...document.querySelectorAll('h2')].map((h) => h.textContent.trim()))
  ok('без таблицата: картата „Сезонни цени“ не се показва, останалите карти работят', !heads.includes('Сезонни цени') && heads.includes('Настройки на имота'), heads.join(' | '))
  ok('без таблицата: без грешки в конзолата', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

/* ============================================================ нов имот */
for (const [w, h] of [[1440, 900], [375, 812]]) {
  const { ctx, page, errors, writes } = await open('/properties/new', w, h, { wait: '#new-seasons-title' })
  const posts = []
  await page.route('**/rest/v1/properties*', async (route) => {
    const req = route.request()
    if (req.method() === 'POST') {
      posts.push(JSON.parse(req.postData()))
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'nov-imot-id' }) })
    }
    return route.fallback()
  })
  await page.route('**/rest/v1/property_settings*', (route) => (route.request().method() === 'GET' ? route.fallback() : route.fulfill({ status: 201, contentType: 'application/json', body: '' })))

  const form = page.locator('form')
  const text0 = squash(await form.innerText())
  ok(`${w}: „Нов имот“ има раздел „Сезонни цени (по избор)“, бутони за образци и „Основна цена“`, /Сезонни цени \(по избор\)/.test(text0) && /Основна цена \(€\/нощ\)/.test(text0) && /Зима \(ноември–март\)/.test(text0) && /Лято \(юни–септември\)/.test(text0) && /Друг период/.test(text0), text0.slice(0, 160))
  ok(`${w}: без препълване встрани`, !(await overflow(page)))
  await form.getByLabel(/Име на имота/).fill('Вила Тест')
  await form.getByLabel(/Основна цена/).fill('70')
  await tap(page, form.getByRole('button', { name: /^Лято \(юни–септември\)/ }))
  await tap(page, form.getByRole('button', { name: 'Напред — снимки' }))
  ok(`${w}: сезон без цена блокира създаването („Поправете отбелязаните…“), нищо не е изпратено`, /Поправете отбелязаните сезонни цени/.test(await form.innerText()) && posts.length === 0 && writes.length === 0)
  const axeNew = await axeOn(page, 'form')
  ok(`${w}: axe на формата „Нов имот“ (със сезон и съобщение) — 0 нарушения`, axeNew.length === 0, axeNew.join(' | '))
  await form.getByLabel(/Цена на нощувка/).fill('140')
  await form.getByLabel('Име на сезона (по избор)').fill('Високо лято')
  await tap(page, form.getByRole('button', { name: 'Напред — снимки' }))
  await page.waitForURL('**/properties/nov-imot-id/setup', { timeout: 8000 }).catch(() => {})
  ok(`${w}: след създаване води към снимките на новия имот`, page.url().endsWith('/properties/nov-imot-id/setup'), page.url())
  ok(`${w}: имотът е създаден и сезонът е записан с id на новия имот (POST price_seasons)`, posts.length === 1 && writes.length === 1 && writes[0].method === 'POST' && writes[0].body[0].property_id === 'nov-imot-id' && writes[0].body[0].name === 'Високо лято' && writes[0].body[0].start_month === 6 && writes[0].body[0].end_month === 9 && writes[0].body[0].end_day === 30 && writes[0].body[0].price_per_night === 140, JSON.stringify(writes[0]?.body))
  await page.screenshot({ path: `scripts/visual/out/seasons-new-${w}.png` })
  ok(`${w}: без грешки в конзолата`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}
{
  const { ctx, page } = await open('/properties/new', 1440, 900, { missingTable: true, wait: 'form' })
  await page.waitForTimeout(600)
  const t = squash(await page.locator('form').innerText())
  ok('„Нов имот“ без таблицата: няма сезони, цената си е „Цена от (€/нощ)“', !/Сезонни цени/.test(t) && /Цена от \(€\/нощ\)/.test(t), t.slice(0, 140))
  await ctx.close()
}

/* ============================================================ календар на собственика */
{
  const { ctx, page } = await open('/calendar', 1440, 900, { wait: 'select[aria-label="Имот"]' })
  await page.locator('select[aria-label="Имот"]').selectOption(P1)
  await page.waitForTimeout(500)
  const month = async () => squash(await page.locator('span.text-base.font-bold').first().innerText())
  const goTo = async (name) => {
    for (let i = 0; i < 14 && !(await month()).startsWith(name); i++) {
      await tap(page, page.getByRole('button', { name: 'Следващ месец' }))
      await page.waitForTimeout(250)
    }
    await page.waitForTimeout(400)
  }
  const badges = (price) => page.evaluate((p) => [...document.querySelectorAll('span.rounded.bg-accent-soft')].filter((e) => e.textContent.trim() === p + ' €').length, price)
  const MONTHS = ['Януари', 'Февруари', 'Март', 'Април', 'Май', 'Юни', 'Юли', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември']
  const allBadges = () => page.evaluate(() => [...document.querySelectorAll('span.rounded.bg-accent-soft')].length)
  // правилата за конкретни дати в макета покриват −60…+120 дни и бият сезона — отиваме 5 месеца напред, където ги няма
  for (let i = 0; i < 5; i++) { await tap(page, page.getByRole('button', { name: 'Следващ месец' })); await page.waitForTimeout(250) }
  let checked = 0
  let bad = []
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(450)
    const name = (await month()).split(' ')[0]
    const m = MONTHS.indexOf(name) + 1
    const want = [11, 12, 1, 2, 3].includes(m) ? 60 : [6, 7, 8, 9].includes(m) ? 120 : null
    const got = want ? await badges(want) : await allBadges()
    if (want ? got < 28 : got !== 0) bad.push(`${await month()}: ${got}`)
    checked++
    await tap(page, page.getByRole('button', { name: 'Следващ месец' }))
  }
  ok('календар: в 8 поредни месеца — зима показва „60 €“ на всеки ден, лято „120 €“, а април/май/октомври (извън сезон) — нищо', checked === 8 && bad.length === 0, bad.join(' | '))
  await ctx.close()
}

/* ============================================================ ценови планове */
{
  const { ctx, page } = await open('/pricing', 1440, 900, { wait: 'h1' })
  const t = squash(await page.evaluate(() => document.body.innerText))
  ok('Ценови планове: обяснява, че сезоните са в управлението на имота', /Цените по сезони, които се повтарят всяка година, са в управлението на имота/.test(t))
  await ctx.close()
}

/* ============================================================ страница за гости */
for (const [w, h] of [[1440, 900], [375, 812]]) {
  const phone = w < 900
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: phone, hasTouch: phone, locale: 'bg-BG', timezoneId: 'Europe/Sofia', deviceScaleFactor: phone ? 2 : 1 })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${base}/stay/tihi-bryag`, { waitUntil: 'load' })
  await page.waitForSelector('.stay-seasons')
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(500)
  const rows = await page.evaluate(() => [...document.querySelectorAll('.stay-seasons li')].map((li) => li.textContent.replace(/\s+/g, ' ').trim()))
  ok(`${w}: „Цени по сезон“ — Зима, Лято и „Останалите дати“`, rows.length === 3, rows.join(' || '))
  ok(`${w}: редовете са по ред на годината (Лято от юни, Зима от ноември) с цени и мин. престой`, /Лято.*1 юни – 30 септември.*мин\. 2 нощувки.*120 €/.test(rows[0]) && /Зима.*1 ноември – 31 март.*мин\. 3 нощувки.*60 €/.test(rows[1]) && /Останалите дати.*87 €/.test(rows[2]), rows.join(' || '))
  const price = await page.evaluate(() => ({ head: document.querySelector('.stay-price')?.textContent.replace(/\s+/g, ' ').trim(), bar: document.querySelector('.stay-bar b')?.textContent.trim() }))
  ok(`${w}: заглавната цена е най-ниската — „от 60 € / нощувка“, лентата на телефон — 60 €`, /от\s*60 €\s*\/ нощувка/.test(price.head) && price.bar === '60 €', JSON.stringify(price))
  const order = await page.evaluate(() => { const y = (el) => el.getBoundingClientRect().top + scrollY; const secs = [...document.querySelectorAll('.stay-sec')]; const find = (t) => secs.find((s) => s.querySelector('h2')?.textContent.startsWith(t)); return { avail: y(find('Наличност')), seasons: y(find('Цени по сезон')), card: y(document.getElementById('quote-section')), rules: y(find('Правила')) } })
  ok(`${w}: „Цени по сезон“ е след „Наличност“ и преди правилата${phone ? ' и картата за резервация' : ''}`, order.avail < order.seasons && order.seasons < order.rules && (!phone || order.seasons < order.card), JSON.stringify(order))
  ok(`${w}: без препълване встрани, без грешки`, !(await overflow(page)) && errors.length === 0, errors.join(' | '))
  await page.screenshot({ path: `scripts/visual/out/seasons-guest-${w}.png` })
  await ctx.close()
}
for (const [code, probe] of [
  ['en', ['Prices by season', '1 November – 31 March · min. 3 nights', 'Other dates', '60 € / night']],
  ['ro', ['Prețuri pe sezon', '1 noiembrie – 31 martie', 'min. 3 nopți', 'Restul datelor']],
  ['el', ['Τιμές ανά περίοδο', '1 Νοεμβρίου – 31 Μαρτίου', 'Υπόλοιπες ημερομηνίες']],
  ['sr-latn', ['Cene po sezonama', '1. novembar – 31. mart', 'Ostali datumi']],
  ['mk', ['Цени по сезони', '1 ноември – 31 март', 'Останатите датуми']],
]) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, locale: 'bg-BG', deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.goto(`${base}/stay/tihi-bryag?lang=${code}`, { waitUntil: 'load' })
  await page.waitForSelector('.stay-seasons')
  await page.waitForTimeout(400)
  const t = squash(await page.evaluate(() => document.querySelector('.stay-seasons').closest('.stay-sec').innerText))
  const miss = probe.filter((s) => !t.includes(s))
  ok(`цени по сезон на ${code}: ${probe.length} израза на езика на госта`, miss.length === 0, `${miss.join(' | ')} ← ${t.slice(0, 200)}`)
  ok(`цени по сезон на ${code}: без препълване встрани`, !(await overflow(page)))
  await ctx.close()
}
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'bg-BG' })
  const page = await ctx.newPage()
  await page.goto(`${base}/stay/bez-snimki`, { waitUntil: 'load' })
  await page.waitForSelector('h1')
  await page.waitForTimeout(500)
  ok('имот без сезони: секцията „Цени по сезон“ не се показва, цената си остава „от 87 €“', (await page.locator('.stay-seasons').count()) === 0 && /87 €/.test(await page.locator('.stay-price').innerText()))
  await ctx.close()
}

// миграцията още не е пусната: функцията public_seasons я няма — страницата за гости работи както преди
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'bg-BG' })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.route('**/rpc/public_seasons', (route) => route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST202', message: 'Could not find the function public.public_seasons(p_slug) in the schema cache' }) }))
  await page.goto(`${base}/stay/tihi-bryag`, { waitUntil: 'load' })
  await page.waitForSelector('h1')
  await page.waitForSelector('.stay-month')
  await page.waitForTimeout(500)
  ok('без функцията public_seasons (014 непусната): страницата работи, няма секция за сезони, цената е основната „от 87 €“', (await page.locator('.stay-seasons').count()) === 0 && /от\s*87 €/.test(await page.locator('.stay-price').innerText()) && errors.length === 0, errors.join(' | '))
  await ctx.close()
}

await browser.close()
console.log(`\n${pass} успешни, ${fail} провалени\n`)
process.exit(fail ? 1 : 0)
