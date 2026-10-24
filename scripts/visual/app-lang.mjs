// Приложението на собственика на гръцки и македонски: на всеки екран няма останали български текстове, няма препълване,
// <html lang>, достъпност, смяна на езика на живо (без презареждане) и връщане на български, запомняне, откриване по браузъра,
// модални прозорци, публичните страници остават със свой език.
//   node scripts/visual/app-lang.mjs http://localhost:4174
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { USER, TABLES, RPC } from './seed.mjs'
import el from '../../src/i18n/el.js'
import mk from '../../src/i18n/mk.js'
import { createTranslator } from '../../src/i18n/translator.js'

const require = createRequire(import.meta.url)
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
const base = process.argv[2] || 'http://localhost:4174'
const P1 = '21111111-0000-4000-8000-000000000001'
const COARSE = ['--blink-settings=primaryPointerType=2,availablePointerTypes=2,primaryHoverType=1,availableHoverTypes=1']
mkdirSync('scripts/visual/out', { recursive: true })
let pass = 0
let fail = 0
const ok = (name, cond, extra = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`)
}
const DICTS = { el, mk }
const TR = { el: createTranslator(el), mk: createTranslator(mk) }
const CYR = /[А-Яа-я]/
// македонски превод, който е и български ключ с друг превод (напр. „Откажи“) — не е остатък от български
const MK_HOMOGRAPHS = new Set(Object.values(mk).filter((v) => v in mk && mk[v] !== v))

/** Българските текстове в данните на макета (имена, бележки) — те не са интерфейс и не се превеждат. */
const seedStrings = (() => {
  const set = new Set()
  const walk = (v) => {
    if (typeof v === 'string') {
      if (CYR.test(v) && v.length > 1) set.add(v.trim())
    } else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') Object.values(v).forEach(walk)
  }
  walk(TABLES)
  for (const fn of Object.values(RPC)) {
    try { walk(fn({ p_slug: 'tihi-bryag', p_from: '2026-01-01', p_to: '2026-12-31' })) } catch { /* някои RPC искат други параметри */ }
  }
  walk(USER)
  // думите от речника са интерфейс (категории като „Ток“) — те трябва да се превеждат, не да се прикриват като данни
  return [...set].filter((s) => !(s in el)).sort((a, b) => b.length - a.length)
})()

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER.id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 86400 })}.sig`
const session = { access_token: jwt, token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: USER }

const browser = await chromium.launch({ channel: 'chrome', args: COARSE })

async function open(path, width, height, { lang, signedIn = true, locale = 'bg-BG', fresh = false } = {}) {
  const phone = width < 900
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, locale, timezoneId: 'Europe/Sofia', deviceScaleFactor: phone ? 2 : 1 })
  await ctx.addInitScript(([s, signed, l]) => {
    try {
      if (signed) {
        localStorage.setItem('sb-localhost-auth-token', JSON.stringify(s))
        localStorage.setItem('stayflow.autoSetupSeen', '1')
      }
      if (l && !sessionStorage.getItem('__lang_seeded')) {
        localStorage.setItem('stayflow.appLang', l)
        sessionStorage.setItem('__lang_seeded', '1')
      }
    } catch {}
  }, [session, signedIn, fresh ? null : lang])
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|the server responded/.test(m.text())) errors.push(m.text().slice(0, 140)) })
  await page.goto(base + path, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(1300)
  return { ctx, page, errors }
}

/** Текстовете на страницата (възли + атрибути), които още приличат на български интерфейс. */
async function leftovers(page, lang) {
  const raw = await page.evaluate(() => {
    const out = []
    const skip = (el) => !el || ['SCRIPT', 'STYLE', 'TEXTAREA', 'NOSCRIPT'].includes(el.tagName) || el.closest('[translate="no"]')
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = w.nextNode(); n; n = w.nextNode()) if (!skip(n.parentElement) && n.data.trim()) out.push(n.data.replace(/\s+/g, ' ').trim())
    for (const el of document.querySelectorAll('[placeholder],[title],[aria-label],[alt]'))
      for (const a of ['placeholder', 'title', 'aria-label', 'alt']) if (el.hasAttribute(a) && !el.closest('[translate="no"]')) out.push(el.getAttribute(a).replace(/\s+/g, ' ').trim())
    out.push(document.title)
    return out
  })
  const bad = []
  for (const text of new Set(raw)) {
    if (/^[А-Я]{1,3}$/.test(text)) continue // инициали на гост/потребител (данни)
    if (text.includes('Морски апартамент')) continue // примерът за кирилица в подсказката е нарочно на кирилица
    if (lang === 'mk' && MK_HOMOGRAPHS.has(text)) continue // „Откажи“ е и македонски превод на „Отказ“, и български ключ — вече преведеният възел не се превежда пак
    let rest = text
    for (const s of seedStrings) if (rest.includes(s)) rest = rest.split(s).join(' ')
    if (lang === 'el') {
      if (CYR.test(rest)) bad.push(text)
    } else if (lang === 'mk') {
      // македонски: или превеждачът още би го променил (значи е останал български), или има букви само от българския
      if (TR.mk.translate(rest) !== rest || /[ъщюяыэ]/i.test(rest)) bad.push(text)
    }
  }
  return bad
}

