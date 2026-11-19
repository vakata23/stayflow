// Гърция (миграция 017): номер на имота, данни за декларацията във формата за резервация, екран „Декларации“,
// „Чака вас“ на таблото, номерът на публичната страница, гръцки и телефон, достъпност.
//   node scripts/visual/greece.mjs http://localhost:4174 [папка за снимки]
// Гръцките данни се включват от тестовата среда през /__mock/greece?on=1 (без тях другите проверки остават същите).
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createRequire } from 'node:module'
import { USER } from './seed.mjs'

const require = createRequire(import.meta.url)
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
const [base = 'http://localhost:4174', shotsArg] = process.argv.slice(2)
const OUT = shotsArg ? path.resolve(shotsArg) : path.join(path.dirname(fileURLToPath(import.meta.url)), 'out', 'greece')
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

const P1 = '21111111-0000-4000-8000-000000000001' // Вила „Тихи бряг“ (в основните данни, не е в Гърция)
const G1 = '24444444-0000-4000-8000-000000000004' // Вила „Елия“ (с номер)
const G2 = '25555555-0000-4000-8000-000000000005' // Студио „Мора“ (без номер)
const BK = (n) => `b${String(n).padStart(7, '0')}-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`

const jwt = () => {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b({ alg: 'HS256', typ: 'JWT' })}.${b({ sub: USER.id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 86400 })}.sig`
}
const session = { access_token: jwt(), token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: USER }
const COARSE = ['--blink-settings=primaryPointerType=2,availablePointerTypes=2,primaryHoverType=1,availableHoverTypes=1']
const DESK = { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false }
const PHONE = { width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true }

const browsers = []
async function open(vp, { lang } = {}) {
  const browser = await chromium.launch({ channel: 'chrome', args: vp.isMobile ? COARSE : [] })
  browsers.push(browser)
  const ctx = await browser.newContext({ ...vp, viewport: { width: vp.width, height: vp.height }, locale: 'bg-BG', timezoneId: 'Europe/Sofia', acceptDownloads: true })
  await ctx.addInitScript(
    ([s, l]) => {
      try {
        localStorage.setItem('sb-localhost-auth-token', JSON.stringify(s))
        localStorage.setItem('stayflow.autoSetupSeen', '1')
        if (l) localStorage.setItem('stayflow.appLang', l)
      } catch {}
    },
    [session, lang ?? null]
  )
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text()) && errors.push(m.text()))
  return { page, ctx, errors }
}
const settle = async (page) => {
  await page.evaluate(() => document.fonts.ready).catch(() => {})
  await page.waitForTimeout(700)
}
const mock = async (q) => (await fetch(`${base}/__mock/${q}`)).json()
const writes = async (clear = false) => (await fetch(`${base}/__mock/writes${clear ? '?clear=1' : ''}`)).json()
const axe = async (page) =>
  page.evaluate(async (src) => {
    // eslint-disable-next-line no-eval
    ;(0, eval)(src)
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }, resultTypes: ['violations'] })
    return r.violations.map((v) => `${v.id}×${v.nodes.length}`)
  }, axeSource)
const rowsOf = (page) => page.locator('table tbody tr')
const rowText = async (page, name) => (await rowsOf(page).filter({ hasText: name }).first().innerText()).replace(/\s+/g, ' ')

try {
  /* ============ Гърция изключена: нищо не се променя ============ */
  await mock('greece?on=0')
  {
    const { page, errors } = await open(DESK)
    await page.goto(`${base}/`)
    await settle(page)
    ok('изключена: в менюто няма „Декларации“', (await page.locator('aside nav a', { hasText: 'Декларации' }).count()) === 0)
    ok('изключена: таблото не показва декларации', (await page.getByText(/декларации? за престой/i).count()) === 0)
    await page.goto(`${base}/declarations`)
    await settle(page)
    ok('изключена: екранът „Декларации“ показва „Още няма имот в Гърция“', (await page.getByText('Още няма имот в Гърция').count()) === 1)
    await page.goto(`${base}/properties/${P1}`)
    await settle(page)
    ok('изключена: картата „Регистрация в Гърция“ е тук, с изключен ключ и без полета', (await page.getByRole('heading', { name: 'Регистрация в Гърция' }).count()) === 1 && (await page.getByLabel('Този имот е в Гърция').isChecked()) === false && (await page.getByLabel('ATAK').count()) === 0)
    await page.goto(`${base}/stay/vila-elia`)
    await settle(page)
    ok('изключена: публичната страница няма номер', (await page.locator('.stay-reg').count()) === 0)
    ok('изключена: без грешки в конзолата', errors.length === 0, errors.join(' | '))
  }

  /* ============ Гърция включена ============ */
  await mock('greece?on=1')
  const desk = await open(DESK)
  const { page, errors } = desk

  // меню и таблото
  await page.goto(`${base}/`)
  await settle(page)
  ok('включена: менюто има „Декларации“', (await page.locator('aside nav a', { hasText: 'Декларации' }).count()) === 1)
  const att = page.locator('#attention-title').locator('xpath=ancestor::section')
  const attText = (await att.innerText()).replace(/\s+/g, ' ')
  ok('таблото: „Чака вас“ има просрочена декларация', /Просрочена декларация за престой/.test(attText), attText.slice(0, 300))
  ok('таблото: „Чака вас“ има 2 декларации, които чакат подаване, със срок', /2 декларации за престой чакат подаване/.test(attText) && /Най-близкият срок е \d\d\.\d\d\.\d{4}/.test(attText), attText.slice(0, 400))
  ok('таблото: редовете водят към /declarations', (await att.locator('a[href="/declarations"]').count()) === 2)

  // екранът
  await page.goto(`${base}/declarations`)
  await settle(page)
  const stats = (await page.locator('main').innerText()).replace(/\s+/g, ' ')
  ok('екран: заглавие и пояснение', /Декларации за престой/.test(stats) && /до 20-о число на следващия месец/.test(stats))
  ok('екран: бройчета — 1 просрочена, 2 чакат, 1 подадена, 1 с липсващи данни', /Просрочени 1/.test(stats) && /Чакат подаване 2/.test(stats) && /Подадени 1/.test(stats) && /1 с липсващи данни/.test(stats), stats.slice(0, 400))
  ok('екран: „За подаване“ показва 4 реда (просрочена, 2 чакащи, предстоящ)', (await rowsOf(page).count()) === 4)
  ok('екран: първа е просрочената (Anna Schmidt)', /Anna Schmidt/.test(await rowsOf(page).first().innerText()))
  ok('екран: отказаната, подадената и дългият престой не са в „За подаване“', (await page.getByText('Отказан гост').count()) === 0 && (await page.getByText('Eleni Georgiou').count()) === 0 && (await page.getByText('Дългосрочен наемател').count()) === 0)
  const anna = await rowText(page, 'Anna Schmidt')
  ok('екран: Anna — „Просрочена“, данните пълни (платформа по подразбиране)', /Просрочена/.test(anna) && /просрочена с \d+ дни/.test(anna) && /Пълни/.test(anna), anna)
  const nikos = await rowText(page, 'Nikos Papadopoulos')
  ok('екран: Nikos — „Чака подаване“ със срок, 540,00 €, данни пълни', /Чака подаване/.test(nikos) && /\d\d\.\d\d\.\d{4}/.test(nikos) && /540/.test(nikos) && /Пълни/.test(nikos), nikos)
  const hans = await rowText(page, 'Hans Müller')
  ok('екран: Hans — липсват „гражданство“ и „начин на плащане“', /гражданство/.test(hans) && /начин на плащане/.test(hans) && !/Пълни/.test(hans), hans)
  const marc = await rowText(page, 'Marc Dubois')
  ok('екран: Marc — „Още не е напуснал“, още няма срок за действие', /Още не е напуснал/.test(marc), marc)
  ok('екран: името е връзка към резервацията (?focus=)', (await page.locator('table a', { hasText: 'Nikos Papadopoulos' }).getAttribute('href')) === `/bookings?focus=${BK(60)}`)
  ok('екран: бележката, че StayFlow не подава вместо собственика', /StayFlow не го прави вместо вас/.test(stats))

  // филтри
  await page.getByRole('button', { name: 'Всички' }).click()
  ok('филтър „Всички“: 6 реда (без отказаната) — с подадената и 70-те нощи', (await rowsOf(page).count()) === 6)
  const long = await rowText(page, 'Дългосрочен наемател')
  ok('„Всички“: 70 нощи → „Над 59 нощи“ и „Друга декларация“, без бутон за подаване', /Над 59 нощи/.test(long) && /Друга декларация/.test(long) && !/Отбележи като подадена/.test(long), long)
  await page.getByRole('button', { name: 'Подадени' }).click()
  ok('филтър „Подадени“: само Eleni', (await rowsOf(page).count()) === 1 && /Eleni Georgiou/.test(await rowsOf(page).first().innerText()) && /Подадена/.test(await rowsOf(page).first().innerText()))
  await page.getByRole('button', { name: 'Просрочени' }).click()
  ok('филтър „Просрочени“: само Anna', (await rowsOf(page).count()) === 1 && /Anna Schmidt/.test(await rowsOf(page).first().innerText()))
  await page.getByRole('button', { name: 'Чакат', exact: true }).click()
  await page.getByLabel('Имот').selectOption({ label: 'Студио „Мора“' })
  ok('филтър по имот: само Hans (Мора), 1 ред', (await rowsOf(page).count()) === 1 && /Hans Müller/.test(await rowsOf(page).first().innerText()))
  await page.getByLabel('Имот').selectOption({ value: '' })
  ok('филтър по имот: „Всички“ връща 4 реда', (await rowsOf(page).count()) === 4)

  // действия
  await writes(true)
  await rowsOf(page).filter({ hasText: 'Nikos Papadopoulos' }).getByRole('button', { name: 'Отбележи като подадена' }).click()
  await page.waitForTimeout(500)
  let w = (await writes()).filter((x) => x.table === 'stay_declarations')
  ok('действие: „Отбележи като подадена“ записва status=submitted с дата', w.length === 1 && w[0].body.booking_id === BK(60) && w[0].body.status === 'submitted' && typeof w[0].body.submitted_at === 'string', JSON.stringify(w))
  await writes(true)
  await page.getByRole('button', { name: 'Подадени' }).click()
  await rowsOf(page).filter({ hasText: 'Eleni Georgiou' }).getByRole('button', { name: 'Върни в чакащи' }).click()
  await page.waitForTimeout(500)
  w = (await writes()).filter((x) => x.table === 'stay_declarations')
  ok('действие: „Върни в чакащи“ записва status=pending без дата', w.length === 1 && w[0].body.booking_id === BK(62) && w[0].body.status === 'pending' && w[0].body.submitted_at === null, JSON.stringify(w))
  await page.getByRole('button', { name: 'Чакат', exact: true }).click()

  // експорт
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Експорт за подаване/ }).click()])
  const csv = readFileSync(await dl.path(), 'utf8')
  const lines = csv.replace(/^﻿/, '').split('\r\n')
  ok('експорт: файл declarations-ГГГГ-ММ.csv с BOM', /^declarations-\d{4}-\d\d\.csv$/.test(dl.suggestedFilename()) && csv.startsWith('﻿'), dl.suggestedFilename())
  ok('експорт: заглавия на английски', lines[0].startsWith('AMA;Property;Platform;Check-in;Check-out;Nights;Year;Amount EUR;Payment method;Guest country;Guest AFM;Guest passport;Name as in passport;Deadline;Status'), lines[0])
  const annaLine = lines.find((l) => l.includes('Anna Schmidt'))
  const nikosLine = lines.find((l) => l.includes('Nikos')) // Nikos не е в CSV (името на госта не се експортира) — проверяваме по сума
  ok('експорт: Anna → Airbnb, паспорт C01X00T47, име в паспорта, държава DE, платформа', !!annaLine && /;Airbnb;/.test(annaLine) && /;DE;;C01X00T47;Anna Schmidt;/.test(annaLine) && /;platform;/.test(annaLine), annaLine)
  ok('експорт: гръцки гост → ΑΦΜ без паспорт', lines.some((l) => /;540;cash;GR;123456783;;;/.test(l)), lines.join(' || ').slice(0, 300))
  ok('експорт: номерът AMA на имота е в първата колона; личните имена на гостите не се експортират като отделна колона', lines.slice(1).filter(Boolean).every((l) => l.startsWith('00000123456;') || l.startsWith(';')) && !nikosLine)
  ok('експорт: само показаните реда (4 − 0 дълги = 4)', lines.filter(Boolean).length - 1 === 4, String(lines.filter(Boolean).length - 1))

  await page.screenshot({ path: path.join(OUT, 'declarations-desktop.png') })

  // формата за резервация
  await page.goto(`${base}/bookings?focus=${BK(60)}`)
  await settle(page)
  const dlg = page.locator('form', { hasText: 'Данни за декларацията' })
  ok('форма: секция „Данни за декларацията“ при имот в Гърция', (await dlg.count()) === 1)
  ok('форма: заредени са гражданство Гърция и ΑΦΜ', (await page.getByLabel('Гражданство на госта').inputValue()) === 'GR' && (await page.getByLabel('ΑΦΜ на госта').inputValue()) === '123456783')
  ok('форма: за гръцки гост няма паспорт', (await page.getByLabel('Номер на паспорт').count()) === 0)
  await page.getByLabel('Гражданство на госта').selectOption('DE')
  ok('форма: за чужденец — паспорт и име като в паспорта, без ΑΦΜ', (await page.getByLabel('Номер на паспорт').count()) === 1 && (await page.getByLabel('Име както в паспорта').count()) === 1 && (await page.getByLabel('ΑΦΜ на госта').count()) === 0)
  await page.getByLabel('Гражданство на госта').selectOption('GR')
  await page.getByLabel('ΑΦΜ на госта').fill('123456789')
  await page.getByRole('button', { name: 'Запази', exact: true }).click()
  await page.waitForTimeout(400)
  ok('форма: грешен ΑΦΜ → съобщение и нищо не се записва', (await page.getByText('ΑΦΜ не е валиден').count()) === 1 && (await writes()).filter((x) => x.table === 'bookings').length === 0)
  await page.getByLabel('ΑΦΜ на госта').fill('EL 123 456 783')
  await page.getByLabel('Начин на плащане').selectOption('bank')
  await writes(true)
  await page.getByRole('button', { name: 'Запази', exact: true }).click()
  await page.waitForTimeout(600)
  const ws = await writes()
  const bk = ws.find((x) => x.table === 'bookings' && x.method === 'PATCH')
  const dc = ws.find((x) => x.table === 'stay_declarations')
  ok('форма: записва резервацията и после данните за декларацията', !!bk && !!dc, JSON.stringify(ws.map((x) => `${x.method} ${x.table}`)))
  ok('форма: ΑΦΜ се записва, паспортът — null, плащане bank, номерът на резервацията е от записа', dc?.body.guest_country === 'GR' && dc.body.guest_tax_id === 'EL 123 456 783' && dc.body.guest_passport === null && dc.body.pay_method === 'bank' && dc.body.booking_id === BK(60), JSON.stringify(dc?.body))

  // имот извън Гърция: без секция
  await page.goto(`${base}/bookings?new=1`)
  await settle(page)
  const form = page.locator('form', { has: page.getByLabel('Име на госта') })
  await form.getByLabel('Имот').selectOption({ label: 'Студио „Морски бриз“' })
  await page.waitForTimeout(400)
  ok('форма: имот извън Гърция няма секция за декларация', (await page.getByText('Данни за декларацията').count()) === 0)
  await form.getByLabel('Имот').selectOption({ label: 'Вила „Елия“' })
  await page.waitForTimeout(400)
  ok('форма: имот в Гърция я показва', (await page.getByText('Данни за декларацията').count()) === 1)
  // дълъг престой и Нова година
  const y = new Date().getFullYear()
  await form.getByLabel('Настаняване').fill(`${y + 1}-01-01`)
  await form.getByLabel('Напускане').fill(`${y + 1}-03-15`)
  await page.waitForTimeout(300)
  ok('форма: над 59 нощи → „друга декларация“', (await page.getByText(/нощи — над 59/).count()) === 1)
  await form.getByLabel('Настаняване').fill(`${y}-12-28`)
  await form.getByLabel('Напускане').fill(`${y + 1}-01-04`)
  await form.getByLabel('Обща цена (€)').fill('700')
  await page.waitForTimeout(300)
  const split = (await page.locator('fieldset', { hasText: 'Данни за декларацията' }).innerText()).replace(/\s+/g, ' ')
  ok('форма: престой през Нова година → 2 декларации (4 нощи през 2026 · 400,00 €; 3 нощи през 2027 · 300,00 €)', /Подават се 2 декларации/.test(split) && new RegExp(`4 нощи през ${y} · 400`).test(split) && new RegExp(`3 нощи през ${y + 1} · 300`).test(split), split)
  await page.locator('fieldset', { hasText: 'Данни за декларацията' }).screenshot({ path: path.join(OUT, 'booking-form-section.png') })

  // карта на имота
  await page.goto(`${base}/properties/${G2}`)
  await settle(page)
  const card = page.locator('.card', { has: page.getByRole('heading', { name: 'Регистрация в Гърция' }) })
  ok('имот: за Гърция без номер — предупреждение', (await page.getByText('Липсва номер на имота').count()) === 1 && (await page.getByLabel('Този имот е в Гърция').isChecked()) === true)
  await card.getByLabel('AMA на имота').fill('a!')
  await card.getByRole('button', { name: 'Запази', exact: true }).click()
  await page.waitForTimeout(300)
  ok('имот: невалиден номер → съобщение', (await page.getByText('Номерът може да съдържа само букви').count()) === 1)
  await card.getByLabel('AMA на имота').fill('00000555555')
  await card.getByLabel('ATAK').fill('87654321')
  await writes(true)
  await card.getByRole('button', { name: 'Запази', exact: true }).click()
  await page.waitForTimeout(500)
  const rg = (await writes()).find((x) => x.table === 'property_registry')
  ok('имот: записва property_id, държава, вид, номер и ATAK', rg?.body.property_id === G2 && rg.body.country === 'GR' && rg.body.kind === 'ama' && rg.body.number === '00000555555' && rg.body.atak === '87654321', JSON.stringify(rg?.body))
  ok('имот: „Данните са записани“', (await page.getByText('Данните са записани.').count()) === 1)
  await card.getByLabel('Този имот е в Гърция').uncheck()
  await writes(true)
  await card.getByRole('button', { name: 'Запази', exact: true }).click()
  await page.waitForTimeout(500)
  const off = (await writes()).find((x) => x.table === 'property_registry')
  ok('имот: изключване на Гърция записва country=BG', off?.body.country === 'BG', JSON.stringify(off?.body))
  await card.screenshot({ path: path.join(OUT, 'property-card.png') })

  // публична страница
  await page.goto(`${base}/stay/vila-elia`)
  await settle(page)
  ok('публична страница: AMA 00000123456 под града', (await page.locator('.stay-reg').innerText()).trim() === 'AMA 00000123456')
  await page.goto(`${base}/stay/vila-elia?lang=en`)
  await settle(page)
  ok('публична страница на английски: номерът е същият', (await page.locator('.stay-reg').innerText()).trim() === 'AMA 00000123456')

  // достъпност и препълване на компютър
  await page.goto(`${base}/declarations`)
  await settle(page)
  const axeDesk = await axe(page)
  ok('axe на /declarations (компютър): без нарушения', axeDesk.length === 0, axeDesk.join(', '))
  ok('компютър: без грешки в конзолата', errors.length === 0, errors.join(' | '))

  /* ============ Телефон ============ */
  const ph = await open(PHONE)
  await ph.page.goto(`${base}/declarations`)
  await settle(ph.page)
  const over = await ph.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  ok('телефон: /declarations без хоризонтално препълване на страницата', over <= 0, String(over))
  const axePhone = await axe(ph.page)
  ok('axe на /declarations (телефон): без нарушения', axePhone.length === 0, axePhone.join(', '))
  const seg = await ph.page.locator('[role=group][aria-label="Показване"]').evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth, last: el.lastElementChild.getBoundingClientRect().right, box: el.getBoundingClientRect().right }))
  ok('телефон: и четирите бутона на филтъра се вместват без превъртане', seg.scroll <= seg.client + 1 && seg.last <= seg.box + 1, JSON.stringify(seg))
  await ph.page.getByRole('button', { name: 'Още' }).click()
  await ph.page.waitForTimeout(500)
  ok('телефон: листът „Още“ има „Декларации“', (await ph.page.getByRole('dialog').getByText('Декларации', { exact: true }).count()) >= 1)
  await ph.page.keyboard.press('Escape')
  await ph.page.waitForTimeout(300)
  await ph.page.screenshot({ path: path.join(OUT, 'declarations-phone.png') })
  await ph.page.goto(`${base}/`)
  await settle(ph.page)
  const overHome = await ph.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  ok('телефон: таблото с декларациите без препълване', overHome <= 0, String(overHome))
  ok('телефон: без грешки в конзолата', ph.errors.length === 0, ph.errors.join(' | '))

  /* ============ Гръцки ============ */
  const el = await open(DESK, { lang: 'el' })
  await el.page.goto(`${base}/declarations`)
  await settle(el.page)
  const elText = (await el.page.locator('main').innerText()).replace(/\s+/g, ' ')
  ok('гръцки: заглавието и бройчетата са преведени', /Δηλώσεις διαμονής/.test(elText) && /Εκπρόθεσμες/.test(elText) && /Αναμένουν υποβολή/.test(elText), elText.slice(0, 200))
  const names = ['Вила „Елия“', 'Студио „Мора“', 'Дългосрочен наемател', 'Отказан гост']
  const leftover = names.reduce((t, n) => t.split(n).join(''), elText).match(/[А-Яа-я]{2,}/g)
  ok('гръцки: на /declarations не са останали български думи (освен имената на имоти и гости)', !leftover, (leftover ?? []).slice(0, 8).join(', '))
  await el.page.goto(`${base}/bookings?focus=${BK(60)}`)
  await settle(el.page)
  const elForm = (await el.page.locator('fieldset', { hasText: 'Στοιχεία για τη δήλωση' }).innerText()).replace(/\s+/g, ' ')
  ok('гръцки: формата за декларация е преведена', /Υπηκοότητα επισκέπτη/.test(elForm) && /Τρόπος πληρωμής/.test(elForm) && /ΑΦΜ επισκέπτη/.test(elForm), elForm.slice(0, 200))
  ok('гръцки: държавите са с гръцки имена (Ελλάδα)', (await el.page.getByLabel('Υπηκοότητα επισκέπτη').locator('option', { hasText: 'Ελλάδα' }).count()) === 1)
  await el.page.goto(`${base}/`)
  await settle(el.page)
  const elAtt = (await el.page.locator('#attention-title').locator('xpath=ancestor::section').innerText()).replace(/\s+/g, ' ')
  ok('гръцки: „Σας περιμένουν“ има преведени декларации', /Εκπρόθεσμη δήλωση διαμονής/.test(elAtt) && /2 δηλώσεις διαμονής περιμένουν υποβολή/.test(elAtt), elAtt.slice(0, 300))
  ok('гръцки: без грешки в конзолата', el.errors.length === 0, el.errors.join(' | '))
} finally {
  await mock('greece?on=0').catch(() => {})
  for (const b of browsers) await b.close().catch(() => {})
}

console.log(`greece: ${pass} успешни, ${fail} провалени`)
process.exit(fail ? 1 : 0)
