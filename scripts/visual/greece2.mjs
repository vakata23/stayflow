// Гърция, стъпки 2–4: съобщения към гостите, напомняния на таблото, безопасност, цени по канал, вграждане, такса „Климатична устойчивост“.
//   node scripts/visual/greece2.mjs http://localhost:4174 [папка за снимки]
// Гръцките данни се включват от тестовата среда: /__mock/greece?on=1 (с &m018=1 — миграция 018 „не е пусната“).
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createRequire } from 'node:module'
import { USER } from './seed.mjs'

const require = createRequire(import.meta.url)
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
const [base = 'http://localhost:4174', shotsArg] = process.argv.slice(2)
const OUT = shotsArg ? path.resolve(shotsArg) : path.join(path.dirname(fileURLToPath(import.meta.url)), 'out', 'greece2')
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

const G1 = '24444444-0000-4000-8000-000000000004' // Вила „Елия“: къща 94 м², публикувана, документи, надбавки
const G2 = '25555555-0000-4000-8000-000000000005' // Студио „Мора“: апартамент, непубликуван
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
  const ctx = await browser.newContext({ ...vp, viewport: { width: vp.width, height: vp.height }, locale: 'bg-BG', timezoneId: 'Europe/Sofia', permissions: ['clipboard-read', 'clipboard-write'] })
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
const plusDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)
const text = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ')

