// Демо витрина /demo (без регистрация): списък, страница на имот, сметка с оферти, запитване без изпращане,
// вход/регистрация → демо, без заявки към базата, без превод от приложението, noindex, достъпност, препълване.
//   node scripts/visual/demo.mjs http://localhost:4174 [out-dir за снимки]
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
const base = process.argv[2] || 'http://localhost:4174'
const shots = process.argv[3]
if (shots) mkdirSync(shots, { recursive: true })
const COARSE = ['--blink-settings=primaryPointerType=2,availablePointerTypes=2,primaryHoverType=1,availableHoverTypes=1']
let pass = 0
let fail = 0
const ok = (name, cond, extra = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`)
}
const browser = await chromium.launch({ channel: 'chrome', args: COARSE })
const SLUGS = ['morski-apartament-dve-terasi', 'svetal-apartament-sofia', 'loft-s-tuhlena-stena-plovdiv']

async function open(path, width, height, init) {
  const phone = width < 900
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, locale: 'bg-BG', timezoneId: 'Europe/Sofia', deviceScaleFactor: phone ? 2 : 1 })
  if (init) await ctx.addInitScript(init)
  const page = await ctx.newPage()
  const errors = []
  const calls = [] // заявки към базата или към функциите
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|tile|openstreetmap/i.test(m.text())) errors.push('console: ' + m.text()) })
  page.on('request', (r) => { if (/\/rest\/v1\/|\/api\/|\/auth\/v1\//.test(r.url())) calls.push(`${r.method()} ${new URL(r.url()).pathname}`) })
  await page.goto(`${base}${path}`, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForSelector('h1', { timeout: 8000 })
  await page.waitForTimeout(700)
  return { ctx, page, errors, calls }
}
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
const axe = async (page) => {
  await page.evaluate(axeSource)
  return page.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map((v) => `${v.id}(${v.nodes.length}): ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`))
}
const winterDates = () => {
  const now = new Date()
  const y = now > new Date(now.getFullYear(), 0, 20) ? now.getFullYear() + 1 : now.getFullYear()
  return [`${y}-01-20`, `${y}-01-27`]
}

/* ============================================================ списък /demo */
for (const [w, h] of [[1440, 900], [375, 812]]) {
  const { ctx, page, errors, calls } = await open('/demo', w, h)
  const m = await page.evaluate(() => ({
    h1: document.querySelector('h1')?.textContent, h1n: document.querySelectorAll('h1').length, mains: document.querySelectorAll('main').length,
    cards: [...document.querySelectorAll('.demo-card')].map((a) => ({ href: a.getAttribute('href'), h3: a.querySelector('h3')?.textContent, price: a.querySelector('.demo-card__price')?.textContent.replace(/\s+/g, ' '), tag: a.querySelector('.demo-card__tag')?.textContent })),
    signup: !!document.querySelector('a[href="/signup"]'), login: !!document.querySelector('a[href="/login"]'),
    title: document.title, robots: document.querySelector('meta[name="robots"]')?.content ?? null,
    font: getComputedStyle(document.querySelector('h1')).fontFamily.slice(0, 10),
  }))
  ok(`/demo @${w}: един h1, един main, заглавие „Вижте какво има вътре…“`, m.h1n === 1 && m.mains === 1 && /Вижте какво има вътре, преди да се регистрирате/.test(m.h1), m.h1)
  ok(`/demo @${w}: три карти към /demo/<имот> с бадж „Демо“`, m.cards.length === 3 && m.cards.every((c, i) => c.href === `/demo/${SLUGS[i]}` && c.tag === 'Демо'), JSON.stringify(m.cards.map((c) => c.href)))
  ok(`/demo @${w}: „от“ цените са 50 €, 118 €, 74 €`, m.cards.map((c) => c.price).join('|').replace(/\s/g, '') === 'от50€/нощ|от118€/нощ|от74€/нощ', m.cards.map((c) => c.price).join(' | '))
  ok(`/demo @${w}: връзки „Създай профил“ и „Вход“, h1 с Literata, без noindex`, m.signup && m.login && /Literata/.test(m.font) && m.robots === null, m.font)
  ok(`/demo @${w}: заглавие на страницата е демо`, /Вижте какво има вътре — демо на StayFlow/.test(m.title), m.title)
  ok(`/demo @${w}: без заявки към базата и функциите`, calls.length === 0, calls.join(', '))
  ok(`/demo @${w}: без хоризонтално препълване и без грешки`, !(await overflow(page)) && errors.length === 0, errors.join(' | '))
  const v = await axe(page)
  ok(`/demo @${w}: axe — 0 нарушения`, v.length === 0, v.join(' ; '))
  if (shots) await page.screenshot({ path: `${shots}/demo-list-${w}.png`, fullPage: true })
  if (w === 1440) {
    await page.locator('.demo-card').nth(1).click()
    await page.waitForURL('**/demo/svetal-apartament-sofia')
    await page.waitForSelector('.stay-title')
    ok('/demo: щракване върху картата отваря страницата на имота', /Светъл апартамент/.test(await page.locator('h1').innerText()))
  }
  await ctx.close()
}

/* ============================================================ „Какво има вътре“ (табове с екрани на приложението) */
const TITLES = ['Какво се случва днес', 'Всички имоти в един календар', 'Резервации и плащания', 'Колко реално печелите', 'Имотът: описание, цени и оферти', 'Почистване и забележки', 'Фактури в PDF', 'Заявките идват при вас', 'На няколко езика']
for (const [w, h] of [[1440, 900], [375, 812]]) {
  const phone = w < 900
  const { ctx, page, errors, calls } = await open('/demo', w, h)
  const imgReqs = []
  page.on('request', (r) => { if (/\/demo\/tour\//.test(r.url())) imgReqs.push(r.url().split('/').pop()) })
  const tabs = page.getByRole('tab')
  ok(`тур @${w}: 9 таба в списък с етикет, първият е избран`, (await tabs.count()) === 9 && (await page.getByRole('tablist').getAttribute('aria-label')) === 'Функции на StayFlow' && (await tabs.first().getAttribute('aria-selected')) === 'true')
  ok(`тур @${w}: само избраният таб е в реда на табулатора (roving tabindex)`, (await page.locator('[role="tab"][tabindex="0"]').count()) === 1)
  let allLoaded = true
  const seen = []
  for (let i = 0; i < 9; i++) {
    await tabs.nth(i).scrollIntoViewIfNeeded()
    await tabs.nth(i).click()
    await page.waitForFunction((n) => { const imgs = [...document.querySelectorAll('.tour-panel img')]; return imgs.length > 0 && imgs.every((im) => im.complete) }, i, { timeout: 8000 }).catch(() => {})
    const st = await page.evaluate(() => ({
      title: document.querySelector('.tour-panel h3')?.textContent,
      points: document.querySelectorAll('.tour-points li').length,
      imgs: [...document.querySelectorAll('.tour-panel img')].map((im) => ({ ok: im.naturalWidth > 0, alt: im.alt, src: im.getAttribute('src').split('/').pop() })),
      selected: document.querySelector('[role="tab"][aria-selected="true"]')?.textContent.trim(),
      panelLabel: document.querySelector('[role="tabpanel"]').getAttribute('aria-labelledby'),
    }))
    seen.push(st.title)
    if (st.title !== TITLES[i] || st.points < 3 || !st.imgs.every((im) => im.ok) || st.imgs.length !== (phone ? 1 : 2)) allLoaded = false
    if (st.title !== TITLES[i] || !st.imgs.every((im) => im.ok)) console.log('   ', i, JSON.stringify(st))
  }
  ok(`тур @${w}: всеки от 9-те таба показва своя текст, 3–4 точки и ${phone ? 'снимка на телефон' : 'снимка на компютър + телефон'} (всички се зареждат)`, allLoaded, seen.join(' | '))
  ok(`тур @${w}: ${phone ? 'на телефон не се теглят снимките за компютър' : 'на компютър се теглят и двете снимки'}`, phone ? !imgReqs.some((f) => f.startsWith('desktop-')) : imgReqs.some((f) => f.startsWith('desktop-')) && imgReqs.some((f) => f.startsWith('phone-')), imgReqs.join(','))
  ok(`тур @${w}: снимките са с размери (без скок на страницата) и описание`, await page.evaluate(() => [...document.querySelectorAll('.tour-panel img')].every((im) => im.getAttribute('width') && im.getAttribute('height'))))
  // клавиатура
  await tabs.nth(2).click()
  await tabs.nth(2).focus()
  await page.keyboard.press('ArrowRight')
  let st = await page.evaluate(() => ({ sel: document.querySelector('[role="tab"][aria-selected="true"]')?.textContent.trim(), focus: document.activeElement.textContent.trim() }))
  ok(`тур @${w}: стрелка надясно избира и фокусира следващия таб`, st.sel === 'Приходи' && st.focus === 'Приходи', JSON.stringify(st))
  await page.keyboard.press('End')
  st = await page.evaluate(() => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent.trim())
  ok(`тур @${w}: End → последният (Езици)`, st === 'Езици', st)
  await page.keyboard.press('ArrowRight')
  st = await page.evaluate(() => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent.trim())
  ok(`тур @${w}: след последния се връща към първия (Табло)`, st === 'Табло', st)
  await page.keyboard.press('ArrowLeft')
  st = await page.evaluate(() => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent.trim())
  ok(`тур @${w}: стрелка наляво от първия → последния`, st === 'Езици', st)
  if (phone) {
    ok('тур @375: лентата с табове се плъзга хоризонтално, страницата — не', (await page.evaluate(() => { const t = document.querySelector('.tour-tabs'); return t.scrollWidth > t.clientWidth })) && !(await overflow(page)))
    ok('hero на телефон: без картинка с екрани (не се тегли излишно)', (await page.locator('.demo-hero__art').count()) === 0)
  } else {
    ok('hero на компютър: екран на календара + телефон с таблото', (await page.locator('.demo-hero__art img').count()) === 2 && (await page.locator('.demo-hero__art img').first().evaluate((im) => im.naturalWidth > 0)))
  }
  ok(`тур @${w}: без хоризонтално препълване, без грешки, без заявки към базата`, !(await overflow(page)) && errors.length === 0 && calls.length === 0, errors.concat(calls).join(' | '))
  await page.waitForTimeout(450) // да свърши входната анимация на панела
  const v = await axe(page)
  ok(`тур @${w}: axe — 0 нарушения`, v.length === 0, v.join(' ; '))
  if (shots) {
    await tabs.nth(3).click()
    await page.locator('#tour').scrollIntoViewIfNeeded()
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${shots}/demo-tour-${w}.png` })
  }
  await ctx.close()
}

