// Платен достъп: продажбена страница „/“ (цени, калкулатор, въпроси, залепена лента), форма „Заяви достъп“,
// екрани „на пауза“ (чака активиране / изтекъл / спрян / изтича скоро), администраторски екран „Клиенти“,
// отворено при липсваща миграция 016.   node scripts/visual/access.mjs http://localhost:4175
import { chromium } from 'playwright'
import { USER } from './seed.mjs'

const base = process.argv[2] || 'http://localhost:4175'
let pass = 0
let fail = 0
const ok = (name, cond, extra = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`)
}
const jwt = () => {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b({ alg: 'HS256', typ: 'JWT' })}.${b({ sub: USER.id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 86400 })}.sig`
}
const session = { access_token: jwt(), token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: USER }
const mock = (state) => fetch(`${base}/__mock/access?state=${state}`).then((r) => r.json())
const sent = () => fetch(`${base}/__mock/requests`).then((r) => r.json())
const grants = () => fetch(`${base}/__mock/grants`).then((r) => r.json())

const browser = await chromium.launch({ channel: 'chrome' })
async function open(width, { logged = false, height = 844 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, locale: 'bg-BG', timezoneId: 'Europe/Sofia' })
  await ctx.addInitScript(
    ([s, logged]) => {
      try {
        localStorage.setItem('stayflow.consent', JSON.stringify({ v: 1, choice: 'necessary', at: new Date().toISOString() }))
        if (logged) {
          localStorage.setItem('sb-localhost-auth-token', JSON.stringify(s))
          localStorage.setItem('stayflow.autoSetupSeen', '1')
        }
      } catch {}
    },
    [session, logged]
  )
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  return { ctx, page, errors }
}
const go = async (page, route, wait = 1000) => {
  await page.goto(base + route, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready).catch(() => {})
  await page.waitForTimeout(wait)
}
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

await mock('active')

