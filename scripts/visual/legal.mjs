// Правна информация в браузър: банер за бисквитки („Откажи“ = „Приемам“), нищо външно преди избор, карта само със съгласие,
// отметки за съгласие (регистрация, заявка от гост), Политика и Условия, връзки в долния ред на всеки екран, 6 езика, телефон, axe.
//   node scripts/visual/legal.mjs http://localhost:4174 [папка за снимки]
// Тестовата среда предварително „приема“; тук всеки контекст праща заглавие x-consent-fresh, за да започне без избор.
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createRequire } from 'node:module'
import { USER } from './seed.mjs'
import { missingCompanyFields, companyShort } from '../../src/lib/legal.js'
import { translate } from '../../src/pages/stay/i18n/core.js'

const require = createRequire(import.meta.url)
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
const [base = 'http://localhost:4174', shotsArg] = process.argv.slice(2)
const OUT = shotsArg ? path.resolve(shotsArg) : path.join(path.dirname(fileURLToPath(import.meta.url)), 'out', 'legal')
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
/** fresh: без предварително приет избор; signedIn: фалшива сесия на собственик; appLang: език на приложението. */
async function open(vp, { fresh = true, signedIn = false, appLang = null } = {}) {
  const browser = await chromium.launch({ channel: 'chrome', args: vp.isMobile ? COARSE : [] })
  browsers.push(browser)
  const ctx = await browser.newContext({
    ...vp,
    viewport: { width: vp.width, height: vp.height },
    locale: 'bg-BG',
    timezoneId: 'Europe/Sofia',
    serviceWorkers: 'block',
    extraHTTPHeaders: fresh ? { 'x-consent-fresh': '1' } : {},
  })
  await ctx.addInitScript(
    ([s, signed, lang]) => {
      try {
        if (signed) {
          localStorage.setItem('sb-localhost-auth-token', JSON.stringify(s))
          localStorage.setItem('stayflow.autoSetupSeen', '1')
        }
        if (lang) localStorage.setItem('stayflow.appLang', lang)
      } catch {
        /* */
      }
    },
    [session, signedIn, appLang]
  )
  const page = await ctx.newPage()
  const external = []
  const errors = []
  page.on('request', (r) => {
    try {
      const u = new URL(r.url())
      if (u.hostname !== 'localhost' && u.protocol.startsWith('http')) external.push(u.hostname)
    } catch {
      /* */
    }
  })
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text()) && errors.push(m.text()))
  return { page, ctx, external, errors }
}
const settle = async (page, ms = 600) => {
  await page.evaluate(() => document.fonts.ready).catch(() => {})
  await page.waitForTimeout(ms)
}
const stored = (page) => page.evaluate(() => localStorage.getItem('stayflow.consent'))
const bannerOf = (page, name = /Бисквитки и външно съдържание/) => page.getByRole('region', { name })
const axe = (page) =>
  page.evaluate(async (src) => {
    // eslint-disable-next-line no-eval
    ;(0, eval)(src)
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }, resultTypes: ['violations'] })
    return r.violations.map((v) => `${v.id}×${v.nodes.length}`)
  }, axeSource)
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const plus = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10)