/* ============================================================ страница на имот */
for (const [w, h] of [[1440, 900], [375, 812]]) {
  const { ctx, page, errors, calls } = await open(`/demo/${SLUGS[0]}`, w, h)
  const m = await page.evaluate(() => ({
    bar: document.querySelector('.stay-demo-bar')?.innerText.replace(/\s+/g, ' '),
    h1: document.querySelector('h1').textContent,
    h2: [...document.querySelectorAll('.stay-sec h2, .stay-sub')].map((x) => x.textContent.trim().slice(0, 24)),
    robots: document.querySelector('meta[name="robots"]')?.content ?? null,
    title: document.title,
    photos: [...document.querySelectorAll('.stay-photo')].filter((p) => getComputedStyle(p).display !== 'none').length,
    busy: document.querySelectorAll('.stay-day--busy').length,
    accent: getComputedStyle(document.querySelector('.stay')).getPropertyValue('--stay-accent').trim(),
    price: document.querySelector('.stay-price')?.textContent.replace(/\s+/g, ' ').trim(),
    seasons: [...document.querySelectorAll('.stay-seasons li')].map((l) => l.textContent.replace(/\s+/g, ' ').trim()),
    offers: [...document.querySelectorAll('.stay-offers li b')].map((b) => b.textContent),
    cta: [...document.querySelectorAll('.stay-demo-cta a')].map((a) => a.getAttribute('href')),
  }))
  ok(`демо имот @${w}: лента „Демо на StayFlow“ с връзки към примерите и регистрацията`, /Демо на StayFlow/.test(m.bar) && /Всички примери/.test(m.bar) && /Създай свой профил/.test(m.bar), m.bar)
  ok(`демо имот @${w}: заглавие на имота, noindex, заглавие на страницата`, /Апартамент с две тераси/.test(m.h1) && m.robots === 'noindex' && /демо \| StayFlow/.test(m.title), `${m.robots} | ${m.title}`)
  ok(`демо имот @${w}: секции Цени по сезон и Оферти се виждат`, m.h2.some((t) => /Цени по сезон/.test(t)) && m.h2.some((t) => /Оферти/.test(t)), m.h2.join(' | '))
  ok(`демо имот @${w}: „от 50 €“ (най-евтиният сезон), два сезона и „6+1“ с „Месец“`, /50 €/.test(m.price) && m.seasons.length === 3 && m.offers.join(',') === '6+1,Месец', `${m.price} | ${m.seasons.join(' ; ')} | ${m.offers}`)
  ok(`демо имот @${w}: акцентът на имота (#0a5c8f) е приложен`, m.accent.length > 3, m.accent)
  ok(`демо имот @${w}: календарът показва заети дни, до 5 видими снимки на голям екран`, m.busy > 0 && (w < 900 || m.photos === 5), `${m.busy} заети, ${m.photos} снимки`)
  ok(`демо имот @${w}: край на страницата — призив „Създай свой профил“ и „Още примери“`, m.cta.join(',') === '/signup,/demo', m.cta.join(','))

  // сметка с оферта
  const [a, b] = winterDates()
  await page.fill('.stay-dates input[type="date"] >> nth=0', a)
  await page.fill('.stay-dates input[type="date"] >> nth=1', b)
  await page.getByRole('button', { name: 'Провери цена' }).scrollIntoViewIfNeeded()
  await page.getByRole('button', { name: 'Провери цена' }).click()
  await page.waitForSelector('.stay-quote')
  const q = await page.evaluate(() => document.querySelector('.stay-quote').innerText.replace(/\s+/g, ' '))
  ok(`демо имот @${w}: 7 зимни нощувки → ред „Оферта 6+1“ −50 €, общо 325 €`, /Оферта.*6\+1/.test(q) && /−\s?50\.00 €/.test(q) && /350\.00 €/.test(q) && /325\.00 €/.test(q), q.slice(0, 260))
  ok(`демо имот @${w}: сметката не ходи до базата`, calls.filter((c) => /quote_stay|booking-request/.test(c)).length === 0, calls.join(', '))
  if (shots && w === 1440) await page.screenshot({ path: `${shots}/demo-stay-quote-${w}.png` })

  // заявка — потвърждава се, но нищо не се изпраща
  const req = page.locator('form:has(input[type="tel"])')
  await req.locator('input.stay-input').first().fill('Мария Демо')
  await req.locator('input[type="email"]').fill('maria@example.com')
  await req.locator('button[type="submit"]').click()
  await page.waitForSelector('.stay-card[role="status"]')
  const sent = await page.locator('.stay-card[role="status"]').innerText()
  ok(`демо имот @${w}: заявката показва потвърждение и бележка „това е демо“`, /демо/i.test(sent), sent.replace(/\s+/g, ' ').slice(0, 160))
  ok(`демо имот @${w}: нищо не е изпратено (0 заявки към /api и базата)`, calls.filter((c) => /^POST/.test(c)).length === 0 && calls.length === 0, calls.join(', '))
  ok(`демо имот @${w}: без хоризонтално препълване и без грешки`, !(await overflow(page)) && errors.length === 0, errors.join(' | '))
  const v = await axe(page)
  ok(`демо имот @${w}: axe — 0 нарушения`, v.length === 0, v.join(' ; '))
  if (shots) await page.screenshot({ path: `${shots}/demo-stay-${w}.png` })
  await ctx.close()
}