const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
const axeRun = async (page) => {
  await page.evaluate(axeSource)
  const res = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } }))
  return res.violations.map((v) => `${v.id}(${v.nodes.length}) ${v.nodes[0].target.join(' ').slice(0, 70)}`)
}

const ROUTES = [
  '/', '/calendar', '/bookings', '/booking-requests', '/earnings', '/earnings/rules', '/cleaning-tasks', '/cleaning-notes', '/pricing',
  '/guest-cards', '/access-codes', '/invoicing', '/notifications', '/properties', `/properties/${P1}`, '/properties/new', `/properties/${P1}/setup`,
]
const AUTH_ROUTES = ['/login', '/signup', '/reset-password']

/* ============================================================ всеки екран на всеки език */
for (const lang of ['el', 'mk']) {
  const html = lang
  for (const [w, h] of [[1440, 900], [375, 812]]) {
    const problems = []
    const overflows = []
    const errs = []
    let langAttr = []
    for (const route of ROUTES) {
      const { ctx, page, errors } = await open(route, w, h, { lang })
      const bad = await leftovers(page, lang)
      if (bad.length) problems.push(`${route}: ${bad.slice(0, 4).join(' ¦ ')}${bad.length > 4 ? ` (+${bad.length - 4})` : ''}`)
      if (await overflow(page)) overflows.push(route)
      const l = await page.evaluate(() => document.documentElement.lang)
      if (l !== html) langAttr.push(`${route}=${l}`)
      if (errors.length) errs.push(`${route}: ${errors[0]}`)
      if (route === '/' ) await page.screenshot({ path: `scripts/visual/out/applang-${lang}-home-${w}.png` })
      await ctx.close()
    }
    ok(`${lang} ${w}: на ${ROUTES.length} екрана няма български текстове (възли и надписи)`, problems.length === 0, problems.slice(0, 5).join(' || '))
    ok(`${lang} ${w}: няма препълване встрани на нито един екран`, overflows.length === 0, overflows.join(', '))
    ok(`${lang} ${w}: <html lang="${html}"> навсякъде`, langAttr.length === 0, langAttr.join(', '))
    ok(`${lang} ${w}: без грешки в конзолата`, errs.length === 0, errs.slice(0, 3).join(' | '))
  }
  // вход и регистрация (без сесия)
  const problems = []
  for (const route of AUTH_ROUTES) {
    const { ctx, page } = await open(route, 375, 812, { lang, signedIn: false })
    const bad = await leftovers(page, lang)
    if (bad.length) problems.push(`${route}: ${bad.slice(0, 3).join(' ¦ ')}`)
    if (await overflow(page)) problems.push(`${route}: препълване`)
    await page.screenshot({ path: `scripts/visual/out/applang-${lang}-login-375.png` }).catch(() => {})
    await ctx.close()
  }
  ok(`${lang}: вход, регистрация и забравена парола — на езика, без препълване`, problems.length === 0, problems.join(' || '))
}

/* ============================================================ достъпност */
for (const lang of ['el', 'mk']) {
  for (const route of ['/', '/bookings', '/properties/new', '/earnings']) {
    for (const [w, h] of [[1440, 900], [375, 812]]) {
      const { ctx, page } = await open(route, w, h, { lang })
      const v = await axeRun(page)
      ok(`${lang} ${w} ${route}: axe — 0 нарушения`, v.length === 0, v.join(' | '))
      await ctx.close()
    }
  }
  const { ctx, page } = await open('/login', 375, 812, { lang, signedIn: false })
  const v = await axeRun(page)
  ok(`${lang} /login: axe — 0 нарушения`, v.length === 0, v.join(' | '))
  await ctx.close()
}

