// Скелет на екраните (стъпка 2): пропускане към съдържанието, скрол в началото, обвивката не изчезва при зареждане,
// скелети вместо въртящ се кръг, празни състояния, 404, един h1 на екран, „назад“.
//   node scripts/visual/shell.mjs http://localhost:4174
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await chromium.launch({ channel: 'chrome', args: COARSE })

async function open(width, height, route) {
  const phone = width < 900
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, locale: 'bg-BG', timezoneId: 'Europe/Sofia' })
  await ctx.addInitScript((s) => {
    try { localStorage.setItem('sb-localhost-auth-token', JSON.stringify(s)); localStorage.setItem('stayflow.autoSetupSeen', '1') } catch {}
  }, session)
  const page = await ctx.newPage()
  return { ctx, page, go: async (r = route) => { await page.goto(base + r, { waitUntil: 'load' }); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(900) } }
}

/* ---------------------------------------------------------- пропускане към съдържанието */
{
  const { ctx, page, go } = await open(1440, 900, '/')
  await go()
  await page.keyboard.press('Tab')
  const first = await page.evaluate(() => {
    const a = document.activeElement
    const r = a.getBoundingClientRect()
    return { href: a.getAttribute('href'), text: a.textContent.trim(), visible: r.width > 1 && r.height > 1 && getComputedStyle(a).position === 'fixed' }
  })
  ok('първият Tab е „Към съдържанието“ и става видим', first.href === '#main' && first.text === 'Към съдържанието' && first.visible, JSON.stringify(first))
  await page.keyboard.press('Enter')
  await page.waitForTimeout(100)
  const after = await page.evaluate(() => ({ id: document.activeElement.id, mains: document.querySelectorAll('main').length }))
  ok('Enter премества фокуса в съдържанието; на страницата има точно един <main>', after.id === 'main' && after.mains === 1, JSON.stringify(after))
  await ctx.close()
}

/* ---------------------------------------------------------- един h1 на всеки екран */
{
  const { ctx, page } = await open(375, 812, '/')
  const routes = ['/', '/calendar', '/bookings', '/earnings', '/earnings/rules', '/booking-requests', '/cleaning-tasks', '/cleaning-notes', '/pricing', '/guest-cards', '/access-codes', '/invoicing', '/notifications', '/properties', '/properties/new']
  const bad = []
  for (const r of routes) {
    await page.goto(base + r, { waitUntil: 'load' })
    await page.waitForTimeout(700)
    const n = await page.evaluate(() => document.querySelectorAll('h1').length)
    if (n !== 1) bad.push(`${r}:${n}`)
  }
  ok('всеки екран има точно един h1', bad.length === 0, bad.join(' ') || `${routes.length} екрана`)
  await ctx.close()
}

/* ---------------------------------------------------------- скрол в началото при смяна на екран (телефон) */
{
  const { ctx, page, go } = await open(375, 812, '/bookings')
  await go()
  await page.evaluate(() => window.scrollTo(0, 700))
  await page.waitForTimeout(100)
  const y1 = await page.evaluate(() => window.scrollY)
  await page.getByRole('link', { name: 'Календар', exact: true }).click()
  await page.waitForTimeout(500)
  const y2 = await page.evaluate(() => window.scrollY)
  ok('новият екран започва отгоре (скролът се връща в началото)', y1 > 300 && y2 === 0, `преди ${Math.round(y1)} px, след ${y2} px`)
  await ctx.close()
}

/* ---------------------------------------------------------- обвивката остава, докато идва частта на екрана */
for (const [label, w, h] of [['телефон', 375, 812], ['голям екран', 1440, 900]]) {
  // а) навигация вътре в приложението: старият екран остава на място (без мигане), менюто не изчезва
  const { ctx, page, go } = await open(w, h, '/')
  await page.route('**/assets/Pricing-*.js', async (route) => {
    await sleep(1200)
    await route.continue()
  })
  await go()
  if (w < 900) await page.getByRole('button', { name: /^Още/ }).click()
  const link = w < 900 ? page.getByRole('dialog').getByRole('link', { name: 'Ценови планове' }) : page.getByRole('navigation', { name: 'Основно меню' }).getByRole('link', { name: 'Ценови планове' })
  await link.click()
  await page.waitForTimeout(400)
  const during = await page.evaluate(() => ({ shell: !!(document.querySelector('.dock') || document.querySelector('aside nav')), h1: document.querySelector('h1')?.textContent ?? null }))
  ok(`${label}: докато идва новият екран, менюто и старият екран остават (без празно мигане)`, during.shell && during.h1 === 'Табло', JSON.stringify(during))
  await page.waitForSelector('h1:has-text("Ценови планове")', { timeout: 6000 })
  ok(`${label}: после се показва новият екран`, true)
  await ctx.close()

  // б) пряко отваряне на адреса: обвивката е на място, а на мястото на екрана има скелет
  const d = await open(w, h, '/pricing')
  await d.page.route('**/assets/Pricing-*.js', async (route) => {
    await sleep(1500)
    await route.continue()
  })
  await d.page.goto(base + '/pricing', { waitUntil: 'domcontentloaded' })
  await d.page.waitForSelector(w < 900 ? '.dock' : 'aside nav', { timeout: 8000 })
  await d.page.waitForTimeout(200)
  const first = await d.page.evaluate(() => ({ skeleton: !!document.querySelector('main [role="status"][aria-busy="true"] .skeleton'), h1: document.querySelector('h1')?.textContent ?? null, spinner: !!document.querySelector('main .animate-spin') }))
  ok(`${label}: при пряко отваряне — менюто е на място, а на мястото на екрана има скелет (не въртящ се кръг)`, first.skeleton && first.h1 === null && !first.spinner, JSON.stringify(first))
  await d.ctx.close()
}