/* ============================================================ другите имоти, език, непознат адрес */
{
  const { ctx, page } = await open(`/demo/${SLUGS[1]}?lang=en`, 1440, 900)
  const h2 = await page.evaluate(() => [...document.querySelectorAll('.stay-sec h2')].map((x) => x.textContent.trim()))
  ok('демо на английски: секциите са на английски (Offers, Availability)', h2.includes('Offers') && h2.some((t) => /Availability/.test(t)), h2.join(' | '))
  ok('демо на английски: лентата остава на български (като бележката при преглед)', /Демо на StayFlow/.test(await page.locator('.stay-demo-bar').innerText()))
  await ctx.close()
}
{
  const { ctx, page } = await open(`/demo/${SLUGS[2]}`, 1440, 900)
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const first = new Date()
  first.setDate(first.getDate() + 4)
  while (first.getDay() !== 5) first.setDate(first.getDate() + 1)
  // „Уикенд“ (2 нощувки за 130 € от петък) трябва да се приложи в някой петък без заети нощи
  let applied = false
  for (let k = 0; k < 6 && !applied; k++) {
    const a = new Date(first); a.setDate(a.getDate() + 7 * k)
    const b = new Date(a); b.setDate(b.getDate() + 2)
    await page.fill('.stay-dates input[type="date"] >> nth=0', iso(a))
    await page.fill('.stay-dates input[type="date"] >> nth=1', iso(b))
    await page.getByRole('button', { name: 'Провери цена' }).click()
    await page.waitForSelector('.stay-quote')
    const txt = await page.locator('.stay-quote').innerText()
    applied = /Оферта.*Уикенд/.test(txt)
    if (applied) ok('Пловдив: петък + 2 нощувки → „Уикенд“ (130 € вместо 148 €)', /130|18\.00/.test(txt), txt.replace(/\s+/g, ' ').slice(0, 200))
  }
  ok('Пловдив: оферта „Уикенд“ се намира в някой от следващите петъци', applied)
  await ctx.close()
}
{
  const { ctx, page, errors } = await open('/demo/nqma-takova', 1440, 900)
  ok('непознат демо адрес: 404 с връзка към примерите', /404|не е намерена|Not found/i.test(await page.locator('main').innerText()) && (await page.locator('a[href="/demo"]').count()) >= 1 && errors.length === 0, errors.join(' | '))
  await ctx.close()
}
{
  // приложението на собственика на гръцки не превежда демото
  const { ctx, page } = await open('/demo', 1440, 900, () => { try { localStorage.setItem('stayflow.appLang', 'el') } catch {} })
  ok('приложението на гръцки не превежда /demo', /Вижте какво има вътре/.test(await page.locator('h1').innerText()) && (await page.locator('html').getAttribute('lang')) === 'bg')
  await ctx.close()
}