/* ---------------- продажбената страница ---------------- */
for (const width of [360, 390, 768, 1440]) {
  const { ctx, page, errors } = await open(width, { height: width >= 1000 ? 900 : 844 })
  await go(page, '/')
  ok(`/ @${width}: един h1 с ползата`, (await page.locator('h1').count()) === 1 && /Резервациите от Airbnb и Booking на едно място/.test(await page.locator('h1').innerText()))
  ok(`/ @${width}: няма хоризонтално препълване`, (await overflow(page)) <= 0, String(await overflow(page)))
  const txt = await page.innerText('body')
  ok(`/ @${width}: цените 9 / 19 / 39 € на месец и годишните 90 / 190 / 390 €`, /9 €\s*\/ месец/.test(txt) && /19 €\s*\/ месец/.test(txt) && /39 €\s*\/ месец/.test(txt) && /90 € на година/.test(txt) && /190 € на година/.test(txt) && /390 € на година/.test(txt))
  ok(`/ @${width}: няма „Създай профил“ и няма „безплатен профил“`, !/Създай профил/i.test(txt) && !/безплатен профил/i.test(txt))
  ok(`/ @${width}: бутоните „Заяви достъп“ водят към /access`, (await page.locator('a[href="/access"]').count()) >= 3)
  ok(`/ @${width}: пакетите водят към /access?plan=…`, (await page.locator('a[href="/access?plan=start"], a[href="/access?plan=plus"], a[href="/access?plan=pro"]').count()) === 3)
  const sticky = await page.locator('.lp-sticky').isVisible()
  const fab = await page.locator('.lp-fab').isVisible()
  ok(`/ @${width}: ${width < 900 ? 'залепена лента на телефон, без плаващ Viber' : 'плаващ Viber на компютър, без лента'}`, width < 900 ? sticky && !fab : !sticky && fab, `лента ${sticky}, viber ${fab}`)
  if (width === 390) {
    const hero = await page.evaluate(() => {
      const b = [...document.querySelectorAll('.demo-hero__row a')][0].getBoundingClientRect()
      return { bottom: Math.round(b.bottom), vh: innerHeight }
    })
    ok('/ @390: основният бутон се вижда без превъртане', hero.bottom < hero.vh - 70, JSON.stringify(hero))
    const small = await page.evaluate(() => [...document.querySelectorAll('.lp a.stay-btn, .lp a.stay-btn-outline, .lp button, .lp summary')].filter((e) => e.offsetParent !== null).map((e) => ({ t: e.textContent.trim().slice(0, 20), h: e.getBoundingClientRect().height })).filter((x) => x.h < 44))
    ok('/ @390: бутоните и въпросите са ≥ 44 px', small.length === 0, JSON.stringify(small.slice(0, 3)))
  }
  const links = await page.evaluate(() => [...document.querySelectorAll('a')].map((a) => a.getAttribute('href')))
  ok(`/ @${width}: Viber, телефон, имейл и правните връзки`, links.includes('viber://chat?number=%2B359899140113') && links.includes('tel:+359899140113') && links.some((h) => /^mailto:ivan2002momchilov@gmail\.com/.test(h ?? '')) && links.includes('/privacy') && links.includes('/terms'))
  ok(`/ @${width}: няма JS грешки`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

/* ---------------- калкулатор и въпроси ---------------- */
{
  const { ctx, page } = await open(1440, { height: 900 })
  await go(page, '/')
  const out = page.locator('.lp-calc__out')
  ok('калкулатор: 18 × 70 € × 15% = 189 € на месец и ≈ 2 268 € на година', /189 € на месец/.test(await out.innerText()) && /2\s?268 € на година/.test((await out.innerText()).replace(/ /g, ' ')))
  await page.fill('#calc-nights', '10')
  await page.fill('#calc-price', '100')
  await page.fill('#calc-pct', '12')
  ok('калкулатор: смяна на числата → 120 € на месец', /120 € на месец/.test(await out.innerText()))
  await page.fill('#calc-nights', '40')
  ok('калкулатор: невалидно число → подсказка вместо резултат', /Въведете нощувки/.test(await out.innerText()))
  await page.fill('#calc-nights', '')
  ok('калкулатор: празно поле не гърми', /Въведете нощувки/.test(await out.innerText()))
  const faq = page.locator('.lp-faq details')
  ok('въпроси: 6 въпроса, първият е отворен', (await faq.count()) === 6 && (await faq.first().getAttribute('open')) !== null)
  await faq.nth(1).locator('summary').click()
  ok('въпроси: клик отваря отговора за цената (9 €, 19 €, 39 €)', /9 € на месец, Плюс — 19 €, Про — 39 €/.test(await faq.nth(1).innerText()))
  ok('отзиви: разделът не се показва, докато няма реални отзиви', (await page.locator('.lp-say').count()) === 0)
  await ctx.close()
}

/* ---------------- форма „Заяви достъп“ ---------------- */
{
  const { ctx, page, errors } = await open(390)
  await go(page, '/access?plan=pro')
  ok('/access: един h1 и заглавие на страницата', (await page.locator('h1').count()) === 1 && /Заявка за достъп до StayFlow/.test(await page.title()))
  ok('/access?plan=pro: пакет „Про“ е предварително избран', (await page.locator('#req-plan').inputValue()) === 'pro')
  ok('/access: няма хоризонтално препълване', (await overflow(page)) <= 0)
  await page.getByRole('button', { name: 'Изпрати заявката' }).click()
  let t = await page.innerText('main')
  ok('празна форма: грешки за име, контакт и съгласие', /Въведете името си/.test(t) && /Оставете телефон или имейл/.test(t) && /Нужно е съгласие/.test(t))
  ok('празна форма: нищо не е изпратено', (await sent()).length === 0)
  await page.fill('#req-name', 'Мария Петрова')
  await page.fill('#req-phone', 'abc')
  await page.check('#req-consent')
  await page.getByRole('button', { name: 'Изпрати заявката' }).click()
  ok('лош телефон → съобщение под полето', /Въведете телефон с цифри/.test(await page.innerText('main')))
  await page.fill('#req-phone', '+359 888 123 456')
  await page.selectOption('#req-band', '4-10')
  await page.fill('#req-note', 'Имам 6 апартамента във Варна')
  await page.getByRole('button', { name: 'Изпрати заявката' }).click()
  await page.getByText('Получихме заявката ви').waitFor({ timeout: 8000 }).catch(() => {})
  ok('успех: „Получихме заявката ви“ с връзка към Viber', (await page.getByText('Получихме заявката ви').count()) === 1 && (await page.locator('a[href^="viber://"]').count()) >= 1)
  const reqs = await sent()
  const last = reqs.at(-1) ?? {}
  ok('към базата отива точно една заявка с чисти стойности', reqs.length === 1 && last.p_name === 'Мария Петрова' && last.p_phone === '+359 888 123 456' && last.p_email === null && last.p_band === '4-10' && last.p_consent === true, JSON.stringify(last))
  ok('пакетът „Про“ от адреса се изпраща', last.p_plan === 'pro', String(last.p_plan))
  ok('капанът за ботове е празен', !last.p_hp)
  ok('успех: няма JS грешки', errors.length === 0, errors.join(' | '))
  await ctx.close()
}
{
  // пакет по диапазона, когато не е избран; сървърна грешка → съобщение с Viber; капанът за ботове се изпраща
  const { ctx, page } = await open(1440, { height: 900 })
  await go(page, '/')
  const form = page.locator('#dostap')
  await form.locator('#home-name').fill('Георги Иванов')
  await form.locator('#home-email').fill('georgi@example.bg')
  await form.locator('#home-band').selectOption('1-3')
  await form.locator('#home-consent').check()
  const before = (await sent()).length
  await form.getByRole('button', { name: 'Изпрати заявката' }).click()
  await form.getByText('Получихме заявката ви').waitFor({ timeout: 8000 }).catch(() => {})
  const reqs = await sent()
  ok('от началната: без избран пакет се подава „Старт“ според диапазона 1–3 имота', reqs.length === before + 1 && reqs.at(-1).p_plan === 'start' && reqs.at(-1).p_phone === null && reqs.at(-1).p_email === 'georgi@example.bg', JSON.stringify(reqs.at(-1)))
  await ctx.close()
}
{
  const { ctx, page } = await open(390)
  await go(page, '/access')
  await page.fill('#req-name', 'Fail')
  await page.fill('#req-phone', '0888123456')
  await page.check('#req-consent')
  await page.getByRole('button', { name: 'Изпрати заявката' }).click()
  await page.getByRole('alert').first().waitFor({ timeout: 8000 }).catch(() => {})
  const t = await page.innerText('main')
  ok('сървърна грешка (too_many) → разбираемо съобщение + Viber', /Вече получихме заявка от вас/.test(t) && (await page.locator('.lp-alert a[href^="viber://"]').count()) === 1)
  ok('формата остава попълнена след грешка', (await page.inputValue('#req-name')) === 'Fail')
  await ctx.close()
}
{
  const { ctx, page } = await open(390)
  await go(page, '/signup')
  const t = await page.innerText('main')
  ok('/signup: пише, че достъпът се отваря от нас, и води към /access', /се отваря от нас/.test(t) && (await page.locator('a[href="/access"]').count()) === 1)
  await ctx.close()
}

/* ---------------- екрани „на пауза“ ---------------- */
const paused = { pending: /Профилът ви чака активиране/, expired: /Достъпът ви е на пауза/, suspended: /Достъпът ви е спрян/ }
for (const [state, title] of Object.entries(paused)) {
  await mock(state)
  const { ctx, page, errors } = await open(390, { logged: true })
  await go(page, '/bookings', 1400)
  const body = await page.innerText('body')
  ok(`${state}: вместо приложението се вижда „${title.source.replace(/\\/g, '')}“`, title.test(body))
  ok(`${state}: няма меню, таблица и данни на приложението`, !/Резервации\s*\n/.test(body) && (await page.locator('aside, nav[aria-label="Основно меню"]').count()) === 0 && !/Мария Петрова|Anna Schmidt/.test(body))
  ok(`${state}: Viber, телефон и „Изход“`, (await page.locator('a[href^="viber://"]').count()) === 1 && (await page.locator('a[href^="tel:"]').count()) === 1 && (await page.getByRole('button', { name: 'Изход' }).count()) === 1)
  ok(`${state}: няма хоризонтално препълване`, (await overflow(page)) <= 0)
  if (state === 'pending') ok('pending: има връзка „Заявете го тук“ към /access', (await page.locator('a[href="/access"]').count()) === 1)
  ok(`${state}: няма JS грешки`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}
{
  await mock('pending')
  const { ctx, page } = await open(390, { logged: true })
  await go(page, '/', 1400)
  // първият кадър не показва приложението, преди да е известно състоянието (бил е бъг със състезание)
  ok('pending: и на „/“ се вижда екранът на пауза, не таблото', /Профилът ви чака активиране/.test(await page.innerText('body')) && !/Чака вас|Табло/.test(await page.innerText('body')))
  await ctx.close()
}

/* ---------------- активен, изтича скоро, без миграция ---------------- */
{
  await mock('soon')
  const { ctx, page } = await open(390, { logged: true })
  await go(page, '/', 1400)
  const t = await page.innerText('body')
  ok('изтича след 3 дни: приложението работи и има лента „Достъпът ви изтича след 3 дни“', /Табло/.test(t) && /Достъпът ви изтича след 3 дни/.test(t) && (await page.locator('[role="status"] a[href^="viber://"]').count()) === 1)
  await ctx.close()
}
{
  await mock('active')
  const { ctx, page } = await open(390, { logged: true })
  await go(page, '/', 1400)
  ok('активен без срок: няма лента, приложението работи', /Табло/.test(await page.innerText('body')) && (await page.locator('[role="status"]').count()) === 0)
  await page.goto(base + '/admin/clients', { waitUntil: 'load' })
  await page.waitForTimeout(1200)
  ok('обикновен потребител на /admin/clients → връща се на таблото', /\/$/.test(page.url()))
  await ctx.close()
}
{
  await mock('missing')
  const { ctx, page } = await open(390, { logged: true })
  await go(page, '/', 1400)
  ok('без миграция 016 (функцията липсва) приложението се отваря нормално', /Табло/.test(await page.innerText('body')) && !/чака активиране/i.test(await page.innerText('body')))
  await ctx.close()
  await mock('active')
}

/* ---------------- „Клиенти“ (администратор) ---------------- */
{
  await mock('admin')
  const { ctx, page, errors } = await open(1440, { logged: true, height: 900 })
  await go(page, '/', 1400)
  ok('администратор: в менюто има „Клиенти“', (await page.locator('aside a[href="/admin/clients"]').count()) === 1)
  await page.locator('aside a[href="/admin/clients"]').click()
  await page.waitForURL(/\/admin\/clients$/)
  await page.waitForTimeout(900)
  let t = await page.innerText('main')
  ok('„Клиенти“: раздел „Заявки (1 нови)“ с двете заявки', /Заявки \(1 нови\)/.test(t) && /Стефан Маринов/.test(t) && /Anna Schmidt/.test(t))
  ok('заявка: Viber/обаждане/имейл връзки и препоръчан пакет', (await page.locator('main a[href^="viber://chat?number=%2B359877123456"]').count()) === 1 && (await page.locator('main a[href="mailto:anna@example.de"]').count()) === 1 && /иска Плюс/.test(t) && /подхожда му Старт/.test(t))
  await page.getByLabel('Статус на заявката от Стефан Маринов').selectOption('contacted')
  await page.waitForTimeout(400)
  const reqPatch = (await grants()).find((g) => g.method === 'PATCH-request')
  ok('смяна на статус на заявка → PATCH към access_requests', !!reqPatch && reqPatch.body.status === 'contacted' && /id=eq\.r1/.test(reqPatch.url), JSON.stringify(reqPatch))

  await page.getByRole('button', { name: /^Клиенти/ }).click()
  await page.waitForTimeout(500)
  t = await page.innerText('main')
  ok('раздел „Клиенти“: 4 акаунта със статуси', /Мария Петрова/.test(t) && /Морски къщи ЕООД/.test(t) && /Чака активиране/.test(t) && /Спрян/.test(t) && (t.match(/Активен/g) || []).length >= 2)
  ok('клиент, който изтича след 3 дни, показва „3 дни“', /\(3 дни\)/.test(t))
  await page.getByLabel('Търсене на клиент').fill('elena')
  ok('търсене по имейл намира само Елена', /Елена Стоянова/.test(await page.innerText('main')) && !/Мария Петрова/.test(await page.innerText('main')))
  const before = (await grants()).length
  await page.getByRole('button', { name: 'Активирай за 1 месец' }).click()
  await page.waitForTimeout(500)
  const g = (await grants()).slice(before).at(-1)
  const nextMonth = new Date(); nextMonth.setMonth(nextMonth.getMonth() + 1)
  ok('„Активирай за 1 месец“ → upsert със статус active и дата след ~1 месец', !!g && g.body.profile_id === 'p3' && g.body.status === 'active' && Math.abs(new Date(g.body.active_until) - nextMonth) < 3 * 86400000, JSON.stringify(g))
  ok('след активиране редът показва „Активен“', /Активен/.test(await page.innerText('main')))
  await page.getByLabel('Търсене на клиент').fill('')
  await page.getByLabel('Търсене на клиент').fill('maria')
  await page.getByRole('button', { name: 'Спри' }).click()
  await page.waitForTimeout(400)
  const off = (await grants()).at(-1)
  ok('„Спри“ → upsert със статус suspended', off.body.profile_id === 'p1' && off.body.status === 'suspended', JSON.stringify(off))
  ok('„Клиенти“: няма хоризонтално препълване', (await overflow(page)) <= 0)
  ok('„Клиенти“: няма JS грешки', errors.length === 0, errors.join(' | '))
  await ctx.close()
}
{
  await mock('admin')
  const { ctx, page } = await open(375, { logged: true })
  await go(page, '/admin/clients', 1400)
  ok('„Клиенти“ на телефон: няма хоризонтално препълване', (await overflow(page)) <= 0)
  ok('„Клиенти“ на телефон: цялата страница се чете (заглавие и раздели)', /Клиенти/.test(await page.innerText('main')))
  await page.getByRole('button', { name: /Още/ }).first().click()
  await page.waitForTimeout(400)
  ok('„Клиенти“ на телефон: в „Още“ има връзка „Клиенти“', (await page.locator('nav[aria-label="Още"] a[href="/admin/clients"]').count()) === 1)
  await ctx.close()
  await mock('active')
}

await browser.close()
console.log(`\naccess: ${pass} успешни, ${fail} провалени`)
process.exit(fail ? 1 : 0)
