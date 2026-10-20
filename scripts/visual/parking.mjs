// Видове паркинг в редакторите: карта „Детайли на обявата“ (/properties/:id) и помощника (/properties/:id/setup).
// Записът е към имитацията на базата — проверяваме какво би се изпратило. Без нищо реално.
//   node scripts/visual/parking.mjs http://localhost:4174
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { USER } from './seed.mjs'

const require = createRequire(import.meta.url)
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
const base = process.argv[2] || 'http://localhost:4174'
const P1 = '21111111-0000-4000-8000-000000000001' // „Тихи бряг“: wifi, parking (общ), parking_free, ev_charger, ac, kitchen, balcony
const COARSE = ['--blink-settings=primaryPointerType=2,availablePointerTypes=2,primaryHoverType=1,availableHoverTypes=1']
let pass = 0
let fail = 0
const ok = (name, cond, extra = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`)
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER.id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 86400 })}.sig`
const session = { access_token: jwt, token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: USER }

const browser = await chromium.launch({ channel: 'chrome', args: COARSE })

async function open(route, width, height, beforeReady) {
  const phone = width < 900
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, locale: 'bg-BG', timezoneId: 'Europe/Sofia', deviceScaleFactor: phone ? 2 : 1 })
  await ctx.addInitScript((s) => {
    try { localStorage.setItem('sb-localhost-auth-token', JSON.stringify(s)); localStorage.setItem('stayflow.autoSetupSeen', '1') } catch {}
  }, session)
  const page = await ctx.newPage()
  const errors = []
  const patches = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('request', (r) => { if (r.method() === 'PATCH' && r.url().includes('/rest/v1/properties')) patches.push(JSON.parse(r.postData() || '{}')) })
  await page.goto(base + route, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  if (beforeReady) await beforeReady(page)
  await page.waitForSelector('fieldset legend', { timeout: 10000 })
  await page.waitForTimeout(700)
  return { ctx, page, errors, patches }
}

const inspect = (page) =>
  page.evaluate(() => {
    const fs = [...document.querySelectorAll('fieldset')].find((f) => f.querySelector('legend')?.textContent.trim() === 'Паркинг')
    if (!fs) return null
    const boxes = [...fs.querySelectorAll('label')].map((l) => ({ t: l.textContent.trim(), on: l.querySelector('input').checked }))
    const generalHasParking = [...document.querySelectorAll('label')].some((l) => !fs.contains(l) && /паркинг|гараж|зарядна/i.test(l.textContent))
    return { boxes, generalHasParking, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth }
  })

for (const [w, h] of [[375, 812], [1440, 900]]) {
  // ---------------------------------------------------------- карта на имота
  {
    const { ctx, page, errors, patches } = await open(`/properties/${P1}`, w, h)
    const m = await inspect(page)
    ok(`${w}: картата има група „Паркинг“ с видовете`, !!m && ['Безплатен паркинг на място', 'Платен паркинг', 'Паркинг на улицата', 'Гараж', 'Зарядна станция за електромобили'].every((t) => m.boxes.some((x) => x.t.startsWith(t))), JSON.stringify(m?.boxes.map((x) => x.t)))
    ok(`${w}: паркинг няма и сред общите удобства`, m && !m.generalHasParking)
    ok(`${w}: записаните видове са отметнати (безплатен, зарядна), другите — не`, m && m.boxes.find((x) => x.t.startsWith('Безплатен')).on && m.boxes.find((x) => x.t.startsWith('Зарядна')).on && !m.boxes.find((x) => x.t === 'Гараж').on)
    ok(`${w}: старият общ „Паркинг“ се вижда с бележка „уточнете вида“, понеже е отметнат`, m && m.boxes.some((x) => /^Паркинг\s*уточнете вида/.test(x.t) && x.on), JSON.stringify(m?.boxes.map((x) => x.t)))
    ok(`${w}: без хоризонтално препълване`, m && !m.overflow)

    const fs = page.locator('fieldset', { has: page.locator('legend', { hasText: 'Паркинг' }) })
    // истински клик по средата на елемента (след превъртане), както от пръст/мишка
    const tap = async (locator) => {
      await locator.scrollIntoViewIfNeeded()
      const r = await locator.boundingBox()
      await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2)
      await page.waitForTimeout(200)
    }
    await tap(fs.getByLabel(/^Паркинг\s*уточнете вида/))
    ok(`${w}: след махане на стария запис той изчезва от групата`, (await inspect(page)).boxes.length === 5)
    await tap(fs.getByLabel('Гараж'))
    ok(`${w}: „Гараж“ се отмята`, (await inspect(page)).boxes.find((x) => x.t === 'Гараж').on)
    await tap(page.locator('form', { has: fs }).getByRole('button', { name: /Запази/ }))
    await page.waitForTimeout(600)
    const sent = patches.at(-1)?.amenities
    ok(`${w}: записът изпраща видовете и без стария „parking“`, Array.isArray(sent) && sent.includes('garage') && sent.includes('parking_free') && sent.includes('ev_charger') && !sent.includes('parking') && sent.includes('wifi'), JSON.stringify(sent))
    ok(`${w}: без грешки в конзолата`, errors.length === 0, errors.join(' | '))
    await page.evaluate(axeSource)
    const res = await page.evaluate(() => axe.run(document.querySelector('form:has(fieldset)'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } }))
    const n = res.violations.reduce((s, v) => s + v.nodes.length, 0)
    ok(`${w}: картата с детайли на обявата — axe 0 нарушения`, n === 0, res.violations.map((v) => `${v.id}(${v.nodes.length}) ${v.nodes[0].target.join(' ').slice(0, 70)}`).join(' | '))
    await page.locator('fieldset', { has: page.locator('legend', { hasText: 'Паркинг' }) }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: `scripts/visual/out/parking-card-${w}.png` })
    await ctx.close()
  }

  // ---------------------------------------------------------- помощник за обявата
  {
    const { ctx, page, errors } = await open(`/properties/${P1}/setup`, w, h, async (p) => {
      const next = p.getByRole('button', { name: 'Продължи към прегледа' })
      await next.waitFor({ timeout: 10000 })
      await next.scrollIntoViewIfNeeded()
      const r = await next.boundingBox()
      await p.mouse.click(r.x + r.width / 2, r.y + r.height / 2)
    })
    const m = await inspect(page)
    ok(`${w}: помощникът има същата група „Паркинг“`, !!m && m.boxes.length === 6 && !m.generalHasParking, JSON.stringify(m?.boxes.map((x) => x.t)))
    ok(`${w}: помощникът — без хоризонтално препълване`, m && !m.overflow)
    ok(`${w}: помощникът — без грешки в конзолата`, errors.length === 0, errors.join(' | '))
    await page.locator('fieldset', { has: page.locator('legend', { hasText: 'Паркинг' }) }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: `scripts/visual/out/parking-setup-${w}.png` })
    await ctx.close()
  }
}

await browser.close()
console.log(`\n${pass} успешни, ${fail} провалени\n`)
process.exit(fail ? 1 : 0)