/* ================= A. Банерът на входа ================= */
{
  const { page, external, errors } = await open(DESK)
  await page.goto(base + '/login', { waitUntil: 'load' })
  await page.getByRole('heading', { name: 'Вход', level: 1 }).waitFor()
  await settle(page)
  const banner = bannerOf(page)
  ok('при първо посещение банерът се показва', await banner.isVisible())
  ok('преди избор няма заявки към външни адреси', external.length === 0, [...new Set(external)].join(', '))
  ok('преди избор нищо не е записано', (await stored(page)) === null)

  const decline = banner.getByRole('button', { name: 'Откажи' })
  const accept = banner.getByRole('button', { name: 'Приемам' })
  const [bd, ba] = [await decline.boundingBox(), await accept.boundingBox()]
  ok('„Откажи“ и „Приемам“ са еднакви по размер', Math.abs(bd.width - ba.width) < 1 && Math.abs(bd.height - ba.height) < 1, `${bd.width}×${bd.height} / ${ba.width}×${ba.height}`)
  const style = (loc) => loc.evaluate((e) => { const c = getComputedStyle(e); return [c.backgroundColor, c.color, c.fontWeight, c.fontSize, c.borderTopWidth, c.borderTopColor].join('|') })
  ok('…и еднакви по вид (цвят, шрифт, рамка) — отказът не е скрит', (await style(decline)) === (await style(accept)), `${await style(decline)} ≠ ${await style(accept)}`)
  ok('и двата бутона са поне 44 px високи', bd.height >= 44 && ba.height >= 44, `${bd.height}/${ba.height}`)
  await page.screenshot({ path: path.join(OUT, 'desk-login-banner.png') })
  const v1 = await axe(page)
  ok('axe: 0 нарушения с отворен банер (вход, 1440)', v1.length === 0, v1.join(', '))

  await decline.click()
  ok('„Откажи“ скрива банера', (await banner.count()) === 0)
  const rec = JSON.parse(await stored(page))
  ok('записът е { v:1, choice:"necessary", at: ISO час }', rec?.v === 1 && rec?.choice === 'necessary' && !Number.isNaN(Date.parse(rec?.at)), JSON.stringify(rec))
  await page.reload({ waitUntil: 'load' })
  await page.getByRole('heading', { name: 'Вход', level: 1 }).waitFor()
  await settle(page, 400)
  ok('след презареждане банерът не се връща', (await banner.count()) === 0)

  const links = page.getByRole('navigation', { name: 'Правна информация' })
  ok('в долния ред има 3 действия: Политика, Условия, Настройки за бисквитки', (await links.getByRole('link').count()) === 2 && (await links.getByRole('button', { name: 'Настройки за бисквитки' }).count()) === 1)
  await links.getByRole('button', { name: 'Настройки за бисквитки' }).click()
  ok('„Настройки за бисквитки“ връща банера', await bannerOf(page).isVisible())
  await bannerOf(page).getByRole('button', { name: 'Приемам' }).click()
  ok('„Приемам“ записва choice:"all" и скрива банера', JSON.parse(await stored(page)).choice === 'all' && (await bannerOf(page).count()) === 0)
  ok('без грешки в конзолата', errors.length === 0, errors.join(' | '))
}

/* ---------- връзката „Научете повече“ води към раздела за бисквитки ---------- */
{
  const { page } = await open(DESK)
  await page.goto(base + '/login', { waitUntil: 'load' })
  await page.getByRole('heading', { name: 'Вход', level: 1 }).waitFor()
  await bannerOf(page).getByRole('link', { name: 'Научете повече' }).click()
  await page.getByRole('heading', { name: '6. Бисквитки и локално хранилище' }).waitFor()
  await page.waitForTimeout(300)
  const top = await page.evaluate(() => document.getElementById('cookies').getBoundingClientRect().top)
  ok('„Научете повече“ → /privacy#cookies и разделът е в началото на екрана', new URL(page.url()).pathname === '/privacy' && new URL(page.url()).hash === '#cookies' && top > -10 && top < 250, `top=${top}`)
}

/* ================= B. Езици на банера ================= */
for (const [lang, title, no, yes] of [
  ['en', 'Cookies and external content', 'Decline', 'Accept'],
  ['el', 'Cookies και εξωτερικό περιεχόμενο', 'Απόρριψη', 'Αποδοχή'],
  ['mk', 'Колачиња и надворешна содржина', 'Одбиј', 'Прифаќам'],
  ['sr', 'Колачићи и спољни садржај', 'Одбиј', 'Прихватам'],
  ['sr-latn', 'Kolačići i spoljni sadržaj', 'Odbij', 'Prihvatam'],
  ['ro', 'Cookie-uri și conținut extern', 'Refuz', 'Accept'],
]) {
  const { page } = await open(DESK)
  await page.goto(`${base}/stay/tihi-bryag?lang=${lang}`, { waitUntil: 'load' })
  await page.waitForSelector('h1')
  await settle(page, 400)
  const b = page.getByRole('region', { name: title })
  ok(`/stay?lang=${lang}: банерът е на езика на госта`, (await b.isVisible()) && (await b.getByRole('button', { name: no }).isVisible()) && (await b.getByRole('button', { name: yes }).isVisible()))
}
{
  const { page } = await open(DESK, { appLang: 'el' })
  await page.goto(base + '/login', { waitUntil: 'load' })
  await page.waitForSelector('h1')
  await settle(page, 400)
  ok('приложението на гръцки: банерът е на гръцки (<html lang=el>)', (await page.getByRole('region', { name: 'Cookies και εξωτερικό περιεχόμενο' }).isVisible()) && (await page.evaluate(() => document.documentElement.lang)) === 'el')
}
{
  // смяна на езика на живо: банерът следва <html lang>
  const { page } = await open(DESK)
  await page.goto(`${base}/stay/tihi-bryag?lang=en`, { waitUntil: 'load' })
  await page.waitForSelector('h1')
  await page.getByRole('region', { name: 'Cookies and external content' }).waitFor()
  await page.locator('select').first().selectOption('ro')
  await page.getByRole('region', { name: 'Cookie-uri și conținut extern' }).waitFor({ timeout: 4000 })
  ok('смяна на езика на /stay на живо сменя и банера', true)
}

