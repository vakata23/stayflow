// Точка 3 „по-лесно за ползване“: плаващ бутон „Нова резервация“, търсене на гост, „Профил и настройки“.
//   node scripts/visual/usability.mjs http://localhost:4175
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

const browser = await chromium.launch({ channel: 'chrome' })
async function open(width, height = 800) {
  const ctx = await browser.newContext({ viewport: { width, height }, locale: 'bg-BG', timezoneId: 'Europe/Sofia' })
  await ctx.addInitScript((s) => {
    try { localStorage.setItem('sb-localhost-auth-token', JSON.stringify(s)); localStorage.setItem('stayflow.autoSetupSeen', '1') } catch {}
  }, session)
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  return { ctx, page, errors }
}
const go = async (page, route) => {
  await page.goto(base + route, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready).catch(() => {})
  await page.waitForTimeout(900)
}
const fabInfo = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('.fab')
    if (!el) return null
    const r = el.getBoundingClientRect()
    const visible = getComputedStyle(el).display !== 'none' && r.width > 0
    return { visible, w: Math.round(r.width), h: Math.round(r.height), right: Math.round(innerWidth - r.right), bottom: Math.round(innerHeight - r.bottom) }
  })

/* ---------------- плаващ бутон ---------------- */
{
  const { ctx, page, errors } = await open(375)
  for (const route of ['/', '/calendar', '/bookings', '/earnings', '/notifications']) {
    await go(page, route)
    const f = await fabInfo(page)
    ok(`телефон ${route}: плаващият бутон е видим`, !!f?.visible)
    if (route === '/') {
      ok('бутонът е поне 44×44 px (цел за пръст)', f.w >= 44 && f.h >= 44, `${f.w}×${f.h}`)
      const nav = await page.evaluate(() => {
        const fab = document.querySelector('.fab').getBoundingClientRect()
        const bar = [...document.querySelectorAll('nav')].map((n) => n.getBoundingClientRect()).filter((r) => r.width > 0 && r.top > innerHeight / 2).at(0)
        return { fabBottom: Math.round(fab.bottom), barTop: bar ? Math.round(bar.top) : null }
      })
      ok('бутонът не закрива долната навигация', nav.barTop === null || nav.fabBottom <= nav.barTop, JSON.stringify(nav))
      const label = await page.getAttribute('.fab', 'aria-label')
      ok('бутонът има име за екранен четец', label === 'Нова резервация', label)
    }
  }
  for (const route of ['/profile', '/properties/new']) {
    await go(page, route)
    ok(`телефон ${route}: бутонът е скрит (не закрива „Запази“)`, (await fabInfo(page)) === null)
  }

  const form = page.locator('h2', { hasText: 'Нова резервация' })
  // клик от Таблото → отваря се формата за нова резервация (параметърът ?new=1 се маха от адреса)
  await go(page, '/')
  await page.click('.fab')
  await form.first().waitFor({ timeout: 8000 }).catch(() => {})
  ok('клик на бутона от Таблото → отваря се формата за нова резервация', (await form.count()) > 0 && /\/bookings/.test(page.url()))
  ok('адресът се чисти след отварянето (без ?new=1)', !/new=1/.test(page.url()), page.url())

  // бутонът върши работа и когато вече сме на „Резервации“ със затворена форма
  await go(page, '/bookings')
  ok('на /bookings формата е затворена в началото', (await form.count()) === 0)
  await page.click('.fab')
  await form.first().waitFor({ timeout: 8000 }).catch(() => {})
  ok('клик на бутона докато сме на /bookings също отваря формата', (await form.count()) > 0)
  ok('няма JS грешки (телефон)', errors.length === 0, errors.join(' | '))
  await ctx.close()
}
{
  const { ctx, page } = await open(1440, 900)
  await go(page, '/')
  const f = await fabInfo(page)
  ok('компютър: плаващият бутон е скрит (има меню отстрани)', !f || !f.visible)
  await ctx.close()
}

