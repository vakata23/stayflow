// Календар и форма за резервация (стъпка 3) в реален браузър.
//   node scripts/visual/calendar.mjs http://localhost:4174
import { chromium } from 'playwright'
import { USER } from './seed.mjs'

const base = process.argv[2] || 'http://localhost:4174'
const COARSE = ['--blink-settings=primaryPointerType=2,availablePointerTypes=2,primaryHoverType=1,availableHoverTypes=1']
const jwt = () => {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b({ alg: 'HS256', typ: 'JWT' })}.${b({ sub: USER.id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 86400 })}.sig`
}
const session = { access_token: jwt(), token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: USER }
let pass = 0
let fail = 0
const ok = (name, cond, extra = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`)
}
const browser = await chromium.launch({ channel: 'chrome', args: COARSE })

async function open(width, height, route) {
  const phone = width < 900
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, locale: 'bg-BG', timezoneId: 'Europe/Sofia' })
  await ctx.addInitScript((s) => {
    try { localStorage.setItem('sb-localhost-auth-token', JSON.stringify(s)); localStorage.setItem('stayflow.autoSetupSeen', '1') } catch {}
  }, session)
  const page = await ctx.newPage()
  const requests = []
  page.on('request', (r) => { if (['POST', 'PATCH', 'DELETE'].includes(r.method())) requests.push(`${r.method()} ${new URL(r.url()).pathname}`) })
  await page.goto(base + route, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForSelector('main h2', { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(700)
  return { ctx, page, requests }
}

/* ============================================================ телефон */
{
  const { ctx, page } = await open(375, 812, '/calendar')
  const cells = await page.evaluate(() => [...document.querySelectorAll('main .card button[aria-label*="резервации"], main .card button[aria-label*="свободен ден"]')].map((b) => { const r = b.getBoundingClientRect(); return { w: r.width, h: r.height, label: b.getAttribute('aria-label') } }))
  ok('телефон: 42 дни са бутони с име (дата + брой резервации / свободен ден)', cells.length === 42 && cells.every((c) => /\d/.test(c.label)), `${cells.length} клетки; пример: ${cells[10]?.label}`)
  ok('телефон: всяка клетка е ≥ 44 × 44 px', cells.every((c) => c.w >= 43.9 && c.h >= 43.9), `най-малка ${Math.round(Math.min(...cells.map((c) => c.w)))}×${Math.round(Math.min(...cells.map((c) => c.h)))}`)

  await page.getByRole('button', { name: /^Петък, 9 октомври/ }).click()
  await page.waitForSelector('[role="dialog"]')
  await page.waitForTimeout(450)
  const sheet = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]')
    const rows = [...d.querySelectorAll('ul button')].map((b) => ({ h: b.getBoundingClientRect().height, t: b.textContent.replace(/\s+/g, ' ').trim().slice(0, 50) }))
    const r = d.getBoundingClientRect()
    const add = [...d.querySelectorAll('button')].find((b) => b.textContent.includes('Нова резервация'))
    return { title: document.getElementById(d.getAttribute('aria-labelledby'))?.textContent, rows, bottom: Math.round(r.bottom), vh: innerHeight, addH: add?.getBoundingClientRect().height }
  })
  ok('телефон: докосване на ден отваря лист със заглавие „Петък, 9 октомври“, резервациите му и „Нова резервация“', sheet.title === 'Петък, 9 октомври' && sheet.rows.length >= 2 && sheet.addH >= 43.9 && sheet.bottom === sheet.vh, JSON.stringify({ rows: sheet.rows.length, bottom: sheet.bottom, vh: sheet.vh }))
  ok('телефон: редовете на резервациите в листа са ≥ 44 px', sheet.rows.every((r) => r.h >= 43.9), sheet.rows.map((r) => Math.round(r.h)).join(' '))

  await page.locator('[role="dialog"] ul button').first().click()
  await page.waitForSelector('[role="dialog"] h2:has-text("Редакция на резервация")', { timeout: 5000 })
  await page.waitForTimeout(400)
  const dialogs = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"]')].map((d) => document.getElementById(d.getAttribute('aria-labelledby'))?.textContent))
  ok('телефон: избор на резервация от листа я отваря за редакция (листът се затваря)', dialogs.length === 1 && dialogs[0] === 'Редакция на резервация', JSON.stringify(dialogs))
  await ctx.close()
}

