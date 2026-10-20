// Публична страница /stay/<slug> (светла обява): оформление, снимки, залепена карта, лента на телефон,
// лайтбокс, проверка на цена и заявка, празни секции, достъпност.
//   node scripts/visual/stay.mjs http://localhost:4174
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
const base = process.argv[2] || 'http://localhost:4174'
const COARSE = ['--blink-settings=primaryPointerType=2,availablePointerTypes=2,primaryHoverType=1,availableHoverTypes=1']
let pass = 0
let fail = 0
const ok = (name, cond, extra = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`)
}
const browser = await chromium.launch({ channel: 'chrome', args: COARSE })

async function open(width, height, slug = 'tihi-bryag') {
  const phone = width < 900
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, locale: 'bg-BG', timezoneId: 'Europe/Sofia', deviceScaleFactor: phone ? 2 : 1 })
  const page = await ctx.newPage()
  const posts = []
  page.on('request', (r) => { if (r.method() === 'POST' && r.url().includes('/api/booking-request')) posts.push(r.postData()) })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${base}/stay/${slug}`, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForSelector('h1', { timeout: 8000 })
  await page.waitForTimeout(900)
  return { ctx, page, posts, errors }
}
const plus = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)

/* ============================================================ голям екран */
{
  const { ctx, page, errors } = await open(1440, 900)
  const m = await page.evaluate(() => {
    const photos = [...document.querySelectorAll('.stay-photo')].filter((p) => getComputedStyle(p).display !== 'none')
    const r = photos.map((p) => p.getBoundingClientRect())
    const h1 = document.querySelector('h1')
    return {
      visiblePhotos: photos.length,
      bigW: Math.round(r[0].width), smallW: Math.round(r[1].width), bigH: Math.round(r[0].height), smallH: Math.round(r[1].height),
      all: [...document.querySelectorAll('.stay-gallery__all')].map((b) => ({ shown: getComputedStyle(b).display !== 'none', t: b.textContent.trim() })),
      h1: h1.textContent, h1Font: getComputedStyle(h1).fontFamily.slice(0, 18), bodyFont: getComputedStyle(document.querySelector('.stay')).fontFamily.slice(0, 12),
      h1s: document.querySelectorAll('h1').length, mains: document.querySelectorAll('main').length,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      bar: document.querySelector('.stay-bar') ? getComputedStyle(document.querySelector('.stay-bar')).display : null,
    }
  })
  ok('голям екран: мозайка — 5 видими снимки, голямата е по-широка от малките', m.visiblePhotos === 5 && m.bigW > m.smallW * 1.8 && m.bigH > m.smallH * 1.8, JSON.stringify({ v: m.visiblePhotos, big: m.bigW + '×' + m.bigH, small: m.smallW + '×' + m.smallH }))
  ok('голям екран: бутон „Всички снимки (8)“ е видим', m.all.some((b) => b.shown && /Всички снимки \(8\)/.test(b.t)), JSON.stringify(m.all))
  ok('един h1 (Literata), текст на Onest, един <main>, без хоризонтално препълване', m.h1s === 1 && m.mains === 1 && /Literata/.test(m.h1Font) && /Onest/.test(m.bodyFont) && !m.overflow, JSON.stringify({ h1Font: m.h1Font, body: m.bodyFont }))
  ok('голям екран: долната лента за телефон е скрита', m.bar === 'none', String(m.bar))

  // секции в ред, залепена карта
  const order = await page.evaluate(() => [...document.querySelectorAll('.stay-sec h2, .stay-sec .stay-sub')].map((h) => h.textContent.trim().slice(0, 28)))
  ok('секциите са в ред: Цял имот → За това място → Какво предлага → Наличност → Правила → Къде → Отзиви', ['Цял имот', 'За това място', 'Какво предлага', 'Наличност', 'Правила', 'Къде', '4.'].every((t, i) => order[i] && order[i].startsWith(t.replace('4.', '4')) || (t === '4.' && /\d\.\d/.test(order[i] ?? ''))), order.join(' | '))
  await page.evaluate(() => window.scrollTo(0, 1100))
  await page.waitForTimeout(300)
  const sticky = await page.evaluate(() => { const r = document.querySelector('.stay-booking').getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight } })
  ok('голям екран: картата за резервация е залепена и остава във видимата част при скрол', sticky.top >= 0 && sticky.top <= 40 && sticky.bottom < sticky.vh, JSON.stringify(sticky))

  // бутон: контраст на белия текст върху акцента
  const contrast = await page.evaluate(() => {
    const rgb = (s) => s.match(/[\d.]+/g).slice(0, 3).map(Number)
    const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
    const btn = document.querySelector('.stay-booking .stay-btn')
    const a = lum(rgb(getComputedStyle(btn).backgroundColor)); const b = lum(rgb(getComputedStyle(btn).color))
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
  })
  ok('бутонът „Провери цена“ има контраст ≥ 4.5:1', contrast >= 4.5, contrast.toFixed(2) + ':1')

  // лайтбокс
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.locator('.stay-photo button').first().click()
  await page.waitForSelector('[role="dialog"]')
  const lb1 = await page.evaluate(() => document.querySelector('.stay-lightbox__count').textContent.trim())
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(150)
  const lb2 = await page.evaluate(() => document.querySelector('.stay-lightbox__count').textContent.trim())
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
  const closed = (await page.locator('[role="dialog"]').count()) === 0
  ok('лайтбокс: отваря се от снимка, стрелките сменят снимката, Esc го затваря', lb1 === '1 / 8' && lb2 === '2 / 8' && closed, `${lb1} → ${lb2}, затворен: ${closed}`)

  // цена и заявка
  await page.locator('.stay-booking input[type="date"]').nth(0).fill(plus(40))
  await page.locator('.stay-booking input[type="date"]').nth(1).fill(plus(43))
  await page.getByRole('button', { name: 'Провери цена' }).click()
  await page.waitForSelector('.stay-quote')
  const q = await page.evaluate(() => document.querySelector('.stay-quote').textContent.replace(/\s+/g, ' '))
  ok('проверка на цена: „Свободно е…“, 3 нощувки, общо 286.00 €, капаро', /Свободно е за избрания период/.test(q) && /3 нощувки/.test(q) && /286\.00 €/.test(q) && /Капаро/.test(q), q.slice(0, 120))
  await page.getByLabel('Име *').fill('Иван Тестов')
  await page.locator('.stay-booking input[type="tel"]').fill('+359 88 123 4567')
  await page.getByRole('button', { name: 'Изпрати заявка' }).click()
  await page.waitForSelector('[role="status"]:has-text("Заявката е изпратена")', { timeout: 5000 })
  ok('заявка: изпраща се и се показва потвърждение', true)

  // заети дати
  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('.stay-booking input[type="date"]')
  await page.waitForTimeout(500)
  const today = new Date().toISOString().slice(0, 10)
  await page.locator('.stay-booking input[type="date"]').nth(0).fill(today)
  await page.locator('.stay-booking input[type="date"]').nth(1).fill(plus(3))
  await page.getByRole('button', { name: 'Провери цена' }).click()
  await page.waitForSelector('.stay-quote')
  const busy = await page.evaluate(() => document.querySelector('.stay-quote').textContent.replace(/\s+/g, ' '))
  ok('заети дати: ясно съобщение, без форма за заявка', /Тези дати вече са заети/.test(busy) && (await page.getByRole('button', { name: 'Изпрати заявка' }).count()) === 0, busy.slice(0, 80))
  ok('без грешки в конзолата', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

/* ============================================================ телефон */
{
  const { ctx, page } = await open(375, 812)
  const m = await page.evaluate(() => {
    const first = document.querySelector('.stay-photo img').getBoundingClientRect()
    const ul = document.querySelector('.stay-photos')
    return {
      imgW: Math.round(first.width), imgTop: Math.round(first.top),
      counter: document.querySelector('.stay-gallery__count')?.textContent.trim(),
      counterShown: getComputedStyle(document.querySelector('.stay-gallery__count')).display !== 'none',
      allBtn: getComputedStyle(document.querySelector('.stay-gallery__all')).display,
      titleY: Math.round(document.querySelector('h1').getBoundingClientRect().top),
      snap: getComputedStyle(ul).scrollSnapType,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }
  })
  ok('телефон: снимките са на цяла ширина, най-отгоре, заглавието е под тях', m.imgW === 375 && m.imgTop <= 1 && m.titleY > 300 && !m.overflow, JSON.stringify({ imgW: m.imgW, top: m.imgTop, titleY: m.titleY }))
  ok('телефон: лента с щракване и брояч „1 / 8“, без бутона „Всички снимки“', /x mandatory/.test(m.snap) && m.counter === '1 / 8' && m.counterShown && m.allBtn === 'none', JSON.stringify({ snap: m.snap, counter: m.counter }))
  await page.evaluate(() => document.querySelector('.stay-photos').scrollTo({ left: 375 * 2, behavior: 'instant' }))
  await page.waitForTimeout(300)
  const c2 = await page.evaluate(() => document.querySelector('.stay-gallery__count').textContent.trim())
  ok('телефон: при плъзгане броячът следва снимката (3 / 8)', c2 === '3 / 8', c2)

  // залепена лента: скрита отгоре; показва се след скрол; скрива се при картата за резервация
  const bar0 = await page.evaluate(() => document.querySelector('.stay-bar').classList.contains('is-on'))
  await page.evaluate(() => window.scrollTo(0, 900))
  await page.waitForTimeout(500)
  const bar1 = await page.evaluate(() => document.querySelector('.stay-bar').classList.contains('is-on'))
  await page.evaluate(() => document.getElementById('quote-section').scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(500)
  const bar2 = await page.evaluate(() => document.querySelector('.stay-bar').classList.contains('is-on'))
  ok('телефон: лентата с цената е скрита отгоре, показва се при четене и се скрива до картата', bar0 === false && bar1 === true && bar2 === false, JSON.stringify({ top: bar0, reading: bar1, atCard: bar2 }))
  const order = await page.evaluate(() => { const y = (el) => el.getBoundingClientRect().top + scrollY; const secs = [...document.querySelectorAll('.stay-sec')]; const find = (t) => secs.find((s) => s.querySelector('h2')?.textContent.startsWith(t)); return { avail: y(find('Наличност')), card: y(document.getElementById('quote-section')), rules: y(find('Правила')) } })
  ok('телефон: картата за резервация е след „Наличност“ и преди „Правила“', order.avail < order.card && order.card < order.rules, JSON.stringify(order))
  const tap = await page.evaluate(() => [...document.querySelectorAll('.stay-bar .stay-btn, .stay-booking .stay-btn, .stay-chip, .stay-photo button')].map((b) => { const r = b.getBoundingClientRect(); return Math.round(r.height) }).filter(Boolean))
  ok('телефон: бутоните са ≥ 44 px високи', tap.every((h) => h >= 44), `най-нисък ${Math.min(...tap)}`)
  await ctx.close()
}

/* ============================================================ имот с малко попълнено: празни секции няма */
{
  const { ctx, page, errors } = await open(1440, 900, 'bez-snimki')
  const m = await page.evaluate(() => ({
    empty: !!document.querySelector('.stay-gallery--empty'),
    photos: document.querySelectorAll('.stay-photo').length,
    heads: [...document.querySelectorAll('.stay-sec h2, .stay-sec .stay-sub')].map((h) => h.textContent.trim()),
    emptySections: [...document.querySelectorAll('.stay-sec')].filter((s) => s.textContent.trim().length < 12).length,
    reviews: !!document.getElementById('reviews'),
    map: !!document.querySelector('.stay-mapbox'),
    share: !!document.querySelector('.stay-chip'),
    price: document.querySelector('.stay-price')?.textContent.trim(),
  }))
  ok('без снимки: спокоен градиент вместо празен блок, без мозайка', m.empty && m.photos === 0)
  ok('без описание, удобства, отзиви и карта — тези секции не се показват', !m.heads.some((h) => /За това място|Какво предлага|Къде ще бъдете/.test(h)) && !m.reviews && !m.map && m.emptySections === 0, m.heads.join(' | '))
  ok('основното остава: заглавие, наличност, правила, карта за резервация с цена', m.heads.some((h) => /Наличност/.test(h)) && m.heads.some((h) => /Правила/.test(h)) && /87 €/.test(m.price ?? ''), m.price)
  ok('без грешки в конзолата', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

/* ============================================================ несъществуващ адрес */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.goto(`${base}/stay/няма-такъв`, { waitUntil: 'load' })
  await page.waitForSelector('h1')
  const t = await page.evaluate(() => ({ h1: document.querySelector('h1').textContent, noindex: !!document.querySelector('meta[name="robots"][content*="noindex"]') }))
  ok('несъществуващ адрес: „Страницата не е намерена“ (404 в същия вид)', t.h1 === 'Страницата не е намерена', JSON.stringify(t))
  await ctx.close()
}

/* ============================================================ достъпност */
for (const [w, h] of [[375, 812], [1440, 900]]) {
  const { ctx, page } = await open(w, h)
  await page.evaluate(axeSource)
  const res = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } }))
  const n = res.violations.reduce((s, v) => s + v.nodes.length, 0)
  ok(`${w} px: axe — 0 нарушения`, n === 0, res.violations.map((v) => `${v.id}(${v.nodes.length}) ${v.nodes[0].target.join(' ').slice(0, 60)}`).join(' | '))
  await ctx.close()
}

await browser.close()
console.log(`\n${pass} успешни, ${fail} провалени\n`)
process.exit(fail ? 1 : 0)