/* ================= C. Картата само със съгласие ================= */
async function toMap(page) {
  await page.getByRole('heading', { name: /Къде ще бъдете|Where you|Unde veți/i }).first().scrollIntoViewIfNeeded().catch(() => {})
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.6))
  await page.waitForTimeout(400)
  await page.evaluate(() => document.querySelector('.stay-map, [class*="map"]')?.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(700)
}
{
  const { page, external } = await open(DESK)
  await page.goto(`${base}/stay/tihi-bryag`, { waitUntil: 'load' })
  await page.waitForSelector('h1')
  await bannerOf(page).getByRole('button', { name: 'Откажи' }).click()
  await toMap(page)
  const ph = page.getByText('Картата не е заредена')
  await ph.waitFor({ timeout: 5000 })
  ok('след „Откажи“ картата не е заредена (има място със същата височина)', (await page.locator('iframe[src*="openstreetmap"]').count()) === 0)
  const box = await ph.locator('xpath=ancestor::div[1]').boundingBox()
  ok('мястото на картата не е свито (≥ 200 px)', box && box.height >= 200, JSON.stringify(box))
  ok('няма нито една заявка към OpenStreetMap', !external.some((h) => /openstreetmap/.test(h)), [...new Set(external)].join(', '))
  const href = await page.getByRole('link', { name: 'Отвори в OpenStreetMap' }).getAttribute('href')
  ok('„Отвори в OpenStreetMap“ е обикновена връзка без пин за гостите (приблизително място)', /^https:\/\/www\.openstreetmap\.org\/#map=16\//.test(href) && !/mlat/.test(href), href)
  ok('…и се отваря в нов раздел с rel=noopener', (await page.getByRole('link', { name: 'Отвори в OpenStreetMap' }).getAttribute('rel')) === 'noopener noreferrer' && (await page.getByRole('link', { name: 'Отвори в OpenStreetMap' }).getAttribute('target')) === '_blank')
  await page.screenshot({ path: path.join(OUT, 'desk-map-blocked.png') })
  await page.getByRole('button', { name: 'Покажи картата' }).click()
  await page.locator('iframe[src*="openstreetmap"]').waitFor({ timeout: 5000 })
  ok('„Покажи картата“ зарежда картата и записва избора „all“', JSON.parse(await stored(page)).choice === 'all')
}
{
  const { page } = await open(DESK)
  await page.goto(`${base}/stay/tihi-bryag`, { waitUntil: 'load' })
  await page.waitForSelector('h1')
  await bannerOf(page).getByRole('button', { name: 'Приемам' }).click()
  await toMap(page)
  await page.locator('iframe[src*="openstreetmap"]').waitFor({ timeout: 5000 })
  ok('след „Приемам“ картата се зарежда', true)
}

/* ================= D. Регистрация: задължителна отметка ================= */
{
  const { page } = await open(DESK)
  const posts = []
  page.on('request', (r) => r.method() === 'POST' && /\/auth\/v1\/signup/.test(r.url()) && posts.push(r.url()))
  await page.goto(base + '/signup', { waitUntil: 'load' })
  await page.getByRole('heading', { name: 'Регистрация', level: 1 }).waitFor()
  await bannerOf(page).getByRole('button', { name: 'Откажи' }).click()
  await page.getByLabel('Име и фамилия').fill('Иван Тестов')
  await page.getByLabel('Имейл').fill('ivan@example.bg')
  await page.getByLabel('Парола').fill('dobra-parola-1')
  const box = page.getByRole('checkbox')
  ok('отметката не е предварително отметната', !(await box.isChecked()))
  const label = page.locator('label.check')
  ok('целият ред на отметката е поне 44 px висок', (await label.boundingBox()).height >= 44)
  const hrefs = await label.getByRole('link').evaluateAll((els) => els.map((e) => `${e.getAttribute('href')}|${e.getAttribute('target')}`))
  ok('в отметката: връзки към /terms и /privacy в нов раздел', hrefs.join() === '/terms|_blank,/privacy|_blank', hrefs.join())
  await page.getByRole('button', { name: 'Създай акаунт' }).click()
  await page.getByRole('alert').waitFor()
  ok('без отметка: съобщение „Отбележете съгласието…“ и НЕ се праща заявка за регистрация', /Отбележете съгласието/.test(await page.getByRole('alert').innerText()) && posts.length === 0, `${posts.length}`)
  await box.check()
  ok('след отмятане съобщението изчезва', (await page.getByRole('alert').count()) === 0)
  await page.getByRole('button', { name: 'Създай акаунт' }).click()
  await page.getByRole('heading', { name: 'Проверете пощата си', level: 1 }).waitFor({ timeout: 5000 })
  ok('с отметка регистрацията минава (1 заявка)', posts.length === 1, `${posts.length}`)
}

/* ================= E. Заявка от гост: задължителна отметка ================= */
for (const lang of ['bg', 'en']) {
  const t = (k, v) => translate(lang, k, v)
  const { page } = await open(DESK, { fresh: false })
  const posts = []
  page.on('request', (r) => r.method() === 'POST' && r.url().includes('/api/booking-request') && posts.push(r.postData()))
  await page.goto(`${base}/stay/tihi-bryag?lang=${lang}`, { waitUntil: 'load' })
  await page.waitForSelector('.stay-booking input[type="date"]')
  await page.locator('.stay-booking input[type="date"]').nth(0).fill(plus(40))
  await page.locator('.stay-booking input[type="date"]').nth(1).fill(plus(43))
  await page.getByRole('button', { name: t('checkPriceBtn') }).click()
  await page.waitForSelector('.stay-quote')
  await page.getByLabel(`${t('fieldName')} *`).fill('Иван Тестов')
  await page.locator('.stay-booking input[type="tel"]').fill('+359 88 123 4567')
  const box = page.locator('.stay-consent input')
  ok(`заявка (${lang}): отметката не е предварително отметната`, !(await box.isChecked()))
  const lab = await page.locator('.stay-consent').boundingBox()
  ok(`заявка (${lang}): целият ред е поне 44 px висок`, lab.height >= 44, String(lab.height))
  const privHref = await page.locator('.stay-consent a').getAttribute('href')
  ok(`заявка (${lang}): връзка към /privacy в нов раздел`, privHref === '/privacy' && (await page.locator('.stay-consent a').getAttribute('target')) === '_blank')
  await page.getByRole('button', { name: t('requestBtn') }).click()
  await page.getByRole('alert').waitFor()
  ok(`заявка (${lang}): без отметка — „${t('errConsent')}“ и НЕ се праща`, (await page.getByRole('alert').innerText()).trim() === t('errConsent') && posts.length === 0, `${posts.length}`)
  if (lang === 'bg') await page.screenshot({ path: path.join(OUT, 'desk-request-consent-error.png') })
  await box.check()
  await page.getByRole('button', { name: t('requestBtn') }).click()
  await page.waitForSelector('[role="status"]', { timeout: 5000 })
  ok(`заявка (${lang}): с отметка се изпраща точно веднъж`, posts.length === 1, `${posts.length}`)
}

/* ================= F. Документите ================= */
for (const [route, title, h2s] of [
  ['/privacy', 'Политика за поверителност', 8],
  ['/terms', 'Условия за ползване', 11],
]) {
  for (const vp of [DESK, PHONE]) {
    const { page, external, errors } = await open(vp)
    await page.goto(base + route, { waitUntil: 'load' })
    await page.getByRole('heading', { name: title, level: 1 }).waitFor()
    await settle(page, 400)
    const w = vp.width
    ok(`${route} @${w}: ${h2s} раздела, дата на промяната`, (await page.locator('article h2').count()) === h2s && /Последна промяна: \d+ \S+ 20\d\d г\./.test(await page.locator('article').innerText()))
    const marks = await page.locator('[data-testid="company-block"] mark').count()
    ok(`${route} @${w}: данните на администратора — непопълнените са видими „[да се попълни]“ (${marks} от ${missingCompanyFields().length})`, marks === missingCompanyFields().length)
    ok(`${route} @${w}: съдържанието е с lang=bg`, (await page.locator('article div[lang="bg"]').count()) === 1)
    ok(`${route} @${w}: без хоризонтално препълване`, (await overflow(page)) <= 0, String(await overflow(page)))
    ok(`${route} @${w}: преди избор няма заявки към външни адреси`, external.length === 0, [...new Set(external)].join(', '))
    ok(`${route} @${w}: без грешки в конзолата`, errors.length === 0, errors.join(' | '))
    const open1 = await axe(page)
    ok(`${route} @${w}: axe 0 нарушения (банерът е отворен)`, open1.length === 0, open1.join(', '))
    await bannerOf(page).getByRole('button', { name: 'Откажи' }).click()
    const open2 = await axe(page)
    ok(`${route} @${w}: axe 0 нарушения (банерът е затворен)`, open2.length === 0, open2.join(', '))
    if (route === '/privacy' && w === 1440) await page.screenshot({ path: path.join(OUT, 'desk-privacy.png'), fullPage: true })
    if (route === '/privacy' && w === 375) await page.screenshot({ path: path.join(OUT, 'phone-privacy-top.png') })
  }
}
{
  // посетител на друг език: бележка, че документът е на български
  const { page } = await open(DESK, { appLang: 'el' })
  await page.goto(base + '/privacy', { waitUntil: 'load' })
  await page.getByRole('heading', { name: 'Политика за поверителност', level: 1 }).waitFor()
  const note = page.getByRole('note')
  ok('на гръцки: бележка „Αυτό το έγγραφο είναι διαθέσιμο μόνο στα βουλγαρικά.“ и документът остава на български', (await note.innerText()).trim() === translate('el', 'bgOnly') && (await page.getByRole('heading', { name: 'Политика за поверителност', level: 1 }).count()) === 1)
}

/* ================= G. Долният ред на всеки екран ================= */
for (const [name, route, opts] of [
  ['вход', '/login', {}],
  ['регистрация', '/signup', {}],
  ['демо', '/demo', {}],
  ['публична страница', '/stay/tihi-bryag', {}],
  ['приложение (Табло)', '/', { signedIn: true }],
  ['приложение (Резервации)', '/bookings', { signedIn: true }],
]) {
  const { page } = await open(DESK, { fresh: false, ...opts })
  await page.goto(base + route, { waitUntil: 'load' })
  await page.waitForSelector('h1')
  await settle(page, 500)
  const nav = page.getByRole('navigation', { name: 'Правна информация' })
  const hrefs = await nav.getByRole('link').evaluateAll((els) => els.map((e) => e.getAttribute('href')))
  ok(`долен ред — ${name}: Политика, Условия и „Настройки за бисквитки“`, hrefs.join() === '/privacy,/terms' && (await nav.getByRole('button', { name: 'Настройки за бисквитки' }).count()) === 1, hrefs.join())
  const heights = await nav.locator('a, button').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)))
  ok(`долен ред — ${name}: цели за докосване ≥ 44 px`, heights.every((h) => h >= 44), heights.join(','))
  const short = companyShort()
  ok(`долен ред — ${name}: фирмата${short ? '' : ' (още не е попълнена — не се показва)'}`, short ? (await nav.innerText()).includes(short) : !(await nav.innerText()).includes('ЕИК'))
}