/* ---------------- търсене на гост ---------------- */
for (const width of [375, 1440]) {
  const { ctx, page, errors } = await open(width, 900)
  await go(page, '/bookings')
  const box = page.getByRole('searchbox', { name: /Търсене на гост/ }).or(page.getByPlaceholder('Име, телефон или имейл')).first()
  ok(`${width}px: има поле за търсене на гост`, (await box.count()) > 0)
  const rows = () => page.evaluate(() => document.body.innerText)
  await box.fill('')
  const total = await rows()
  ok(`${width}px: без заявка се виждат всички гости`, /Мария Петрова/.test(total) && /Anna Schmidt/.test(total) && /Daniel Rossi/.test(total))

  await box.fill('петрова')
  await page.waitForTimeout(250)
  let t = await rows()
  ok(`${width}px: „петрова“ → само Мария Петрова`, /Мария Петрова/.test(t) && !/Anna Schmidt/.test(t) && !/Daniel Rossi/.test(t))
  ok(`${width}px: показва броя „Намерени: 1 от …“`, /Намерени: 1 от \d+/.test(t))

  await box.fill('SCHMIDT')
  await page.waitForTimeout(250)
  t = await rows()
  ok(`${width}px: главни букви и латиница („SCHMIDT“)`, /Anna Schmidt/.test(t) && !/Мария Петрова/.test(t))

  await box.fill('нямагост')
  await page.waitForTimeout(250)
  t = await rows()
  ok(`${width}px: без съвпадения → ясно съобщение`, /Няма гост с такова име или телефон/.test(t))
  const clear = page.getByRole('button', { name: /Изчисти търсенето/ }).first()
  ok(`${width}px: има бутон „Изчисти търсенето“`, (await clear.count()) > 0)
  await clear.click()
  await page.waitForTimeout(250)
  t = await rows()
  ok(`${width}px: „Изчисти търсенето“ връща всички`, /Мария Петрова/.test(t) && /Daniel Rossi/.test(t) && (await box.inputValue()) === '')

  // телефон (сийд: Мария Петрова = +359 88 100 1037): един и същ номер във всички записи
  for (const q of ['+359 88 100 1037', '0881001037', '+359881001037', '0881 001 037', '1001037']) {
    await box.fill(q)
    await page.waitForTimeout(250)
    t = await rows()
    ok(`${width}px: телефон „${q}“ намира Мария Петрова`, /Мария Петрова/.test(t) && /Намерени: 1 от \d+/.test(t), (t.match(/Намерени: [^\n]+|Няма [^\n]+/) || [''])[0])
  }

  // търсенето и филтрите работят заедно
  await box.fill('петрова')
  await page.waitForTimeout(250)
  t = await rows()
  ok(`${width}px: няма JS грешки`, errors.length === 0, errors.join(' | '))
  await ctx.close()
}

/* ---------------- профил ---------------- */
{
  const { ctx, page, errors } = await open(375, 900)
  await go(page, '/profile')
  ok('профил: заглавие „Профил и настройки“', /Профил и настройки/.test(await page.innerText('h1')))
  const val = (label) => page.getByLabel(label, { exact: false }).first()
  ok('профил: името е попълнено от базата', (await val('Име').inputValue()) === 'Иван Петров')
  ok('профил: имейлът е само за четене', await page.getByLabel('Имейл за вход').isDisabled())
  const save = page.getByRole('button', { name: 'Запази', exact: true })
  ok('профил: „Запази“ е изключен, докато няма промяна', await save.isDisabled())
  ok('профил: прегледът показва фирмата (не името) пред гостите', (await page.getByTestId('preview-name').innerText()) === 'Морски имоти ЕООД')

  await page.getByLabel('Фирма (по желание)').fill('')
  ok('профил: без фирма прегледът показва името', (await page.getByTestId('preview-name').innerText()) === 'Иван Петров')
  ok('профил: „Запази“ се включва при промяна', await save.isEnabled())

  await page.getByLabel('Телефон за гостите').fill('abc')
  await save.click()
  ok('профил: лош телефон → съобщение, не се записва', /Въведете телефон с цифри/.test(await page.innerText('main')))
  await page.getByLabel('Телефон за гостите').fill('+359 888 123 456')
  await val('Име').fill('   ')
  await save.click()
  ok('профил: празно име → „Въведете име.“', /Въведете име\./.test(await page.innerText('main')))
  await val('Име').fill('Иван П. Петров')

  const reqs = []
  page.on('request', (r) => { if (r.method() === 'PATCH' && /profiles/.test(r.url())) reqs.push(r.postData()) })
  await save.click()
  await page.waitForTimeout(600)
  ok('профил: изпраща се един запис към базата', reqs.length === 1, String(reqs.length))
  const body = reqs[0] ? JSON.parse(reqs[0]) : {}
  ok('профил: записът е с изчистени стойности (празна фирма = null)', body.full_name === 'Иван П. Петров' && body.company_name === null && body.phone === '+359 888 123 456', JSON.stringify(body))
  ok('профил: показва „Промените са запазени.“', /Промените са запазени\./.test(await page.innerText('main')))
  ok('профил: след запис „Запази“ пак е изключен', await save.isDisabled())

  // навигация: на телефон профилът е в листа „Още“
  await go(page, '/')
  await page.getByRole('button', { name: /Още/ }).first().click()
  await page.waitForTimeout(500)
  const more = page.locator('nav[aria-label="Още"] a[href="/profile"]')
  ok('телефон: в „Още“ има връзка „Профил“', (await more.count()) === 1)
  await more.click()
  await page.waitForURL(/\/profile$/)
  ok('телефон: връзката отваря /profile', /\/profile$/.test(page.url()))
  ok('няма JS грешки (профил)', errors.length === 0, errors.join(' | '))
  await ctx.close()
}
{
  const { ctx, page } = await open(1440, 900)
  await go(page, '/')
  const link = page.locator('aside a[href="/profile"]').first()
  ok('компютър: в страничното меню има връзка към профила', (await link.count()) > 0)
  await link.click()
  await page.waitForURL(/\/profile$/)
  ok('компютър: връзката отваря /profile', /\/profile$/.test(page.url()))
  await ctx.close()
}

await browser.close()
console.log(`\nusability: ${pass} успешни, ${fail} провалени`)
process.exit(fail ? 1 : 0)
