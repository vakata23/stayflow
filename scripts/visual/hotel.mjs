// Хотели (миграция 019): стаи в имота, календар на стаите, избор на вид стая от госта, изолация от старото.
//   node scripts/visual/hotel.mjs http://localhost:4174 [папка за снимки]
// Данните се включват от тестовата среда: /__mock/hotel?on=1 (с &m019=1 — миграция 019 „не е пусната“).
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createRequire } from 'node:module'
import { USER } from './seed.mjs'

const require = createRequire(import.meta.url)
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
const [base = 'http://localhost:4174', shotsArg] = process.argv.slice(2)
const OUT = shotsArg ? path.resolve(shotsArg) : path.join(path.dirname(fileURLToPath(import.meta.url)), 'out', 'hotel')
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

const HT = '26666666-0000-4000-8000-000000000006' // Хотел „Слънце“
const jwt = () => {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b({ alg: 'HS256', typ: 'JWT' })}.${b({ sub: USER.id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 86400 })}.sig`
}
const session = { access_token: jwt(), token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: USER }
const COARSE = ['--blink-settings=primaryPointerType=2,availablePointerTypes=2,primaryHoverType=1,availableHoverTypes=1']
const DESK = { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false }
const PHONE = { width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true }

const browsers = []
async function open(vp, { lang, signedIn = true } = {}) {
  const browser = await chromium.launch({ channel: 'chrome', args: vp.isMobile ? COARSE : [] })
  browsers.push(browser)
  const ctx = await browser.newContext({ ...vp, viewport: { width: vp.width, height: vp.height }, locale: 'bg-BG', timezoneId: 'Europe/Sofia' })
  await ctx.addInitScript(
    ([s, l, sign]) => {
      try {
        if (sign) localStorage.setItem('sb-localhost-auth-token', JSON.stringify(s))
        localStorage.setItem('stayflow.autoSetupSeen', '1')
        if (l) localStorage.setItem('stayflow.appLang', l)
      } catch {}
    },
    [session, lang ?? null, signedIn]
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
const axeIn = async (page, selector) =>
  page.evaluate(async ([src, sel]) => {
    // eslint-disable-next-line no-eval
    ;(0, eval)(src)
    const r = await window.axe.run({ include: [[sel]] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }, resultTypes: ['violations'] })
    return r.violations.map((v) => `${v.id}×${v.nodes.length}`)
  }, [axeSource, selector])
const plusDays = (n) => {
  const d = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Sofia' }).format(new Date()) + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const text = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ')
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)

try {
  await mock('hotel?on=1')
  const { page, errors } = await open(DESK)

  /* ============ Списък с имоти ============ */
  await page.goto(`${base}/properties`)
  await settle(page)
  const list = await text(page.locator('main'))
  ok('списък: хотелът е една карта, с брой стаи', /Хотел „Слънце“/.test(list) && /5 стаи/.test(list), list.slice(0, 300))
  ok('списък: стаите не са отделни карти', !/Стая 101/.test(list) && !/Стая 201/.test(list))
  ok('списък: резервациите на стаите се броят към хотела (4 потвърдени, чакащата и отказаната — не)', /4 активни резервации/.test(await text(page.locator('a[href="/properties/' + HT + '"]'))), await text(page.locator('a[href="/properties/' + HT + '"]')))
  await page.screenshot({ path: path.join(OUT, '01-list.png') })

  /* ============ Нов имот: видът „Хотел“ ============ */
  await page.goto(`${base}/properties/new`)
  await settle(page)
  const opts = await page.locator('main select option').allInnerTexts()
  ok('нов имот: има вид „Хотел“', opts.includes('Хотел'), opts.join(','))

  /* ============ Картата „Стаи“ ============ */
  await page.goto(`${base}/properties/${HT}`)
  await settle(page)
  const card = page.locator('#hotel-rooms')
  ok('хотел: картата „Стаи“ е видима', (await card.count()) === 1 && /Стаи/.test(await text(card.locator('h2'))))
  const ct = await text(card)
  ok('хотел: две групи — Двойна стая (3, от 80 €) и Семеен апартамент (2, от 150 €)', /Двойна стая · 3 стаи · от 80 €/.test(ct) && /Семеен апартамент · 2 стаи · от 150 €/.test(ct), ct.slice(0, 400))
  ok('хотел: петте стаи са връзки към страницата им', (await card.locator('a[href^="/properties/"]').count()) === 5)
  ok('хотел: днес 2 от 5 заети (40%), 1 пристига, 0 заминават', /Днес: 2 от 5 стаи са заети \(40%\), 1 пристигат, 0 заминават\./.test(ct), ct)
  ok('хотел: връзка към календара на стаите', (await card.locator(`a[href="/hotels/${HT}/calendar"]`).count()) === 1)
  ok('хотел: началният номер е следващият след най-големия (203)', (await card.locator('input').nth(3).inputValue()) === '203')
  await card.scrollIntoViewIfNeeded()
  await page.screenshot({ path: path.join(OUT, '02-rooms-card.png') })

  // проверки на формата
  await writes(true)
  const inputs = card.locator('input')
  await inputs.nth(0).fill('Студио')
  await inputs.nth(1).fill('0')
  await card.getByRole('button', { name: 'Добави стаите' }).click()
  ok('форма: брой 0 → съобщение, нищо не се записва', /Броят стаи трябва да е поне 1/.test(await text(card)) && (await writes()).length === 0)
  await inputs.nth(1).fill('3')
  await inputs.nth(3).fill('101')
  await card.getByRole('button', { name: 'Добави стаите' }).click()
  ok('форма: заето име „Стая 101“ → съобщение', /Вече има стая „Стая 101“/.test(await text(card)) && (await writes()).length === 0)
  await inputs.nth(0).fill('')
  await inputs.nth(3).fill('203')
  await card.getByRole('button', { name: 'Добави стаите' }).click()
  ok('форма: без вид на стаите → съобщение', /Напишете вида на стаите/.test(await text(card)))

  // успешно добавяне
  await inputs.nth(0).fill('Студио')
  await inputs.nth(1).fill('2')
  await inputs.nth(3).fill('203')
  await inputs.nth(4).fill('2')
  await inputs.nth(5).fill('70')
  await card.getByRole('button', { name: 'Добави стаите' }).click()
  await page.waitForTimeout(500)
  const w = await writes()
  const posted = w.find((x) => x.table === 'properties' && x.method === 'POST')
  ok('добавяне: една заявка с две стаи', Array.isArray(posted?.body) && posted.body.length === 2, JSON.stringify(w).slice(0, 300))
  ok('добавяне: имена „Стая 203“ и „Стая 204“, вид „Студио“, хотелът е родител', posted?.body.map((r) => r.name).join() === 'Стая 203,Стая 204' && posted.body.every((r) => r.room_type === 'Студио' && r.parent_id === HT && r.max_guests === 2))
  ok('добавяне: стаите са публикувани, със свой адрес за заявки, вид „Стая“ и град на хотела', posted?.body.every((r) => r.is_listed === true && /^hotel-slance-staya-20[34]$/.test(r.slug) && r.property_type === 'room' && r.city === 'Несебър'), JSON.stringify(posted?.body?.[0]))
  ok('добавяне: собственикът е профилът на влезлия', posted?.body.every((r) => typeof r.owner_id === 'string' && r.owner_id.length > 10))
  ok('добавяне: основната цена 70 € се записва в настройките', w.some((x) => x.table === 'property_settings' && JSON.stringify(x.body).includes('"base_price":70')))
  ok('добавяне: съобщение за успех', /Добавени са 2 стаи\./.test(await text(card)))

  /* ============ Календар на стаите ============ */
  await card.locator(`a[href="/hotels/${HT}/calendar"]`).click()
  await settle(page)
  ok('календар: адресът е /hotels/…/calendar, заглавие', page.url().endsWith(`/hotels/${HT}/calendar`) && (await page.getByRole('heading', { level: 1, name: 'Календар на стаите' }).count()) === 1)
  const table = page.locator('table[aria-label="Календар на стаите"]')
  const heads = await table.locator('tbody th[scope=row]').allInnerTexts()
  ok('календар: пет реда със стаи + ред „Свободни стаи“', heads.length === 6 && heads.slice(0, 5).join('|') === 'Стая 101|Стая 102|Стая 103|Стая 201|Стая 202' && heads[5].trim() === 'Свободни стаи', heads.join('|'))
  const groupsRow = await table.locator('tbody th[scope=rowgroup]').allInnerTexts()
  ok('календар: две групи по вид', groupsRow.length === 2 && /Двойна стая/.test(groupsRow[0]) && /Семеен апартамент/.test(groupsRow[1]), groupsRow.join('|'))
  ok('календар: 14 дни в колоните', (await table.locator('thead th').count()) === 15)
  const bars = await table.locator('tbody button').allInnerTexts()
  ok('календар: лентите са по резервациите (без отказаната)', bars.sort().join('|') === ['Anna Schmidt', 'Иван Стоянов', 'Мария Георгиева', 'Семейство Колеви', 'Чакащ Гост'].sort().join('|'), bars.join('|'))
  const free = (await table.locator('tbody tr').last().locator('td').allInnerTexts()).map((x) => x.trim())
  ok('календар: свободни стаи по дни — 4,3,2,2,2,3 (смяна на госта в стая 101 на 3-ия ден)', free.slice(0, 6).join() === '4,3,2,2,2,3', free.join())
  ok('календар: „Днес: 2 от 5 заети“', /Днес: 2 от 5 заети/.test(await text(page.locator('[data-testid=hotel-cal-today]'))))
  // чакащата е само с контур
  const pend = table.locator('tbody button', { hasText: 'Чакащ Гост' })
  ok('календар: чакащата е само с контур (без плътен цвят)', /ring-2/.test((await pend.getAttribute('class')) ?? ''))
  await page.screenshot({ path: path.join(OUT, '03-calendar.png') })

  // клик на лента → редакция
  await table.locator('tbody button', { hasText: 'Иван Стоянов' }).click()
  await page.waitForTimeout(400)
  const dialog = page.getByRole('dialog')
  ok('календар: клик на лента отваря резервацията за редакция', (await dialog.count()) === 1 && (await dialog.locator('input[value="Иван Стоянов"]').count()) === 1)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  // клик на празна клетка → нова резервация за тази стая и ден
  const emptyCell = table.locator(`td[aria-label^="Стая 202, ${plusDays(8)}"]`)
  ok('календар: има празна клетка за стая 202 след 8 дни', (await emptyCell.count()) === 1)
  await emptyCell.click()
  await page.waitForTimeout(400)
  const dlg2 = page.getByRole('dialog')
  ok('календар: клик на празна клетка отваря нова резервация със стаята и деня', (await dlg2.count()) === 1 && (await dlg2.locator('select').first().inputValue()) === '27500000-0000-4000-8000-000000000005' && (await dlg2.locator('input[type=date]').first().inputValue()) === plusDays(8))
  ok('календар: изборът на стая във формата е само по стаите (5 + „Изберете имот“)', (await dlg2.locator('select').first().locator('option').count()) === 6)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  // навигация
  const monthBefore = await text(page.locator('main span.font-bold').first())
  await page.getByRole('button', { name: 'Напред с една седмица' }).click()
  await page.waitForTimeout(500)
  const bars2 = await table.locator('tbody button').allInnerTexts()
  ok('календар: „Напред“ с седмица — остава само дългата резервация (Колеви до 7-ия ден); Иван и Мария са преди прозореца', bars2.includes('Семейство Колеви') && !bars2.includes('Мария Георгиева') && !bars2.includes('Иван Стоянов'), bars2.join('|'))
  await page.getByRole('button', { name: 'Днес' }).click()
  await page.waitForTimeout(500)
  ok('календар: „Днес“ връща към началото', (await table.locator('tbody button', { hasText: 'Иван Стоянов' }).count()) === 1)
  ok('календар: диапазонът е написан с месец', monthBefore.length > 5, monthBefore)

  /* ============ Резервациите не могат да са на самия хотел ============ */
  await page.goto(`${base}/calendar`)
  await settle(page)
  const calOpts = await page.locator('main select').first().locator('option').allInnerTexts()
  ok('общ календар: изборът на имот няма хотела, а стаите му', !calOpts.includes('Хотел „Слънце“') && calOpts.includes('Стая 101') && calOpts.includes('Стая 202'), calOpts.join(','))
  await page.goto(`${base}/bookings`)
  await settle(page)
  await page.getByRole('button', { name: /Нова резервация/ }).first().click()
  await page.waitForTimeout(400)
  const selOpts = await page.getByRole('dialog').locator('select').first().locator('option').allInnerTexts()
  ok('нова резервация: хотелът не е за избор, стаите са', !selOpts.includes('Хотел „Слънце“') && selOpts.includes('Стая 103'), selOpts.join(','))
  await page.keyboard.press('Escape')

  /* ============ Достъпност ============ */
  await page.goto(`${base}/properties/${HT}`)
  await settle(page)
  const a1 = await axeIn(page, '#hotel-rooms')
  ok('достъпност: картата „Стаи“ (останалото в страницата на имота е както при всеки имот)', a1.length === 0, a1.join(','))
  await page.goto(`${base}/hotels/${HT}/calendar`)
  await settle(page)
  const a2 = await axe(page)
  ok('достъпност: календарът на стаите', a2.length === 0, a2.join(','))
  ok('без грешки в конзолата (собственик)', errors.length === 0, errors.join(' | '))

  /* ============ Телефон ============ */
  const ph = await open(PHONE)
  await ph.page.goto(`${base}/hotels/${HT}/calendar`)
  await settle(ph.page)
  ok('телефон: календарът не разширява страницата (таблицата се върти в себе си)', await noOverflow(ph.page))
  await ph.page.screenshot({ path: path.join(OUT, '04-calendar-phone.png') })
  await ph.page.goto(`${base}/properties/${HT}`)
  await settle(ph.page)
  ok('телефон: страницата на хотела не излиза извън екрана', await noOverflow(ph.page))
  await ph.page.locator('#hotel-rooms').scrollIntoViewIfNeeded()
  await ph.page.screenshot({ path: path.join(OUT, '05-rooms-phone.png') })

  /* ============ Гост: страницата на хотела ============ */
  const g = await open(DESK, { signedIn: false })
  const sentBodies = []
  await g.ctx.route('**/api/booking-request', async (route) => {
    sentBodies.push(JSON.parse(route.request().postData() || '{}'))
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })
  await g.page.goto(`${base}/stay/hotel-slance?lang=bg`)
  await settle(g.page)
  const booking = g.page.locator('#quote-section')
  ok('гост: вместо проверка на цена за целия имот — „Стаи и цени“', (await booking.locator('h2', { hasText: 'Стаи и цени' }).count()) === 1 && (await booking.locator('.stay-price b').count()) === 1, await text(booking))
  ok('гост: най-ниската цена „от 80 €“', /от\s*80 €/.test(await text(booking.locator('.stay-price'))), await text(booking.locator('.stay-price')))
  ok('гост: преди търсене няма списък със стаи', (await booking.locator('.stay-rooms').count()) === 0)
  const dates = booking.locator('input[type=date]')
  // 3 нощи след 10 дни: всички стаи са свободни
  await dates.nth(0).fill(plusDays(10))
  await dates.nth(1).fill(plusDays(13))
  await booking.getByRole('button', { name: 'Покажи свободните стаи' }).click()
  await g.page.waitForTimeout(600)
  const rooms = booking.locator('.stay-room')
  ok('гост: два вида стаи', (await rooms.count()) === 2, await text(booking))
  const r1 = await text(rooms.nth(0))
  const r2 = await text(rooms.nth(1))
  ok('гост: Двойна стая — свободни 3, 3 × 80 = 240 €', /Двойна стая/.test(r1) && /Свободни стаи: 3/.test(r1) && /240\.00 €/.test(r1), r1)
  ok('гост: Семеен апартамент — свободни 2, 450 € + 20 € почистване = 470 €', /Семеен апартамент/.test(r2) && /Свободни стаи: 2/.test(r2) && /470\.00 €/.test(r2) && /20\.00 €/.test(r2), r2)
  ok('гост: няма „Цял имот“ и брой гости на целия имот', !/Цял имот/.test(await text(g.page.locator('main'))) && !/до 6 гости/.test(await text(g.page.locator('main'))))
  ok('гост: адресът на стаята не се вижда на страницата', !/hotel-slance-\d/.test(await text(booking)))
  await g.page.screenshot({ path: path.join(OUT, '06-guest-results.png'), fullPage: true })
  // избор и заявка
  await rooms.nth(0).getByRole('button', { name: 'Избери' }).click()
  ok('гост: избраният вид е отбелязан', (await rooms.nth(0).getByRole('button').getAttribute('aria-pressed')) === 'true' && /Избрана/.test(await text(rooms.nth(0))))
  const reqCard = g.page.locator('.stay-card', { hasText: 'Изпратете заявка' }).or(g.page.locator('.stay-card form').last().locator('xpath=ancestor::div[contains(@class,"stay-card")]'))
  ok('гост: появява се формата за заявка', (await g.page.locator('.stay-card form input[autocomplete=name]').count()) === 1)
  await g.page.locator('.stay-card form input[autocomplete=name]').fill('Peter Müller')
  await g.page.locator('.stay-card form input[type=email]').fill('peter@example.com')
  await g.page.locator('.stay-card form button[type=submit]').last().click()
  ok('гост: без съгласие заявката не тръгва', sentBodies.length === 0 && (await g.page.locator('.stay-note--error').count()) >= 1)
  await g.page.locator('.stay-consent input').check()
  await g.page.locator('.stay-card form button[type=submit]').last().click()
  await g.page.waitForTimeout(600)
  const body = sentBodies[0]
  ok('гост: заявката тръгва към първата свободна стая от вида (hotel-slance-101)', body?.slug === 'hotel-slance-101', JSON.stringify(body))
  ok('гост: в заявката са датите, гостите и видът на стаята в съобщението', body?.check_in === plusDays(10) && body?.check_out === plusDays(13) && body?.num_guests === 2 && /Двойна стая/.test(body?.message ?? ''), JSON.stringify(body))
  ok('гост: показва се потвърждение', (await g.page.locator('[role=status]').count()) >= 1)
  void reqCard

  // дати със заети стаи: днес → +2 (r1 заета от 80, r2 от 82, остава r3 → 90 €)
  await g.page.goto(`${base}/stay/hotel-slance?lang=bg`)
  await settle(g.page)
  const b2 = g.page.locator('#quote-section')
  await b2.locator('input[type=date]').nth(0).fill(plusDays(0))
  await b2.locator('input[type=date]').nth(1).fill(plusDays(2))
  await b2.getByRole('button', { name: 'Покажи свободните стаи' }).click()
  await g.page.waitForTimeout(600)
  const rb = await text(b2.locator('.stay-room').nth(0))
  ok('гост: с две заети стаи остава 1 свободна двойна, предлага се на цена на третата (2 × 90 = 180 €)', /Свободни стаи: 1/.test(rb) && /180\.00 €/.test(rb), rb)
  // 3 гости: двойните не ставят
  await b2.locator('input[type=number]').fill('3')
  await b2.getByRole('button', { name: 'Покажи свободните стаи' }).click()
  await g.page.waitForTimeout(600)
  const rc = await text(b2.locator('.stay-room').nth(0))
  const rd = await text(b2.locator('.stay-room').nth(1))
  ok('гост: 3 гости — двойните не побират (без бутон), апартаментът става', /Имотът побира максимум 2/.test(rc) && (await b2.locator('.stay-room').nth(0).getByRole('button').count()) === 0 && (await b2.locator('.stay-room').nth(1).getByRole('button', { name: 'Избери' }).count()) === 1, rc + ' || ' + rd)
  // обратни дати
  await b2.locator('input[type=date]').nth(0).fill(plusDays(5))
  await b2.locator('input[type=date]').nth(1).fill(plusDays(3))
  await b2.getByRole('button', { name: 'Покажи свободните стаи' }).click()
  ok('гост: обратни дати → съобщение, без заявка към базата', (await b2.locator('.stay-note--error').count()) >= 1)
  const ga = await axe(g.page)
  ok('достъпност: публичната страница на хотела', ga.length === 0, ga.join(','))

  // английски
  await g.page.goto(`${base}/stay/hotel-slance?lang=en`)
  await settle(g.page)
  const be = g.page.locator('#quote-section')
  ok('гост: на английски — „Rooms and prices“, „Show free rooms“', (await be.locator('h2', { hasText: 'Rooms and prices' }).count()) === 1 && (await be.getByRole('button', { name: 'Show free rooms' }).count()) === 1, await text(be))
  for (const lang of ['el', 'mk', 'ro', 'sr']) {
    await g.page.goto(`${base}/stay/hotel-slance?lang=${lang}`)
    await settle(g.page)
    ok(`гост: ${lang} — заглавието е преведено (не е ключ „hotel.title“)`, !/hotel\./.test(await text(g.page.locator('#quote-section'))))
  }
  // телефон
  const gp = await open(PHONE, { signedIn: false })
  await gp.page.goto(`${base}/stay/hotel-slance?lang=bg`)
  await settle(gp.page)
  ok('телефон: страницата на хотела не излиза извън екрана', await noOverflow(gp.page))
  ok('без грешки в конзолата (гост)', g.errors.length === 0, g.errors.join(' | '))

  /* ============ Старото не е пипнато ============ */
  await g.page.goto(`${base}/stay/tihi-bryag?lang=bg`)
  await settle(g.page)
  ok('обикновен имот: старата проверка на цена е на място (без „Стаи и цени“)', (await g.page.locator('#quote-section h2', { hasText: 'Стаи и цени' }).count()) === 0 && (await g.page.locator('#quote-section button', { hasText: 'Провери цена' }).count()) >= 1, await text(g.page.locator('#quote-section')))

  /* ============ Миграция 019 не е пусната: всичко старо работи, хотелската част се скрива ============ */
  await mock('hotel?on=1&m019=1')
  const m = await open(DESK)
  await m.page.goto(`${base}/properties`)
  await settle(m.page)
  ok('без 019: списъкът с имоти се зарежда', (await m.page.locator('main h1').count()) >= 1 && /Вила/.test(await text(m.page.locator('main'))))
  await m.page.goto(`${base}/properties/new`)
  await settle(m.page)
  ok('без 019: няма вид „Хотел“ при нов имот', !(await m.page.locator('main select option').allInnerTexts()).includes('Хотел'))
  await m.page.goto(`${base}/properties/${HT}`)
  await settle(m.page)
  ok('без 019: страницата на хотела няма карта „Стаи“', (await m.page.locator('#hotel-rooms').count()) === 0)
  await m.page.goto(`${base}/hotels/${HT}/calendar`)
  await settle(m.page)
  ok('без 019: календарът на стаите казва, че го няма', /Няма календар на стаи/.test(await text(m.page.locator('main'))))
  const gm = await open(DESK, { signedIn: false })
  await gm.page.goto(`${base}/stay/hotel-slance?lang=bg`)
  await settle(gm.page)
  ok('без 019: публичната страница показва обикновената проверка на цена', (await gm.page.locator('#quote-section .stay-rooms').count()) === 0 && (await gm.page.locator('#quote-section button', { hasText: 'Провери цена' }).count()) >= 1)
  ok('без 019: без грешки в конзолата', m.errors.length === 0 && gm.errors.length === 0, m.errors.concat(gm.errors).join(' | '))

  /* ============ Гръцки ============ */
  await mock('hotel?on=1')
  const el = await open(DESK, { lang: 'el' })
  await el.page.goto(`${base}/properties/${HT}`)
  await settle(el.page)
  const elCard = await text(el.page.locator('#hotel-rooms'))
  ok('гръцки: картата „Δωμάτια“ е преведена, групите и броят са запазени', /Δωμάτια/.test(elCard) && /Προσθήκη δωματίων/.test(elCard) && /Σήμερα: 2 από 5 δωμάτια/.test(elCard), elCard.slice(0, 300))
  ok('гръцки: името на стаите и видът не са преведени (translate=no)', /Стая 101/.test(elCard) && /Двойна стая/.test(elCard))
  await el.page.goto(`${base}/hotels/${HT}/calendar`)
  await settle(el.page)
  ok('гръцки: календарът е преведен', /Ημερολόγιο δωματίων/.test(await text(el.page.locator('main'))) && /Ελεύθερα δωμάτια/.test(await text(el.page.locator('main'))))
  ok('гръцки: без грешки в конзолата', el.errors.length === 0, el.errors.join(' | '))
} finally {
  await mock('hotel?on=0').catch(() => {})
  for (const b of browsers) await b.close().catch(() => {})
}

console.log(`hotel: ${pass} успешни, ${fail} провалени`)
process.exit(fail ? 1 : 0)
