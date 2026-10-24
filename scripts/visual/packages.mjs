// Пакети и оферти за престой („6+1“ и др.): редактор в управлението на имота (добавяне, промяна, премахване, грешки),
// раздел „Оферти“ и ред „Оферта“ в сметката на страницата за гости на няколко езика, без таблицата/функцията нищо не се показва.
//   node scripts/visual/packages.mjs http://localhost:4174
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { USER } from './seed.mjs'

const require = createRequire(import.meta.url)
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
const base = process.argv[2] || 'http://localhost:4174'
const P1 = '21111111-0000-4000-8000-000000000001' // „Тихи бряг“: оферти „6+1“, „Месец“ (−25% от 30 нощувки), „Уикенд“ (2 нощувки за 150 при настаняване в петък); основна цена 87 €
const PKG = (n) => `f1111111-0000-4000-8000-00000000000${n}`
const COARSE = ['--blink-settings=primaryPointerType=2,availablePointerTypes=2,primaryHoverType=1,availableHoverTypes=1']
mkdirSync('scripts/visual/out', { recursive: true })
let pass = 0
let fail = 0
const ok = (name, cond, extra = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`)
}
const squash = (s) => s.replace(/\s+/g, ' ').trim()
const plus = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER.id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 86400 })}.sig`
const session = { access_token: jwt, token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: USER }
const browser = await chromium.launch({ channel: 'chrome', args: COARSE })
const MISSING_TABLE = { status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST205', message: "Could not find the table 'public.stay_packages' in the schema cache" }) }

async function open(path, width, height, { missingTable = false, wait } = {}) {
  const phone = width < 900
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, locale: 'bg-BG', timezoneId: 'Europe/Sofia', deviceScaleFactor: phone ? 2 : 1 })
  await ctx.addInitScript((s) => {
    try { localStorage.setItem('sb-localhost-auth-token', JSON.stringify(s)); localStorage.setItem('stayflow.autoSetupSeen', '1') } catch {}
  }, session)
  const page = await ctx.newPage()
  const errors = []
  const writes = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('request', (r) => {
    if (r.url().includes('/rest/v1/stay_packages') && r.method() !== 'GET') writes.push({ method: r.method(), url: decodeURIComponent(r.url()), body: r.postData() ? JSON.parse(r.postData()) : null })
  })
  if (missingTable) await page.route('**/rest/v1/stay_packages*', (route) => route.fulfill(MISSING_TABLE))
  await page.goto(base + path, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  if (wait) await page.waitForSelector(wait, { timeout: 10000 })
  await page.waitForTimeout(500)
  return { ctx, page, errors, writes }
}
const tap = async (page, locator) => {
  await locator.evaluate((el) => el.scrollIntoView({ block: 'center' })) // по средата — далеч от плаващата лента на телефон
  await page.waitForTimeout(100)
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
  const { ctx, page, errors, writes } = await open(`/properties/${P1}`, w, h, { wait: '#packages-title' })
  const card = page.locator('section[aria-labelledby="packages-title"]')
  const items = card.locator('ul > li')
  const titles = await card.locator('h3').allTextContents()
  ok(`${w}: карта „Пакети и оферти“ с три оферти (6+1, Месец, Уикенд)`, (await items.count()) === 3 && titles.map((x) => x.trim()).join('|') === '6+1|Месец|Уикенд', titles.join('|'))
  const text = squash(await card.innerText())
  ok(`${w}: описанията са ясни — „Платете 6 нощувки, останете 7 нощувки“, „−25% при престой от 30 нощувки нагоре“, „2 нощувки за 150 € · настаняване в петък“`, text.includes('Платете 6 нощувки, останете 7 нощувки') && text.includes('−25% при престой от 30 нощувки нагоре') && text.includes('2 нощувки за 150 € · настаняване в петък'), text.slice(0, 260))
  ok(`${w}: пример при цена 87 €: „7 нощувки по 87.00 € — плащате 522.00 € вместо 609.00 €“`, text.includes('Пример: 7 нощувки по 87.00 € — плащате 522.00 € вместо 609.00 €.'), text.match(/Пример[^.]*\.\d\d[^.]*\./)?.[0])
  ok(`${w}: образци: 6+1, Седмица −10%, Месец −25%, Ранно записване −10%, Последна минута −15% и „Друга оферта“`, await Promise.all(['6+1', 'Седмица −10%', 'Месец −25%', 'Ранно записване −10%', 'Последна минута −15%', 'Друга оферта'].map(async (n) => (await card.getByRole('button', { name: n, exact: true }).count()) === 1)).then((a) => a.every(Boolean)))
  ok(`${w}: „Запази офертите“ е изключен, докато няма промяна`, await card.getByRole('button', { name: 'Запази офертите' }).isDisabled())
  ok(`${w}: без препълване встрани`, !(await overflow(page)))

  // добавяне на образец „Ранно записване“
  await tap(page, card.getByRole('button', { name: 'Ранно записване −10%', exact: true }))
  ok(`${w}: образец „Ранно записване“ добавя четвърта оферта с 30 дни и 10%`, (await items.count()) === 4 && (await items.nth(3).getByLabel(/Резервация поне колко дни/).inputValue()) === '30' && (await items.nth(3).getByLabel('Отстъпка (%)').inputValue()) === '10')
  // грешка: празен процент
  await items.nth(3).getByLabel('Отстъпка (%)').fill('')
  await tap(page, card.getByRole('button', { name: 'Запази офертите' }))
  ok(`${w}: празна отстъпка → „Отстъпката е между 0 и 90%“ и нищо не се записва`, /Отстъпката е между 0 и 90%/.test(await items.nth(3).innerText()) && /Поправете отбелязаните оферти/.test(await card.innerText()) && writes.length === 0)
  const axeErr = await axeOn(page, 'section[aria-labelledby="packages-title"]')
  ok(`${w}: axe на картата (със съобщения за грешка) — 0 нарушения`, axeErr.length === 0, axeErr.join(' | '))
  await page.screenshot({ path: `scripts/visual/out/packages-owner-${w}.png` })
  // смяна на вида на тази оферта показва другите полета
  await items.nth(3).getByLabel('Вид оферта').selectOption('fixed_price')
  ok(`${w}: при „Фиксирана цена“ има нощувки, обща цена и ден на настаняване`, (await items.nth(3).getByLabel(/Брой нощувки/).count()) === 1 && (await items.nth(3).getByLabel(/Обща цена/).count()) === 1 && (await items.nth(3).getByLabel('Настаняване в ден').count()) === 1)
  await tap(page, card.getByRole('button', { name: 'Запази офертите' }))
  ok(`${w}: фиксирана цена без сума → „Въведете обща цена за престоя“`, /Въведете обща цена за престоя/.test(await items.nth(3).innerText()) && writes.length === 0)
  // валидна оферта: последна минута
  await items.nth(3).getByLabel('Вид оферта').selectOption('last_minute')
  await items.nth(3).getByLabel(/Настаняване до колко дни/).fill('3')
  await items.nth(3).getByLabel('Отстъпка (%)').fill('15')
  await items.nth(3).getByLabel('Име (по избор)').fill('Днес-утре')
  await tap(page, card.getByRole('button', { name: 'Запази офертите' }))
  await page.waitForTimeout(400)
  const posts = writes.filter((x) => x.method === 'POST')
  const b = posts[0]?.body?.[0]
  ok(`${w}: валидна оферта → един POST само с полетата на вида (последна минута: 3 дни, 15%)`, posts.length === 1 && writes.length === 1 && b?.kind === 'last_minute' && b.days_before === 3 && b.percent === 15 && b.name === 'Днес-утре' && b.property_id === P1 && b.paid_nights === null && b.fixed_total === null && b.min_nights === null && b.repeat_block === false && b.is_active === true, JSON.stringify(posts[0]?.body))
  ok(`${w}: след записа — „Офертите са записани.“`, /Офертите са записани/.test(await card.innerText()))
  writes.length = 0

  // промяна на процента на „Месец“ → един PATCH за нея
  await items.nth(1).getByLabel('Отстъпка (%)').fill('30')
  await tap(page, card.getByRole('button', { name: 'Запази офертите' }))
  await page.waitForTimeout(400)
  ok(`${w}: промяна на процента → един PATCH само за „Месец“`, writes.length === 1 && writes[0].method === 'PATCH' && writes[0].url.includes(`id=eq.${PKG(2)}`) && writes[0].body.percent === 30 && writes[0].body.kind === 'percent_off' && writes[0].body.min_nights === 30, JSON.stringify(writes))
  writes.length = 0

  // изключване показва значка и се записва
  await items.nth(0).getByLabel('Офертата е включена').uncheck()
  ok(`${w}: изключената оферта получава значка „Изключена“`, /Изключена/.test(await items.nth(0).locator('h3').innerText()))
  await tap(page, card.getByRole('button', { name: 'Запази офертите' }))
  await page.waitForTimeout(400)
  ok(`${w}: изключването е PATCH с is_active=false`, writes.length === 1 && writes[0].method === 'PATCH' && writes[0].url.includes(PKG(1)) && writes[0].body.is_active === false && writes[0].body.paid_nights === 6, JSON.stringify(writes))
  writes.length = 0

  // премахване
  await tap(page, card.getByRole('button', { name: 'Премахни офертата Уикенд' }))
  ok(`${w}: „Премахни“ маха реда (още не от базата)`, (await items.count()) === 2 && writes.length === 0)
  await tap(page, card.getByRole('button', { name: 'Запази офертите' }))
  await page.waitForTimeout(400)
  ok(`${w}: записът след премахване → DELETE на „Уикенд“`, writes.length === 1 && writes[0].method === 'DELETE' && writes[0].url.includes(PKG(3)), JSON.stringify(writes))
  ok(`${w}: без грешки в конзолата`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

/* ============================================================ без таблицата (015 непусната) */
{
  const { ctx, page, errors } = await open(`/properties/${P1}`, 1440, 900, { missingTable: true, wait: 'h2' })
  await page.waitForTimeout(800)
  const heads = await page.evaluate(() => [...document.querySelectorAll('h2')].map((h) => h.textContent.trim()))
  ok('без таблицата: картата „Пакети и оферти“ не се показва, останалите карти работят', !heads.includes('Пакети и оферти') && heads.includes('Настройки на имота'), heads.join(' | '))
  ok('без таблицата: без грешки в конзолата', errors.length === 0, errors.join(' | '))
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
  await page.waitForSelector('.stay-offers')
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(500)
  const cards = await page.evaluate(() => [...document.querySelectorAll('.stay-offers li')].map((li) => li.innerText.replace(/\s+/g, ' ').trim()))
  ok(`${w}: „Оферти“ — три карти: „6+1“, „Месец“, „Уикенд“ с подробности`, cards.length === 3 && /^6\+1 Платете 6 нощувки, останете 7 нощувки$/.test(cards[0]) && /^Месец −25% при престой от 30 нощувки нагоре$/.test(cards[1]) && /^Уикенд 2 нощувки за 150 € Ден на настаняване: петък$/.test(cards[2]), cards.join(' || '))
  const order = await page.evaluate(() => { const y = (el) => el.getBoundingClientRect().top + scrollY; const secs = [...document.querySelectorAll('.stay-sec')]; const find = (t) => secs.find((s) => s.querySelector('h2')?.textContent.startsWith(t)); return { seasons: y(find('Цени по сезон')), offers: y(find('Оферти')), rules: y(find('Правила')), card: y(document.getElementById('quote-section')) } })
  ok(`${w}: „Оферти“ е след „Цени по сезон“ и преди правилата${phone ? ' и картата за резервация' : ''}`, order.seasons < order.offers && order.offers < order.rules && (!phone || order.offers < order.card), JSON.stringify(order))
  ok(`${w}: бележка „най-изгодната — отстъпките не се събират“ (има повече от една оферта)`, /отстъпките не се събират/.test(await page.locator('.stay-sec', { has: page.locator('.stay-offers') }).innerText()))

  // сметка: 7 нощувки → „6+1“ = −87.00 €
  await page.locator('.stay-booking input[type="date"]').nth(0).fill(plus(40))
  await page.locator('.stay-booking input[type="date"]').nth(1).fill(plus(47))
  await page.getByRole('button', { name: 'Провери цена' }).click()
  await page.waitForSelector('.stay-quote')
  const q = squash(await page.evaluate(() => document.querySelector('.stay-quote').textContent))
  ok(`${w}: 7 нощувки → ред „Оферта „6+1“ −87.00 €“, общо 547.00 € (609 − 87 + 25)`, /Оферта „6\+1“−87\.00 €/.test(q.replace(/\s/g, '')) || /Оферта „6\+1“ ?−87\.00 €/.test(q), q.slice(0, 220))
  ok(`${w}: общата сума е 547.00 €, а настаняването остава 609.00 € (преди отстъпката)`, /547\.00 €/.test(q) && /609\.00 €/.test(q), q.slice(0, 220))
  await page.screenshot({ path: `scripts/visual/out/packages-guest-${w}.png` })
  // 3 нощувки — няма подходяща оферта
  await page.locator('.stay-booking input[type="date"]').nth(1).fill(plus(43))
  await page.getByRole('button', { name: 'Провери цена' }).click()
  await page.waitForTimeout(500)
  ok(`${w}: 3 нощувки — без ред „Оферта“ и без отстъпка (общо 286.00 €)`, (await page.locator('.stay-line--offer').count()) === 0 && /286\.00 €/.test(squash(await page.evaluate(() => document.querySelector('.stay-quote').textContent))))
  ok(`${w}: без препълване встрани, без грешки`, !(await overflow(page)) && errors.length === 0, errors.join(' | '))
  await ctx.close()
}

for (const [code, probe, offerLine] of [
  ['en', ['Offers', 'Pay for 6 nights, stay 7 nights', '25% off stays of 30 nights or more', '2 nights for 150 €', 'Check-in day: Friday'], 'Offer “6+1”'],
  ['ro', ['Oferte', 'Plătiți 6 nopți, rămâneți 7 nopți', '−25% pentru sejururi de 30 de nopți sau mai mult', '2 nopți pentru 150 €', 'Ziua de sosire: vineri'], 'Ofertă „6+1”'],
  ['el', ['Προσφορές', 'Πληρώστε 6 διανυκτερεύσεις, μείνετε 7 διανυκτερεύσεις', '−25% για διαμονή 30 διανυκτερεύσεις και άνω', '2 διανυκτερεύσεις για 150 €', 'Ημέρα άφιξης: Παρασκευή'], 'Προσφορά «6+1»'],
  ['sr-latn', ['Ponude', 'Platite 6 noćenja, boravite 7 noćenja', '−25% pri boravku od 30 noćenja ili više', '2 noćenja za 150 €', 'Dan dolaska: petak'], 'Ponuda „6+1“'],
  ['mk', ['Понуди', 'Платете 6 ноќевања, останете 7 ноќевања', '−25% при престој од 30 ноќевања нагоре', '2 ноќевања за 150 €', 'Ден на пристигнување'], 'Понуда „6+1“'],
]) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, locale: 'bg-BG', deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.goto(`${base}/stay/tihi-bryag?lang=${code}`, { waitUntil: 'load' })
  await page.waitForSelector('.stay-offers')
  await page.waitForTimeout(400)
  const t = squash(await page.evaluate(() => document.querySelector('.stay-offers').closest('.stay-sec').innerText))
  const miss = probe.filter((s) => !t.toLowerCase().includes(s.toLowerCase()))
  ok(`оферти на ${code}: ${probe.length} израза на езика на госта`, miss.length === 0, `${miss.join(' | ')} ← ${t.slice(0, 260)}`)
  await page.locator('.stay-booking input[type="date"]').nth(0).fill(plus(40))
  await page.locator('.stay-booking input[type="date"]').nth(1).fill(plus(47))
  await page.locator('.stay-booking .stay-btn').first().click()
  await page.waitForSelector('.stay-quote')
  const line = squash(await page.evaluate(() => document.querySelector('.stay-line--offer')?.textContent ?? ''))
  ok(`оферти на ${code}: редът в сметката е „${offerLine} −87.00 €“`, line.startsWith(offerLine) && line.includes('87.00 €'), line)
  ok(`оферти на ${code}: без препълване встрани`, !(await overflow(page)))
  await ctx.close()
}

// без функцията public_packages (015 непусната) — страницата работи както преди
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'bg-BG' })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.route('**/rpc/public_packages', (route) => route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST202', message: 'Could not find the function public.public_packages(p_slug) in the schema cache' }) }))
  await page.goto(`${base}/stay/tihi-bryag`, { waitUntil: 'load' })
  await page.waitForSelector('h1')
  await page.waitForSelector('.stay-month')
  await page.waitForTimeout(500)
  ok('без функцията public_packages (015 непусната): страницата работи, няма секция „Оферти“', (await page.locator('.stay-offers').count()) === 0 && errors.length === 0, errors.join(' | '))
  await ctx.close()
}
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'bg-BG' })
  const page = await ctx.newPage()
  await page.goto(`${base}/stay/bez-snimki`, { waitUntil: 'load' })
  await page.waitForSelector('h1')
  await page.waitForTimeout(500)
  ok('имот без оферти: секцията „Оферти“ не се показва', (await page.locator('.stay-offers').count()) === 0)
  await ctx.close()
}

await browser.close()
console.log(`\n${pass} успешни, ${fail} провалени\n`)
process.exit(fail ? 1 : 0)