/* ============================================================ голям екран: клетки и ленти */
{
  const { ctx, page, requests } = await open(1440, 900, '/calendar')
  const free = page.getByRole('button', { name: /^Нова резервация на/ })
  const nFree = await free.count()
  ok('голям екран: свободните дни са бутони (достъпни с клавиатура)', nFree > 5, `${nFree} свободни дни`)
  await free.nth(3).focus()
  await page.keyboard.press('Enter')
  await page.waitForSelector('[role="dialog"]')
  await page.waitForTimeout(400)
  const prefill = await page.evaluate(() => ({ checkIn: document.querySelector('input[type="date"]')?.value, title: document.querySelector('[role="dialog"] h2')?.textContent }))
  ok('голям екран: Enter върху свободен ден отваря „Нова резервация“ с попълнена дата на настаняване', /^\d{4}-\d{2}-\d{2}$/.test(prefill.checkIn) && prefill.title === 'Нова резервация', JSON.stringify(prefill))

  // форма: секции, залепени действия, калкулатор на нощувките
  const secs = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] h3')].map((h) => h.textContent))
  ok('формата е на стъпки: Престой, Гост, Цена и източник, Бележки', ['Престой', 'Гост', 'Цена и източник', 'Бележки'].every((t) => secs.includes(t)), secs.join(' · '))
  await page.locator('input[type="date"]').nth(1).fill('2026-12-10')
  await page.locator('input[type="date"]').nth(0).fill('2026-12-07')
  await page.getByLabel('Обща цена (€)').fill('300')
  await page.waitForTimeout(200)
  const chip = await page.evaluate(() => document.querySelector('[role="dialog"] [aria-live="polite"]')?.textContent.replace(/\s+/g, ' ').trim())
  ok('формата показва „3 нощувки · 300.00 € общо · 100.00 € на нощувка“', /3 нощувки/.test(chip) && /300\.00 € общо/.test(chip) && /100\.00 € на нощувка/.test(chip), chip)
  const foot = await page.evaluate(() => { const f = document.querySelector('.modal-foot').getBoundingClientRect(); const p = document.querySelector('.modal-panel'); return { inView: f.bottom <= innerHeight + 1 && f.top >= 0, scrollable: p.scrollHeight > p.clientHeight } })
  ok('действията „Отказ / Създай“ са винаги във видимата част на прозореца', foot.inView, JSON.stringify(foot))

  // проверка: празно име → грешка, без заявка
  await page.getByRole('button', { name: 'Създай резервация' }).click()
  await page.waitForTimeout(300)
  const err = await page.evaluate(() => document.querySelector('[role="dialog"] .alert')?.textContent ?? document.querySelector('[role="dialog"] [role="alert"]')?.textContent ?? null)
  ok('празно име на госта → ясна грешка и няма заявка към базата', /Името на госта/.test(err ?? '') && !requests.some((r) => r.startsWith('POST /rest/v1/bookings')), `${err} | ${requests.join(',')}`)

  await page.keyboard.press('Escape')
  await page.waitForTimeout(450)
  ok('Esc затваря формата', (await page.locator('[role="dialog"]').count()) === 0)

  // ленти: ленти на съседни дни се слепват (без процеп)
  const gaps = await page.evaluate(() => {
    const bars = [...document.querySelectorAll('main .card button[title]')].map((b) => ({ r: b.getBoundingClientRect(), t: b.getAttribute('title') }))
    const byTitle = {}
    for (const b of bars) (byTitle[b.t] ??= []).push(b.r)
    let seams = 0
    let pairs = 0
    for (const rects of Object.values(byTitle)) {
      rects.sort((a, b) => a.top - b.top || a.left - b.left)
      for (let i = 1; i < rects.length; i++) {
        if (Math.abs(rects[i].top - rects[i - 1].top) < 2) {
          pairs++
          if (Math.abs(rects[i].left - rects[i - 1].right) > 1.5) seams++
        }
      }
    }
    return { pairs, seams }
  })
  ok('ленти на една и съща резервация в съседни дни се слепват без процеп', gaps.pairs > 5 && gaps.seams === 0, JSON.stringify(gaps))
  await ctx.close()
}

/* ============================================================ редакция: изтриване с потвърждение, плащания */
{
  const { ctx, page, requests } = await open(1440, 900, '/bookings')
  await page.locator('tbody tr').first().click()
  await page.waitForSelector('[role="dialog"] h2:has-text("Редакция на резервация")')
  await page.waitForTimeout(800)
  await page.getByRole('button', { name: 'Изтрий резервацията' }).click()
  await page.waitForTimeout(200)
  const asked = await page.evaluate(() => document.querySelector('[role="group"][aria-label="Потвърждение за изтриване"]')?.textContent ?? null)
  ok('„Изтрий“ иска потвърждение и не праща заявка', /Да изтрием ли резервацията/.test(asked ?? '') && !requests.some((r) => r.startsWith('DELETE')), `${asked?.slice(0, 40)} | ${requests.join(',') || 'няма заявки'}`)
  await page.getByRole('button', { name: 'Не, запази я' }).click()
  await page.waitForTimeout(150)
  ok('„Не, запази я“ връща формата без изтриване', (await page.getByRole('button', { name: 'Изтрий резервацията' }).count()) === 1 && !requests.some((r) => r.startsWith('DELETE')))

  // плащане с Enter — добавя плащане, не подава формата
  await page.getByLabel('Сума (€)').fill('25')
  await page.getByLabel('Сума (€)').press('Enter')
  await page.waitForTimeout(500)
  ok('Enter в „Сума“ добавя плащане и не затваря/подава резервацията', requests.some((r) => r === 'POST /rest/v1/payments') && !requests.some((r) => r.startsWith('PATCH /rest/v1/bookings')) && (await page.locator('[role="dialog"]').count()) === 1, requests.join(','))

  await page.getByRole('button', { name: 'Изтрий резервацията' }).click()
  await page.getByRole('button', { name: 'Да, изтрий' }).click()
  await page.waitForTimeout(600)
  ok('„Да, изтрий“ праща заявката за изтриване и затваря формата', requests.some((r) => r === 'DELETE /rest/v1/bookings') && (await page.locator('[role="dialog"]').count()) === 0, requests.join(','))
  await ctx.close()
}

await browser.close()
console.log(`\n${pass} успешни, ${fail} провалени\n`)
process.exit(fail ? 1 : 0)