/* ---------------------------------------------------------- скелет на данните и празно състояние */
{
  const { ctx, page, go } = await open(375, 812, '/bookings')
  const page2 = await ctx.newPage()
  await page2.route('**/rest/v1/bookings*', async (route) => { await sleep(1200); await route.continue() })
  await page2.goto(base + '/bookings', { waitUntil: 'domcontentloaded' })
  await page2.waitForSelector('main h1', { timeout: 8000 })
  await page2.waitForTimeout(250)
  const during = await page2.evaluate(() => ({ status: !!document.querySelector('main [role="status"][aria-busy="true"]'), skel: document.querySelectorAll('main .skeleton').length, spinner: !!document.querySelector('main .animate-spin') }))
  ok('докато идват резервациите, има скелет (не въртящ се кръг) със заглавието на място', during.status && during.skel >= 3 && !during.spinner, JSON.stringify(during))
  await page2.close()
  await ctx.close()
}
{
  const { ctx, page, go } = await open(375, 812, '/bookings')
  await page.route('**/rest/v1/bookings*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '*/0' }, body: '[]' })
  })
  await go('/bookings')
  await page.waitForSelector('main .empty', { timeout: 8000 })
  const t = await page.evaluate(() => document.querySelector('main .empty')?.textContent ?? '')
  ok('без резервации — празно състояние с обяснение и действие', /Още нямате резервации/.test(t) && /Нова резервация/.test(t), t.slice(0, 120))
  await go('/')
  await page.waitForSelector('main .empty', { timeout: 8000 })
  const d = await page.evaluate(() => [...document.querySelectorAll('main .empty')].map((e) => e.querySelector('.type-heading')?.textContent))
  ok('Табло без движения — две празни състояния вместо гол текст', d.includes('Днес е спокойно') && d.includes('Нищо в следващите дни'), JSON.stringify(d))
  await ctx.close()
}

/* ---------------------------------------------------------- прозорец, отворен от екран, е върху видимия екран */
for (const [label, w, h] of [['телефон', 375, 812], ['голям екран', 1440, 900]]) {
  const { ctx, page, go } = await open(w, h, '/bookings')
  await go('/bookings')
  await page.getByRole('button', { name: 'Нова резервация' }).first().click()
  await page.waitForSelector('[role="dialog"]')
  await page.waitForTimeout(500)
  const m = await page.evaluate(() => {
    const r = document.querySelector('.modal-root').getBoundingClientRect()
    const p = document.querySelector('.modal-panel').getBoundingClientRect()
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), vw: innerWidth, vh: innerHeight, panelTop: Math.round(p.top), panelBottom: Math.round(p.bottom) }
  })
  ok(`${label}: прозорецът от екран покрива целия екран и е изцяло видим (не се измества от анимацията на екрана)`, m.x === 0 && m.y === 0 && m.w === m.vw && m.h === m.vh && m.panelTop >= 0 && m.panelBottom <= m.vh + 1, JSON.stringify(m))
  await ctx.close()
}

/* ---------------------------------------------------------- 404 и „назад“ */
{
  const { ctx, page } = await open(375, 812, '/')
  await page.goto(base + '/няма-такава-страница', { waitUntil: 'load' })
  await page.waitForSelector('main .empty', { timeout: 8000 })
  const nf = await page.evaluate(() => ({ title: document.querySelector('main .empty .type-heading')?.textContent, btn: [...document.querySelectorAll('main a .btn')].find((a) => a.textContent.includes('Към таблото'))?.getBoundingClientRect().height, shell: !!document.querySelector('.dock') }))
  ok('404 е празно състояние в обвивката с бутон „Към таблото“ ≥ 44 px', nf.title === 'Страницата не е намерена' && nf.btn >= 43.9 && nf.shell, JSON.stringify(nf))
  await page.goto(base + '/properties/new', { waitUntil: 'load' })
  await page.waitForSelector('main a:has-text("Всички имоти")', { timeout: 8000 })
  const back = await page.evaluate(() => { const a = [...document.querySelectorAll('main a')].find((x) => x.textContent.trim() === 'Всички имоти'); return a ? { h: a.getBoundingClientRect().height, href: a.getAttribute('href') } : null })
  ok('„назад“ във вложен екран е ≥ 44 px и води към родителя', back && back.h >= 43.9 && back.href === '/properties', JSON.stringify(back))
  await ctx.close()
}

await browser.close()
console.log(`\n${pass} успешни, ${fail} провалени\n`)
process.exit(fail ? 1 : 0)