try {
  await mock('greece?on=1')
  const { page, errors } = await open(DESK)

  /* ============ Съобщения ============ */
  await page.goto(`${base}/messages?kind=before_arrival&booking=${BK(67)}`)
  await settle(page)
  const bookingSel = page.locator('main select').nth(0)
  const kindSel = page.locator('main select').nth(1)
  const preview = page.locator('[data-testid=msg-preview]')
  const pv = () => text(preview)
  ok('съобщения: менюто има „Съобщения“, заглавие на екрана', (await page.locator('aside nav a', { hasText: 'Съобщения' }).count()) === 1 && (await page.getByRole('heading', { level: 1, name: 'Съобщения' }).count()) === 1)
  ok('съобщения: избраната резервация и вид идват от адреса', (await bookingSel.inputValue()) === BK(67) && (await kindSel.inputValue()) === 'before_arrival')
  let t1 = await pv()
  ok('съобщения: гръцки гост (ΑΦΜ в данните) → съобщението е на гръцки, с името, кода, Wi-Fi и линка', /^Γεια σας Elena!/.test(t1) && /1976/.test(t1) && /MorskiBriz/.test(t1) && new RegExp(`/guest/${G1}`).test(t1), t1)
  ok('съобщения: няма останали {етикети}', !/[{}]/.test(t1))
  ok('съобщения: избраният език е „Ελληνικά“', (await page.getByRole('button', { name: 'Ελληνικά' }).getAttribute('aria-pressed')) === 'true')
  await kindSel.selectOption('declaration_data')
  t1 = await pv()
  ok('„Данни за декларацията“: иска паспорт и ΑΦΜ на гръцки', /διαβατηρίου/.test(t1) && /ΑΦΜ/.test(t1), t1)
  ok('адресът запомня избрания вид (?kind=)', /kind=declaration_data/.test(page.url()))
  await page.getByRole('button', { name: 'English' }).click()
  ok('английски: „Hello Elena!“ и текст за паспорт', /^Hello Elena!/.test(await pv()) && /passport number/.test(await pv()))
  await page.getByRole('button', { name: 'Български' }).click()
  ok('български: „Здравейте, Elena!“', /^Здравейте, Elena!/.test(await pv()))
  await kindSel.selectOption('payment_reminder')
  ok('„Напомняне за плащане“: показва сума в евро', /остатъкът за престоя в .* е \d[\d.]*,?\d* €|е \d+\.\d\d €/.test(await pv()), await pv())

  // редакция, етикети, запазване на устройството
  await kindSel.selectOption('confirm')
  const ta = page.locator('main textarea')
  await ta.fill('Здравей {name}! Код {code} {foo}')
  ok('редакция: прегледът се обновява веднага и непознат етикет остава видим', (await pv()) === 'Здравей Elena! Код 1976 {foo}', await pv())
  ok('редакция: предупреждение за непознат етикет', (await page.getByText('Непознат етикет: {foo}').count()) === 1)
  ok('редакция: копие се пази на това устройство', JSON.parse(await page.evaluate(() => localStorage.getItem('stayflow.msgTemplates'))).confirm.bg === 'Здравей {name}! Код {code} {foo}')
  await ta.fill('Здравей {name}!')
  await page.getByRole('button', { name: 'Код за входа', exact: true }).click()
  ok('етикет: бутонът „Код за входа“ вмъква {code} в шаблона', /\{code\}/.test(await ta.inputValue()) && (await pv()).includes('1976'), await ta.inputValue())
  await page.reload()
  await settle(page)
  await kindSel.selectOption('confirm')
  await page.getByRole('button', { name: 'Български' }).click() // след презареждане езикът пак е „по госта“ (гръцки); редакцията е за български
  ok('след презареждане собствената редакция е запазена', /^Здравей Elena!/.test(await pv()))
  await page.getByRole('button', { name: 'Върни по подразбиране' }).click()
  ok('„Върни по подразбиране“ връща стандартния текст и чисти запазеното', /^Здравейте, Elena! Потвърждавам резервацията/.test(await pv()) && (await page.evaluate(() => localStorage.getItem('stayflow.msgTemplates'))) === null)
  ok('след връщане бутонът изчезва', (await page.getByRole('button', { name: 'Върни по подразбиране' }).count()) === 0)

  // действия
  const viber = await page.getByRole('link', { name: 'Viber' }).getAttribute('href')
  const wa = await page.getByRole('link', { name: 'WhatsApp' }).getAttribute('href')
  ok('Viber: връзка „viber://forward?text=“ със съобщението', viber.startsWith('viber://forward?text=') && decodeURIComponent(viber).includes('Elena'), viber.slice(0, 60))
  ok('WhatsApp: връзка „wa.me“ със съобщението', wa.startsWith('https://wa.me/') && decodeURIComponent(wa).includes('Elena'), wa.slice(0, 60))
  await page.getByRole('button', { name: 'Копирай', exact: true }).click()
  await page.waitForTimeout(300)
  ok('Копирай: в клипборда е точно показаният текст', (await page.evaluate(() => navigator.clipboard.readText())).replace(/\s+/g, ' ') === (await pv()))
  await page.screenshot({ path: path.join(OUT, 'messages-desktop.png') })

  /* ============ Табло: напомняния ============ */
  await page.goto(`${base}/`)
  await settle(page)
  const att = await text(page.locator('#attention-title').locator('xpath=ancestor::section'))
  ok('табло: „2 гости пристигат утре“', /2 гости пристигат утре/.test(att), att.slice(0, 500))
  ok('табло: „2 гости пристигат скоро без данни за декларацията“', /2 гости пристигат скоро без данни за декларацията/.test(att), att.slice(0, 600))
  ok('табло: „2 документа за безопасност изтичат или са изтекли“', /2 документа за безопасност изтичат или са изтекли/.test(att), att.slice(0, 700))
  const sect = page.locator('#attention-title').locator('xpath=ancestor::section')
  ok('табло: „пристигат утре“ води към съобщението „Преди пристигане“ за гост', /^\/messages\?kind=before_arrival&booking=b/.test(await sect.locator('a', { hasText: 'пристигат утре' }).getAttribute('href')))
  ok('табло: „без данни“ води към „Данни за декларацията“', /^\/messages\?kind=declaration_data&booking=b/.test(await sect.locator('a', { hasText: 'без данни за декларацията' }).getAttribute('href')))
  ok('табло: безопасността води към имотите', (await sect.locator('a', { hasText: 'документа за безопасност' }).getAttribute('href')) === '/properties')
  await sect.locator('a', { hasText: 'пристигат утре' }).click()
  await settle(page)
  ok('клик върху напомнянето отваря екрана със съобщението и резервацията', /\/messages\?kind=before_arrival&booking=/.test(page.url()) && (await bookingSel.inputValue()).startsWith('b0000'))
  await page.goto(`${base}/`)
  await settle(page)
  await page.screenshot({ path: path.join(OUT, 'dashboard-desktop.png') })

  /* ============ Имот: безопасност, цени по канал, вграждане ============ */
  await page.goto(`${base}/properties/${G1}`)
  await settle(page)
  const safety = page.locator('.card', { has: page.getByRole('heading', { name: 'Безопасност', exact: true }) })
  const st = await text(safety)
  ok('безопасност: заглавие и „2 от 6 готови“', (await safety.count()) === 1 && /2 от 6 готови/.test(st), st.slice(0, 200))
  ok('безопасност: застраховка „Изтича скоро“, пожарогасител „Изтекло“, аптечка „Готово“, дератизация „Липсва“', /Застраховка гражданска отговорност.*Изтича скоро/.test(st) && /Пожарогасител \(проверка\).*Изтекло/.test(st) && /Аптечка.*Готово/.test(st) && /Сертификат за дератизация.*Липсва/.test(st), st)
  ok('безопасност: предупреждение за изтекъл документ', /Има изтекъл документ/.test(st))
  ok('безопасност: за застраховката показва срока и колко дни остават', /Остават 12 дни/.test(st), st)
  await safety.scrollIntoViewIfNeeded()
  await safety.screenshot({ path: path.join(OUT, 'safety-card.png') })
  await safety.getByLabel('Сертификат за дератизация').check()
  await safety.getByLabel('Важи до').last().fill(plusDays(200))
  await writes(true)
  await safety.getByRole('button', { name: 'Запази', exact: true }).click()
  await page.waitForTimeout(500)
  const sw = (await writes()).find((x) => x.table === 'property_safety_items')
  const keys = (sw?.body ?? []).map((r) => r.item_key).sort().join()
  ok('безопасност: записва всички отбелязани документи наведнъж (upsert)', sw?.method === 'POST' && keys === 'fire,first_aid,insurance,pest', JSON.stringify(sw?.body)?.slice(0, 300))
  ok('безопасност: дератизацията е записана като налична със срок', sw?.body.find((r) => r.item_key === 'pest')?.done === true && sw.body.find((r) => r.item_key === 'pest')?.expires_on === plusDays(200))
  ok('безопасност: „Данните са записани“', (await safety.getByText('Данните са записани.').count()) === 1)
  ok('безопасност: след отбелязване са 3 от 6 готови', /3 от 6 готови/.test(await text(safety)))
  await safety.getByRole('button', { name: 'Копирай текста за правилата' }).click()
  await page.waitForTimeout(300)
  const clip = await page.evaluate(() => navigator.clipboard.readText())
  ok('безопасност: копира международния текст за спешни случаи (112, 100, 166, 199, 1571)', ['112', '100', '166', '199', '1571'].every((n) => clip.includes(n)) && /Emergency/.test(clip), clip)

  const chan = page.locator('.card', { has: page.getByRole('heading', { name: 'Цени по канал', exact: true }) })
  ok('цени по канал: заредени са 12% и 15%', (await chan.getByLabel('Надбавка за Airbnb').inputValue()) === '12' && (await chan.getByLabel('Надбавка за Booking').inputValue()) === '15')
  const rowsTxt = await chan.locator('tbody tr').allInnerTexts()
  ok('цени по канал: 3 реда — Лято, Зима и „Останалите дати“', rowsTxt.length === 3 && /Лято/.test(rowsTxt[0]) && /Зима/.test(rowsTxt.join()) && /Останалите дати/.test(rowsTxt[2]), JSON.stringify(rowsTxt))
  const cells = async (i) => (await chan.locator('tbody tr').nth(i).locator('td').allInnerTexts()).map((c) => c.replace(/\s+/g, ' ').trim())
  const lato = (await cells(0)).slice(1)
  ok('цени по канал: Лято 120 € → Airbnb 134 €, Booking 138 €', lato.join('|') === '120 €|134 €|138 €', lato.join('|'))
  const rest = (await cells(2)).slice(1)
  ok('цени по канал: основна цена 72 € → 81 € и 83 €', rest.join('|') === '72 €|81 €|83 €', rest.join('|'))
  await chan.scrollIntoViewIfNeeded()
  await chan.screenshot({ path: path.join(OUT, 'channel-prices-card.png') })
  await chan.getByRole('button', { name: /Предложи от комисионата/ }).click()
  ok('цени по канал: предложената надбавка от 15% комисиона е 17,6%', (await chan.getByLabel('Надбавка за Airbnb').inputValue()) === '17.6' && (await chan.getByLabel('Надбавка за Booking').inputValue()) === '17.6')
  ok('цени по канал: таблицата се обновява веднага (Лято → 141 €)', (await cells(0)).slice(1).join('|') === '120 €|141 €|141 €', (await cells(0)).join('|'))
  await writes(true)
  await chan.getByRole('button', { name: 'Запази', exact: true }).click()
  await page.waitForTimeout(500)
  const cw = (await writes()).find((x) => x.table === 'property_settings')
  ok('цени по канал: записва надбавките и нищо друго от настройките', cw?.body.property_id === G1 && cw.body.airbnb_markup_pct === 17.6 && cw.body.booking_markup_pct === 17.6 && Object.keys(cw.body).sort().join() === 'airbnb_markup_pct,booking_markup_pct,property_id', JSON.stringify(cw?.body))
  await chan.getByLabel('Надбавка за Airbnb').fill('150')
  await writes(true)
  await chan.getByRole('button', { name: 'Запази', exact: true }).click()
  await page.waitForTimeout(300)
  ok('цени по канал: надбавка над 100 → съобщение и нищо не се записва', (await chan.getByText('Надбавката трябва да е число между 0 и 100.').count()) === 1 && (await writes()).filter((x) => x.table === 'property_settings').length === 0)

  const embed = page.locator('.card', { has: page.getByRole('heading', { name: 'Вградете в сайта си', exact: true }) })
  const code = await embed.getByLabel('Код за вграждане').inputValue()
  ok('вграждане: кодът е рамка към /embed/vila-elia с широчина 100% и ресайз скрипт', code.includes(`<iframe src="${base}/embed/vila-elia"`) && /width="100%"/.test(code) && /stayflow-height/.test(code) && /<script>/.test(code), code)
  ok('вграждане: връзката „Отвори“ води към същия адрес', (await embed.getByRole('link', { name: 'Отвори и виж как изглежда' }).getAttribute('href')) === `${base}/embed/vila-elia`)
  await embed.scrollIntoViewIfNeeded()
  await embed.screenshot({ path: path.join(OUT, 'embed-card.png') })
  await embed.getByRole('button', { name: 'Копирай кода' }).click()
  await page.waitForTimeout(300)
  ok('вграждане: „Копирай кода“ слага кода в клипборда', (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n') === code.replace(/\r\n/g, '\n'))
  await page.goto(`${base}/properties/${G2}`)
  await settle(page)
  ok('вграждане: непубликуван имот няма карта за вграждане', (await page.getByRole('heading', { name: 'Вградете в сайта си' }).count()) === 0)
  ok('безопасност: за Студио „Мора“ (Гърция, без документи) картата е тук с 0 от 6 готови', /0 от 6 готови/.test(await text(page.locator('.card', { has: page.getByRole('heading', { name: 'Безопасност', exact: true }) }))))

  /* ============ Вградена страница ============ */
  await page.goto(`${base}/embed/vila-elia`)
  await settle(page)
  ok('вграден вид: клас stay--embed', (await page.locator('.stay.stay--embed').count()) === 1)
  ok('вграден вид: има заглавие и номер на имота, но няма снимки, описание и долен колонтитул', (await page.locator('h1').isVisible()) === true && (await text(page.locator('h1'))) === 'Вила „Елия“' && (await text(page.locator('.stay-reg'))) === 'AMA 00000123456' && (await page.locator('.stay-gallery-wrap').isVisible()) === false && (await page.locator('.stay-foot').isVisible()) === false && (await page.locator('.stay-main > .stay-sec:not(.stay-sec--keep)').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).length)) === 0)
  ok('вграден вид: календарът за наличност и картата за цена са видими', (await page.locator('.stay-sec--keep').isVisible()) && (await page.locator('#quote-section').isVisible()))
  ok('вграден вид: картата за цена има бутон за проверка', (await page.locator('#quote-section button').count()) >= 1)
  const embedH = await page.evaluate(() => document.documentElement.scrollHeight)
  ok('вграден вид: кратка страница (под 1400 px) — не цялата обява', embedH > 300 && embedH < 1400, String(embedH))
  const axeEmbed = await axe(page)
  ok('вграден вид: axe без нарушения', axeEmbed.length === 0, axeEmbed.join(', '))
  // в рамка: страницата праща височината си към родителя
  await page.setContent(`<iframe id="f" src="${base}/embed/vila-elia" width="900" height="300" style="border:0"></iframe><script>window.heights=[];addEventListener('message',e=>{if(e.data&&e.data.type==='stayflow-height')window.heights.push(e.data.height)})</script>`)
  await page.waitForFunction(() => window.heights.length > 0, null, { timeout: 15000 })
  const hs = await page.evaluate(() => window.heights)
  ok('вграден вид: в рамка праща „stayflow-height“ с височина към родителя', hs.length >= 1 && hs.every((h) => Number.isFinite(h) && h > 300), JSON.stringify(hs))
  await page.goto(`${base}/embed/vila-elia?lang=el`)
  await settle(page)
  ok('вграден вид: ?lang=el сменя езика на рамката', (await page.locator('html').getAttribute('lang')) === 'el')
  await page.goto(`${base}/embed/vila-elia`)
  await settle(page)
  await page.screenshot({ path: path.join(OUT, 'embed-page.png') })
  await page.goto(`${base}/embed/neznaen-adres`)
  await settle(page)
  ok('вграден вид: непознат адрес → „не е намерено“, без срив', (await page.getByText('404').count()) >= 1)

  /* ============ Такса „Климатична устойчивост“ ============ */
  await page.goto(`${base}/bookings?new=1`)
  await settle(page)
  const form = page.locator('form', { has: page.getByLabel('Име на госта') })
  const feeLabel = 'Такса „Климатична устойчивост“ (€)'
  const setDates = async (a, b) => {
    await form.getByLabel('Настаняване').fill(a)
    await form.getByLabel('Напускане').fill(b)
    await page.waitForTimeout(300)
  }
  await form.getByLabel('Имот').selectOption({ label: 'Студио „Морски бриз“' })
  await page.waitForTimeout(500)
  ok('такса: имот извън Гърция — етикетът остава „Туристически данък (€)“', (await form.getByLabel('Туристически данък (€)').count()) === 1 && (await form.getByLabel(feeLabel).count()) === 0)
  await form.getByLabel('Имот').selectOption({ label: 'Вила „Елия“' })
  await page.waitForTimeout(700)
  await setDates('2027-07-10', '2027-07-12')
  ok('такса: Вила „Елия“ (къща над 80 м²), 2 нощи през юли = 2 × 15 = 30', (await form.getByLabel(feeLabel).inputValue()) === '30', await form.getByLabel(feeLabel).inputValue())
  await form.locator('fieldset', { hasText: 'Данни за декларацията' }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: path.join(OUT, 'booking-form-fee.png') })
  ok('такса: подсказката обяснява сметката и че е на жилище, не на човек', /2×15 € сезон \+ 0×4 € извън сезон, на жилище, не на човек/.test(await text(form.locator('label.field', { hasText: 'Климатична устойчивост' }))))
  await setDates('2027-01-10', '2027-01-12')
  ok('такса: 2 нощи през януари = 2 × 4 = 8', (await form.getByLabel(feeLabel).inputValue()) === '8')
  await setDates('2027-10-30', '2027-11-02')
  ok('такса: 30.10 → 02.11 = 2 × 15 (30.10, 31.10) + 1 × 4 (01.11) = 34', (await form.getByLabel(feeLabel).inputValue()) === '34', await form.getByLabel(feeLabel).inputValue())
  await form.getByLabel('Брой гости').fill('4')
  await page.waitForTimeout(200)
  ok('такса: броят гости не променя таксата (на жилище, не на човек)', (await form.getByLabel(feeLabel).inputValue()) === '34')
  await form.getByLabel('Имот').selectOption({ label: 'Студио „Мора“' })
  await page.waitForTimeout(700)
  await setDates('2027-07-10', '2027-07-12')
  ok('такса: Студио „Мора“ (апартамент), 2 нощи през юли = 2 × 8 = 16', (await form.getByLabel(feeLabel).inputValue()) === '16', await form.getByLabel(feeLabel).inputValue())
  await form.getByLabel(feeLabel).fill('50')
  await setDates('2027-07-10', '2027-07-14')
  ok('такса: ръчно написана сума не се презаписва от автоматичното предложение', (await form.getByLabel(feeLabel).inputValue()) === '50')
  ok('десктоп: без грешки в конзолата', errors.length === 0, errors.join(' | '))

  /* ============ Телефон ============ */
  const ph = await open(PHONE)
  for (const [route, name] of [[`/messages?kind=before_arrival&booking=${BK(67)}`, 'съобщения'], [`/properties/${G1}`, 'имот'], ['/embed/vila-elia', 'вграден вид'], ['/', 'табло']]) {
    await ph.page.goto(`${base}${route}`)
    await settle(ph.page)
    const over = await ph.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    ok(`телефон: ${name} без хоризонтално препълване`, over <= 0, String(over))
  }
  await ph.page.goto(`${base}/messages?kind=before_arrival&booking=${BK(67)}`)
  await settle(ph.page)
  const axeMsg = await axe(ph.page)
  ok('axe на /messages (телефон): без нарушения', axeMsg.length === 0, axeMsg.join(', '))
  await ph.page.screenshot({ path: path.join(OUT, 'messages-phone.png') })
  await ph.page.goto(`${base}/embed/vila-elia`)
  await settle(ph.page)
  await ph.page.screenshot({ path: path.join(OUT, 'embed-phone.png') })
  ok('телефон: без грешки в конзолата', ph.errors.length === 0, ph.errors.join(' | '))
  await ph.page.goto(`${base}/`)
  await settle(ph.page)
  await ph.page.getByRole('button', { name: 'Още' }).click()
  await ph.page.waitForTimeout(500)
  ok('телефон: листът „Още“ има „Съобщения“ и „Декларации“', (await ph.page.getByRole('dialog').getByText('Съобщения', { exact: true }).count()) >= 1 && (await ph.page.getByRole('dialog').getByText('Декларации', { exact: true }).count()) >= 1)

  /* ============ Миграция 018 не е пусната: нищо не се чупи ============ */
  await mock('greece?on=1&m018=1')
  const m = await open(DESK)
  await m.page.goto(`${base}/properties/${G1}`)
  await settle(m.page)
  ok('без 018: картата „Регистрация в Гърция“ (017) си е на място', (await m.page.getByRole('heading', { name: 'Регистрация в Гърция' }).count()) === 1)
  ok('без 018: няма карти „Безопасност“ и „Цени по канал“', (await m.page.getByRole('heading', { name: 'Безопасност', exact: true }).count()) === 0 && (await m.page.getByRole('heading', { name: 'Цени по канал', exact: true }).count()) === 0)
  ok('без 018: вграждането (без миграция) си е тук', (await m.page.getByRole('heading', { name: 'Вградете в сайта си' }).count()) === 1)
  await m.page.goto(`${base}/`)
  await settle(m.page)
  const att2 = await text(m.page.locator('#attention-title').locator('xpath=ancestor::section'))
  ok('без 018: таблото работи, безопасност не се показва, останалото си е там', !/безопасност/.test(att2) && /пристигат утре/.test(att2), att2.slice(0, 300))
  await m.page.goto(`${base}/bookings?new=1`)
  await settle(m.page)
  ok('без 018: таксата за Гърция работи (не зависи от миграцията)', true)
  ok('без 018: без грешки в конзолата', m.errors.length === 0, m.errors.join(' | '))
  await mock('greece?on=1')

  /* ============ Гръцки ============ */
  const el = await open(DESK, { lang: 'el' })
  await el.page.goto(`${base}/properties/${G1}`)
  await settle(el.page)
  const elSafety = await text(el.page.locator('.card', { has: el.page.getByRole('heading', { name: 'Ασφάλεια', exact: true }) }))
  ok('гръцки: „Ασφάλεια“ — 2 от 6, състоянията и документите са преведени', /2 από 6 έτοιμα/.test(elSafety) && /Λήγει σύντομα/.test(elSafety) && /Πυροσβεστήρας \(έλεγχος\)/.test(elSafety) && /Φαρμακείο πρώτων βοηθειών/.test(elSafety), elSafety.slice(0, 300))
  const elChan = await text(el.page.locator('.card', { has: el.page.getByRole('heading', { name: 'Τιμές ανά κανάλι', exact: true }) }))
  ok('гръцки: „Τιμές ανά κανάλι“ е преведена (надбавка, период, директно)', /Προσαύξηση για Airbnb/.test(elChan) && /Απευθείας/.test(elChan) && /Υπόλοιπες ημερομηνίες/.test(elChan), elChan.slice(0, 300))
  const elEmbed = await text(el.page.locator('.card', { has: el.page.getByRole('heading', { name: 'Ενσωματώστε στην ιστοσελίδα σας', exact: true }) }))
  ok('гръцки: картата за вграждане е преведена', /Αντιγραφή κώδικα/.test(elEmbed), elEmbed.slice(0, 200))
  await el.page.goto(`${base}/messages?kind=before_arrival&booking=${BK(67)}`)
  await settle(el.page)
  const bgLeft = await el.page.evaluate(() => {
    const main = document.querySelector('main').cloneNode(true)
    main.querySelectorAll('select, [data-testid=msg-preview], [role=group]').forEach((n) => n.remove())
    return (main.innerText.match(/[А-Яа-я]{2,}/g) ?? []).slice(0, 8)
  })
  ok('гръцки: на /messages не са останали български думи (освен резервации и самото съобщение)', bgLeft.length === 0, bgLeft.join(', '))
  await el.page.screenshot({ path: path.join(OUT, 'messages-greek.png') })
  ok('гръцки: заглавие „Μηνύματα“', (await el.page.getByRole('heading', { level: 1, name: 'Μηνύματα' }).count()) === 1)
  ok('гръцки: имената на езиците не са преведени (Български, Ελληνικά, English)', (await el.page.getByRole('button', { name: 'Български' }).count()) === 1)
  await el.page.goto(`${base}/`)
  await settle(el.page)
  const elAtt = await text(el.page.locator('#attention-title').locator('xpath=ancestor::section'))
  ok('гръцки: напомнянията на таблото са преведени', /2 επισκέπτες φτάνουν αύριο/.test(elAtt) && /έγγραφα ασφαλείας/.test(elAtt), elAtt.slice(0, 400))
  ok('гръцки: без грешки в конзолата', el.errors.length === 0, el.errors.join(' | '))
} finally {
  await mock('greece?on=0').catch(() => {})
  for (const b of browsers) await b.close().catch(() => {})
}

console.log(`greece2: ${pass} успешни, ${fail} провалени`)
process.exit(fail ? 1 : 0)