/* ============================================================ модални прозорци и формите в тях */
const dialogs = [
  ['/bookings', 'Нова резервация', 'Създай резервация'],
  ['/pricing', 'Ново правило', 'Създай правило'],
  ['/cleaning-tasks', 'Нова задача', 'Създай задача'],
  ['/cleaning-notes', 'Нова забележка', 'Запази забележка'],
  ['/invoicing', 'Нова фактура', 'Издай и свали PDF'],
]
for (const lang of ['el', 'mk']) {
  for (const [route, openLabel, submitLabel] of dialogs) {
    const { ctx, page } = await open(route, 1440, 900, { lang })
    const dict = DICTS[lang]
    await page.getByRole('button', { name: dict[openLabel], exact: true }).first().click()
    const submitBtn = page.getByRole('button', { name: dict[submitLabel], exact: true }).first()
    await submitBtn.waitFor({ timeout: 6000 })
    await page.waitForTimeout(500)
    ok(`${lang} ${route}: прозорецът „${openLabel}“ се отваря и бутонът му е на езика („${dict[submitLabel]}“)`, await submitBtn.isVisible())
    const bad = await leftovers(page, lang)
    ok(`${lang} ${route}: прозорецът няма български текстове`, bad.length === 0, bad.slice(0, 4).join(' ¦ '))
    // грешките при празна форма също са на езика
    const submit = page.getByRole('button', { name: dict[submitLabel], exact: true }).first()
    if (await submit.count()) {
      await submit.click().catch(() => {})
      await page.waitForTimeout(500)
      const bad2 = await leftovers(page, lang)
      ok(`${lang} ${route}: съобщенията за грешка при празна форма са на езика`, bad2.length === 0, bad2.slice(0, 4).join(' ¦ '))
    }
    if (route === '/bookings' && lang === 'el') await page.screenshot({ path: 'scripts/visual/out/applang-el-modal-1440.png' })
    await ctx.close()
  }
}

/* ============================================================ дати и месеци на езика */
{
  const { ctx, page } = await open('/', 1440, 900, { lang: 'el' })
  const eyebrow = await page.evaluate(() => document.querySelector('.type-eyebrow, [class*="eyebrow"], p.font-display')?.textContent.trim() ?? document.body.innerText.slice(0, 120))
  ok('гръцки: датата на таблото е по Intl на гръцки (без кирилица)', !CYR.test(eyebrow), eyebrow)
  await ctx.close()
}
{
  const { ctx, page } = await open('/calendar', 1440, 900, { lang: 'mk' })
  const head = await page.locator('span.text-base.font-bold').first().innerText()
  ok('македонски: месецът в календара е на македонски („Октомври 2026“-вид, не „Ноември“ на български)', /^(Јануари|Февруари|Март|Април|Мај|Јуни|Јули|Август|Септември|Октомври|Ноември|Декември) \d{4}$/.test(head.trim()), head)
  const wk = await page.evaluate(() => [...document.querySelectorAll('.grid.grid-cols-7 > div')].slice(0, 7).map((d) => d.textContent.trim()))
  ok('македонски: дните от седмицата са Пон Вто Сре Чет Пет Саб Нед', wk.join(' ') === 'Пон Вто Сре Чет Пет Саб Нед', wk.join(' '))
  await ctx.close()
}
{
  const { ctx, page } = await open('/earnings', 1440, 900, { lang: 'el' })
  const t = await page.evaluate(() => document.body.innerText)
  ok('гръцки: Приходи — показателите и графиката са на гръцки (Κέρδος, Πληρότητα, Άμεσες)', /Κέρδος/.test(t) && /Πληρότητα/.test(t) && /Άμεσες/.test(t) && (await leftovers(page, 'el')).length === 0, (await leftovers(page, 'el')).slice(0, 3).join(' ¦ '))
  await ctx.close()
}