/* ============================================================ вход и регистрация → демо */
for (const [w, h] of [[1440, 900], [375, 812]]) {
  for (const route of ['/login', '/signup']) {
    const { ctx, page, errors } = await open(route, w, h)
    const link = page.getByRole('link', { name: 'Разгледайте демо без регистрация' })
    ok(`${route} @${w}: връзка „Разгледайте демо без регистрация“ е видима, цел най-малко 44 px`, (await link.isVisible()) && (await link.boundingBox()).height >= 44, JSON.stringify(await link.boundingBox()))
    ok(`${route} @${w}: без препълване, без грешки`, !(await overflow(page)) && errors.length === 0, errors.join(' | '))
    if (shots) await page.screenshot({ path: `${shots}/${route.slice(1)}-${w}.png` })
    if (w === 1440) {
      await link.click()
      await page.waitForURL('**/demo')
      await page.waitForSelector('.demo-hero h1')
      ok(`${route}: връзката отвежда към /demo`, /Вижте какво има вътре/.test(await page.locator('h1').innerText()))
    }
    await ctx.close()
  }
}
{
  // други страници за вход нямат демо връзка (reset), a Login на гръцки е преведена
  const { ctx, page } = await open('/reset-password', 1440, 900)
  ok('/reset-password: без демо връзка', (await page.getByRole('link', { name: /демо/i }).count()) === 0)
  await ctx.close()
}
{
  const { ctx, page } = await open('/login', 1440, 900, () => { try { localStorage.setItem('stayflow.appLang', 'el') } catch {} })
  await page.waitForTimeout(600)
  ok('/login на гръцки: връзката към демото е преведена', (await page.getByRole('link', { name: 'Δείτε ένα demo χωρίς εγγραφή' }).count()) === 1)
  await ctx.close()
}

await browser.close()
console.log(`\n${pass} минали, ${fail} провалени`)
process.exit(fail ? 1 : 0)