/* ================= H. Телефон: банерът ================= */
for (const [name, route, opts] of [
  ['вход', '/login', {}],
  ['публична страница', '/stay/tihi-bryag', {}],
  ['приложение', '/', { signedIn: true }],
]) {
  const { page } = await open(PHONE, opts)
  await page.goto(base + route, { waitUntil: 'load' })
  await page.waitForSelector('h1')
  await settle(page, 500)
  const b = bannerOf(page)
  const box = await b.boundingBox()
  ok(`телефон — ${name}: банерът е изцяло в екрана и заема под половината му`, box && box.x >= 0 && box.x + box.width <= 375 && box.y >= 0 && box.height < 812 * 0.5, JSON.stringify(box))
  ok(`телефон — ${name}: няма хоризонтално препълване`, (await overflow(page)) <= 0)
  const d = await b.getByRole('button', { name: 'Откажи' }).boundingBox()
  const topEl = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('button')?.textContent.trim() ?? null, [d.x + d.width / 2, d.y + d.height / 2])
  ok(`телефон — ${name}: „Откажи“ се докосва (нищо не го закрива, дори долната лента)`, topEl === 'Откажи', String(topEl))
  const v = await axe(page)
  ok(`телефон — ${name}: axe 0 нарушения с отворен банер`, v.length === 0, v.join(', '))
  if (name === 'публична страница') await page.screenshot({ path: path.join(OUT, 'phone-stay-banner.png') })
  if (name === 'приложение') await page.screenshot({ path: path.join(OUT, 'phone-app-banner.png') })
}

for (const b of browsers) await b.close()
console.log(`legal: ${pass} успешни, ${fail} провалени`)
process.exit(fail ? 1 : 0)
