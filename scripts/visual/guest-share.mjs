// Резервации: експорт CSV (всички / само намерените), „Прати на госта“ (Viber, WhatsApp, копиране) и PDF „Потвърждение“.
//   node scripts/visual/guest-share.mjs http://localhost:4175
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
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
await fetch(`${base}/__mock/access?state=active`)

const browser = await chromium.launch({ channel: 'chrome' })
for (const width of [1440, 390]) {
  const ctx = await browser.newContext({ viewport: { width, height: width > 700 ? 900 : 844 }, locale: 'bg-BG', timezoneId: 'Europe/Sofia', acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] })
  await ctx.addInitScript((s) => { try { localStorage.setItem('sb-localhost-auth-token', JSON.stringify(s)); localStorage.setItem('stayflow.autoSetupSeen', '1'); localStorage.setItem('stayflow.consent', JSON.stringify({ v: 1, choice: 'necessary', at: new Date().toISOString() })) } catch {} }, session)
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(base + '/bookings', { waitUntil: 'load' })
  await page.waitForTimeout(1400)
  const L = (s) => `${width}px: ${s}`

  /* CSV */
  const exportBtn = page.getByRole('button', { name: 'Експорт CSV' })
  ok(L('има бутон „Експорт CSV“'), (await exportBtn.count()) === 1 && (await exportBtn.isEnabled()))
  let [dl] = await Promise.all([page.waitForEvent('download'), exportBtn.click()])
  let csv = readFileSync(await dl.path(), 'utf8')
  const lines = csv.replace(/^﻿/, '').split('\r\n')
  ok(L('CSV: файл rezervacii-ГГГГ-ММ-ДД.csv, BOM за Excel, заглавия на български'), /^rezervacii-\d{4}-\d{2}-\d{2}\.csv$/.test(dl.suggestedFilename()) && csv.charCodeAt(0) === 0xfeff && lines[0].startsWith('Гост;Телефон;Имейл;Имот;Настаняване;Напускане;Нощувки'), lines[0])
  ok(L('CSV: 14 резервации (като в списъка) + заглавен ред'), lines.length === 15, String(lines.length))
  ok(L('CSV: има Мария Петрова с имот, дати, цена и източник'), lines.some((l) => /^Мария Петрова;\+359 88 100 1037;;Вила „Тихи бряг“;\d\d\.\d\d\.\d{4};\d\d\.\d\d\.\d{4};\d+;\d+;[^;]+;[^;]+;\d+\.\d\d;/.test(l)), lines.find((l) => l.startsWith('Мария')))

  await page.getByPlaceholder('Име, телефон или имейл').fill('петрова')
  await page.waitForTimeout(300)
  ;[dl] = await Promise.all([page.waitForEvent('download'), exportBtn.click()])
  csv = readFileSync(await dl.path(), 'utf8')
  ok(L('CSV с търсене: само намерените (1 ред + заглавия)'), csv.replace(/^﻿/, '').split('\r\n').length === 2)
  await page.getByPlaceholder('Име, телефон или имейл').fill('нямагост')
  await page.waitForTimeout(300)
  ok(L('CSV: бутонът е изключен, когато няма какво да се експортира'), await exportBtn.isDisabled())
  await page.getByPlaceholder('Име, телефон или имейл').fill('Мария Петрова')
  await page.waitForTimeout(300)

  /* Прати на госта */
  await page.locator('main').getByText('Мария Петрова', { exact: false }).locator('visible=true').first().click()
  await page.locator('h2', { hasText: 'Редакция на резервация' }).waitFor({ timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(700)
  const share = page.locator('section[aria-labelledby="guest-share"]')
  ok(L('в редакцията има „Прати на госта“'), (await share.count()) === 1)
  const msg = await share.locator('textarea').inputValue()
  ok(L('съобщение: поздрав, дати, нощувки и линк към картата на госта'), /^Здравейте, Мария!/.test(msg) && /\d\d\.\d\d\.\d{4} – \d\d\.\d\d\.\d{4} \(\d+ нощув/.test(msg) && /\/guest\/[0-9a-f-]{36}/.test(msg), msg)
  ok(L('съобщение: името на имота с кавички не се удвоява, и има остатъка 32.00 € (цена + данък − платено)'), !/„Вила „/.test(msg) && /Остава за плащане: 32\.00 €\./.test(msg), msg)
  ok(L('съобщение: подписано с фирмата и телефона от профила'), /— Морски имоти ЕООД, \+359 88 712 4093$/.test(msg), msg.slice(-60))
  ok(L('съобщение: няма „undefined“ или „null“'), !/undefined|null/.test(msg))
  const viber = await share.locator('a', { hasText: 'Viber' }).getAttribute('href')
  const wa = await share.locator('a', { hasText: 'WhatsApp' }).getAttribute('href')
  ok(L('Viber: viber://forward със съобщението'), viber.startsWith('viber://forward?text=') && decodeURIComponent(viber.split('text=')[1]) === msg)
  ok(L('WhatsApp: wa.me към номера на госта (359881001037) със съобщението'), wa.startsWith('https://wa.me/359881001037?text=') && decodeURIComponent(wa.split('text=')[1]) === msg, wa.slice(0, 60))
  ok(L('WhatsApp се отваря в нов раздел, безопасно'), (await share.locator('a', { hasText: 'WhatsApp' }).getAttribute('target')) === '_blank' && /noopener/.test((await share.locator('a', { hasText: 'WhatsApp' }).getAttribute('rel')) ?? ''))
  await share.getByRole('button', { name: /Копирай/ }).click()
  await page.waitForTimeout(300)
  ok(L('„Копирай“ слага съобщението в клипборда'), (await page.evaluate(() => navigator.clipboard.readText())) === msg)

  const pdfBtn = share.getByRole('button', { name: /Потвърждение \(PDF\)/ })
  ;[dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), pdfBtn.click()])
  const pdf = readFileSync(await dl.path())
  ok(L('PDF: файл „Потвърждение-Мария-Петрова-ГГГГ-ММ-ДД.pdf“'), /^Потвърждение-Мария-Петрова-\d{4}-\d{2}-\d{2}\.pdf$/.test(dl.suggestedFilename()), dl.suggestedFilename())
  ok(L('PDF: истински PDF файл с размер над 5 KB (шрифтът с кирилица е вграден)'), pdf.subarray(0, 5).toString() === '%PDF-' && pdf.length > 5000, String(pdf.length))
  /* Плащане с карта (Stripe) — отговорите на сървъра са подменени */
  const card = share.locator('[data-testid="card-pay"]')
  ok(L('има „Плащане с карта“ с два бутона (капаро и остатък)'), (await card.count()) === 1 && (await card.getByRole('button', { name: 'Линк за капаро' }).count()) === 1 && (await card.getByRole('button', { name: 'Линк за целия остатък' }).count()) === 1)
  ok(L('преди да се направи линк, в съобщението няма линк към Stripe'), !/stripe\.com/.test(await share.locator('textarea').inputValue()))
  await fetch(`${base}/__mock/stripe?mode=test&clear=1`)
  await card.getByRole('button', { name: 'Линк за капаро' }).click()
  await card.getByRole('status').waitFor({ timeout: 5000 }).catch(() => {})
  let msg2 = await share.locator('textarea').inputValue()
  ok(L('линк за капаро: влиза в съобщението със сумата и срока'), msg2.includes('Капаро 9.60 € с карта (линкът важи 23 часа): https://checkout.stripe.com/c/pay/cs_test_deposit'), msg2)
  ok(L('линк за капаро: останалото съобщение е същото (дати, остатък, картата на госта)'), msg2.startsWith(msg.slice(0, 40)) && /Остава за плащане: 32\.00 €\./.test(msg2) && /\/guest\/[0-9a-f-]{36}/.test(msg2))
  ok(L('тестов режим: предупреждение да не се праща на гост'), /Тестов режим/.test(await card.innerText()))
  const reqs = await (await fetch(`${base}/__mock/stripe-requests`)).json()
  ok(L('към сървъра отива само резервацията и видът (не сума), с вход на собственика'), reqs.length === 1 && reqs[0].auth === `Bearer ${session.access_token}` && /^[0-9a-f-]{36}$/.test(reqs[0].body.booking_id) && reqs[0].body.kind === 'deposit' && Object.keys(reqs[0].body).sort().join() === 'booking_id,kind', JSON.stringify(reqs[0]))
  ok(L('Viber и WhatsApp носят съобщението с линка за плащане'), decodeURIComponent((await share.locator('a', { hasText: 'Viber' }).getAttribute('href')).split('text=')[1]) === msg2)
  await fetch(`${base}/__mock/stripe?mode=live`)
  await card.getByRole('button', { name: 'Линк за целия остатък' }).click()
  await page.waitForTimeout(600)
  msg2 = await share.locator('textarea').inputValue()
  ok(L('линк за остатък (на живо): сумата 32.00 € и новият линк заменя стария'), msg2.includes('Плащане 32.00 € с карта (линкът важи 23 часа): https://checkout.stripe.com/c/pay/cs_live_balance') && !/cs_test_deposit/.test(msg2) && (msg2.match(/stripe\.com/g) || []).length === 1, msg2)
  ok(L('на живо: няма предупреждение за тестов режим'), !/Тестов режим/.test(await card.innerText()))
  await fetch(`${base}/__mock/stripe?mode=off`)
  await card.getByRole('button', { name: 'Линк за капаро' }).click()
  await page.waitForTimeout(500)
  ok(L('Stripe не е свързан: ясно съобщение, без да се чупи екранът'), /още не е свързано/.test(await card.innerText()))
  await fetch(`${base}/__mock/stripe?mode=nothing`)
  await card.getByRole('button', { name: 'Линк за капаро' }).click()
  await page.waitForTimeout(500)
  ok(L('няма дължима сума: съобщението на сървъра се показва'), /Няма дължима сума/.test(await card.innerText()))
  await fetch(`${base}/__mock/stripe?mode=error`)
  await card.getByRole('button', { name: 'Линк за целия остатък' }).click()
  await page.waitForTimeout(500)
  ok(L('Stripe отказва: показва се кратка причина'), /Stripe отказа/.test(await card.innerText()))
  await fetch(`${base}/__mock/stripe?mode=test`)
  const propId = (msg.match(/\/guest\/([0-9a-f-]{36})/) || [])[1]
  await page.goto(`${base}/guest/${propId}?paid=1`, { waitUntil: 'load' })
  await page.waitForTimeout(900)
  ok(L('картата на госта след плащане: благодарност (без твърдение, че парите са получени)'), (await page.getByRole('status').filter({ hasText: 'Благодарим за плащането' }).count()) === 1 && !/получени/.test(await page.locator('body').innerText()))
  await page.goto(`${base}/guest/${propId}`, { waitUntil: 'load' })
  await page.waitForTimeout(700)
  ok(L('картата на госта без ?paid=1: няма благодарност'), (await page.getByText('Благодарим за плащането').count()) === 0)
  await page.goto(base + '/bookings', { waitUntil: 'load' })
  await page.waitForTimeout(900)
  await page.getByPlaceholder('Име, телефон или имейл').fill('Мария Петрова')
  await page.waitForTimeout(300)
  await page.locator('main').getByText('Мария Петрова', { exact: false }).locator('visible=true').first().click()
  await page.locator('h2', { hasText: 'Редакция на резервация' }).waitFor({ timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(500)
  ok(L('след „Плащане с карта“ няма хоризонтално препълване'), (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0)
  // резервация от Airbnb: гостът плаща на платформата — бутоните за карта не се показват
  await page.goto(base + '/bookings', { waitUntil: 'load' })
  await page.waitForTimeout(900)
  await page.getByPlaceholder('Име, телефон или имейл').fill('Anna Schmidt')
  await page.waitForTimeout(300)
  await page.locator('main').getByText('Anna Schmidt', { exact: false }).locator('visible=true').first().click()
  await page.locator('h2', { hasText: 'Редакция на резервация' }).waitFor({ timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(600)
  ok(L('резервация от Airbnb: има „Прати на госта“, но няма „Плащане с карта“'), (await page.locator('section[aria-labelledby="guest-share"]').count()) === 1 && (await page.locator('[data-testid="card-pay"]').count()) === 0)
  ok(L('„Прати на госта“: няма хоризонтално препълване'), (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0)
  ok(L('„Прати на госта“: няма JS грешки'), errors.length === 0, errors.join(' | '))
  await ctx.close()
}
await browser.close()
console.log(`\nguest-share: ${pass} успешни, ${fail} провалени`)
process.exit(fail ? 1 : 0)