/* ============================================================ смяна на езика на живо, запомняне, откриване */
{
  const { ctx, page } = await open('/', 1440, 900, { fresh: true })
  await page.evaluate(() => { window.__marker = 'жив' })
  const nav0 = await page.locator('aside nav').innerText()
  ok('по подразбиране (браузър на български) приложението е на български', /Календар/.test(nav0) && (await page.evaluate(() => document.documentElement.lang)) === 'bg')
  const sw = page.locator('aside select')
  ok('в страничната лента има избор на език с три езика', (await sw.count()) === 1 && (await sw.locator('option').allTextContents()).join('|') === 'Български|Ελληνικά|Македонски')
  await sw.selectOption('el')
  await page.waitForFunction(() => /Ημερολόγιο/.test(document.querySelector('aside nav').innerText))
  const st = await page.evaluate(() => ({ marker: window.__marker, lang: document.documentElement.lang, stored: localStorage.getItem('stayflow.appLang'), nav: document.querySelector('aside nav').innerText, title: document.title, label: document.querySelector('aside select').getAttribute('aria-label') }))
  ok('избор „Ελληνικά“: без презареждане, <html lang>, запомнен избор, меню и заглавие на гръцки', st.marker === 'жив' && st.lang === 'el' && st.stored === 'el' && /Πίνακας ελέγχου/.test(st.nav) && /Έσοδα/.test(st.nav) && /Διαχείριση βραχυχρόνιων/.test(st.title) && st.label === 'Γλώσσα', JSON.stringify({ ...st, nav: st.nav.slice(0, 40) }))
  await sw.selectOption('mk')
  await page.waitForFunction(() => /Табла/.test(document.querySelector('aside nav').innerText))
  const mkNav = await page.locator('aside nav').innerText()
  ok('избор „Македонски“: менюто е на македонски (Табла, Резервации, Ценовни планови)', /Табла/.test(mkNav) && /Ценовни планови/.test(mkNav) && (await page.evaluate(() => document.documentElement.lang)) === 'mk')
  await sw.selectOption('bg')
  await page.waitForFunction(() => /Табло/.test(document.querySelector('aside nav').innerText))
  const nav1 = await page.locator('aside nav').innerText()
  ok('връщане на български: менюто е точно като в началото (всичко се възстановява)', nav1 === nav0, nav1.slice(0, 60))
  const alt = await page.evaluate(() => document.querySelector('aside select').getAttribute('aria-label'))
  ok('надписът на избора на език се връща на „Език“', alt === 'Език')
  await sw.selectOption('el')
  await page.waitForFunction(() => /Ημερολόγιο/.test(document.querySelector('aside nav').innerText))
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(1000)
  ok('след презареждане езикът се помни (гръцки, без миг на български)', /Ημερολόγιο/.test(await page.locator('aside nav').innerText()) && (await page.evaluate(() => document.documentElement.lang)) === 'el')
  // навигация вътре в приложението запазва езика и превежда новия екран
  await page.getByRole('link', { name: 'Ημερολόγιο', exact: true }).first().click()
  await page.waitForTimeout(900)
  ok('нов екран след навигация е веднага на гръцки (Ημερολόγιο → „Σήμερα“)', /Σήμερα/.test(await page.evaluate(() => document.body.innerText)) && !(await leftovers(page, 'el')).length)
  await ctx.close()
}
{
  // телефон: изборът е в листа „Още“
  const { ctx, page } = await open('/', 375, 812, { fresh: true })
  await page.getByRole('button', { name: /Още/ }).first().click()
  await page.waitForSelector('[role="dialog"] select[aria-label="Език"]')
  await page.locator('[role="dialog"] select[aria-label="Език"]').selectOption('mk')
  await page.waitForFunction(() => /Повеќе/.test(document.body.innerText))
  ok('телефон: листът „Още“ има избор на език и превежда на живо (Повеќе, Одјава)', /Одјава/.test(await page.locator('[role="dialog"]').innerText()))
  await ctx.close()
}
for (const [loc, want, probe] of [['el-GR', 'el', 'Ημερολόγιο'], ['mk-MK', 'mk', 'Табла'], ['bg-BG', 'bg', 'Календар'], ['en-US', 'bg', 'Календар'], ['de-DE', 'bg', 'Календар']]) {
  const { ctx, page } = await open('/', 1440, 900, { fresh: true, locale: loc })
  const got = await page.evaluate(() => ({ lang: document.documentElement.lang, nav: document.querySelector('aside nav').innerText }))
  ok(`първо отваряне с браузър ${loc} → ${want}`, got.lang === want && got.nav.includes(probe), got.lang)
  await ctx.close()
}
{
  const { ctx, page } = await open('/login', 375, 812, { fresh: true, signedIn: false })
  await page.locator('select[aria-label="Език"]').selectOption('el')
  await page.waitForFunction(() => /Σύνδεση/.test(document.body.innerText))
  ok('на входа също има избор на език и работи на живо (Σύνδεση, Ξεχάσατε τον κωδικό;)', /Ξεχάσατε τον κωδικό/.test(await page.evaluate(() => document.body.innerText)))
  await ctx.close()
}

/* ============================================================ публичните страници не се превеждат от този механизъм */
{
  const { ctx, page } = await open('/stay/tihi-bryag?lang=bg', 1440, 900, { lang: 'el', signedIn: false })
  await page.waitForSelector('.stay-month')
  await page.waitForTimeout(500)
  const t = await page.evaluate(() => document.body.innerText)
  ok('публичната страница /stay остава на избрания от госта език (български), дори приложението да е на гръцки', /Наличност/.test(t) && /Правила на имота/.test(t) && (await page.evaluate(() => document.documentElement.lang)) === 'bg', (await page.evaluate(() => document.documentElement.lang)))
  await ctx.close()
}
{
  const { ctx, page } = await open('/stay/tihi-bryag?lang=mk', 1440, 900, { lang: 'el', signedIn: false })
  await page.waitForSelector('.stay-month')
  await page.waitForTimeout(500)
  const t = await page.evaluate(() => document.body.innerText)
  ok('публичната страница на македонски не се пипа от приложението (Достапност)', /Достапност/.test(t) && (await page.evaluate(() => document.documentElement.lang)) === 'mk')
  await ctx.close()
}

await browser.close()
console.log(`\n${pass} успешни, ${fail} провалени\n`)
process.exit(fail ? 1 : 0)
