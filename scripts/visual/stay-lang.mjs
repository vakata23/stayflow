// Езици на публичната страница /stay/<slug>: избор и запомняне, всеки от шестте езика (текстове, дати, удобства,
// форма, съобщения от сървъра), без български остатъци, без препълване на 375 и 1440, достъпност.
//   node scripts/visual/stay-lang.mjs http://localhost:4174
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { LANGUAGES, translate, monthTitle } from '../../src/pages/stay/i18n/core.js'

const require = createRequire(import.meta.url)
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
const base = process.argv[2] || 'http://localhost:4174'
const COARSE = ['--blink-settings=primaryPointerType=2,availablePointerTypes=2,primaryHoverType=1,availableHoverTypes=1']
mkdirSync('scripts/visual/out', { recursive: true })
let pass = 0
let fail = 0
const ok = (name, cond, extra = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`)
}
const browser = await chromium.launch({ channel: 'chrome', args: COARSE })
const plus = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)
const squash = (s) => s.replace(/\s+/g, ' ').trim()

/** Известното съдържание на имота „Тихи бряг“ (seed.mjs) — пише го собственикът, не се превежда. */
const OWNER = ['Вила „Тихи бряг“', 'Царево', 'Зима', 'Лято', 'Месец', 'Уикенд', 'Двуетажна къща на 200 метра от плажа.', 'Тишина след 22:00. Моля, оставяйте чисто.', 'Анна', 'Мартин',
  'Чудесна къща, на две крачки от плажа. Всичко беше чисто и стопанинът отговаряше бързо.', 'Много добра локация. Климатикът в долната спалня е шумен, иначе всичко е отлично.']

async function open(code, width, height, { locale = 'bg-BG', slug = 'tihi-bryag', query = code ? `?lang=${code}` : '', init } = {}) {
  const phone = width < 900
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, locale, timezoneId: 'Europe/Sofia', deviceScaleFactor: phone ? 2 : 1 })
  if (init) await ctx.addInitScript(init)
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${base}/stay/${slug}${query}`, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForSelector('h1', { timeout: 8000 })
  await page.waitForSelector('.stay-month', { timeout: 8000 })
  await page.waitForTimeout(500)
  return { ctx, page, errors }
}

/** Всичко, което страницата трябва да каже на този език (за тихия имот). */
function expected(code) {
  const t = (k, v) => translate(code, k, v)
  const { locale } = LANGUAGES.find((l) => l.code === code)
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return [
    t('entire', { city: 'Царево' }), t('guestsUpTo', { n: 6 }), t('bedrooms', { n: 3 }), t('beds', { n: 5 }), t('bathrooms', { n: 2 }), t('area', { n: 94 }),
    t('cancel.moderate.badge'), t('checkInAfter', { time: '14:00' }), t('checkOutBy', { time: '11:00' }), t('cancel.moderate.hint'), t('exactAddress'),
    t('about'), t('amenitiesTitle'), t('amenity.wifi'), t('amenity.parking_free'), t('amenity.ev_charger'), t('amenity.ac'), t('amenity.kitchen'), t('amenity.balcony'),
    t('availability'), t('availabilityNote'), monthTitle(locale, now.getFullYear(), now.getMonth()), monthTitle(locale, next.getFullYear(), next.getMonth()),
    t('rulesTitle'), t('ruleCheckIn'), t('ruleCheckInValue', { time: '14:00' }), t('ruleCheckOut'), t('ruleCheckOutValue', { time: '11:00' }), t('ruleSmoking'), t('smokingNo'), t('ruleParties'), t('partiesNo'),
    t('ruleCancellation'), t('cancel.moderate.rule'), t('ruleHouse'), t('whereTitle'), t('mapNote'), `4.7 · ${t('reviewsCount', { n: 3 })}`,
    t('priceFrom'), t('perNight'), t('dateCheckIn'), t('dateCheckOut'), t('guestsLabel'), t('checkPriceBtn'), t('noCharge'),
    t('contactTitle'), t('channel.viber'), t('channel.phone'), t('footer'),
  ]
}

/** Независими ръчни проверки (да не вярваме само на самия речник). */
const SPOT = {
  en: ['About this place', 'What this place offers', 'Availability', 'Check price', 'Free on-site parking', 'Powered by StayFlow'],
  mk: ['За ова место', 'Што нуди имотот', 'Достапност', 'Провери цена', 'Бесплатен паркинг на лице место', 'Изработено со StayFlow'],
  sr: ['О овом смештају', 'Шта смештај нуди', 'Доступност', 'Провери цену', 'Бесплатан паркинг на лицу места', 'Израђено уз StayFlow'],
  'sr-latn': ['O ovom smeštaju', 'Šta smeštaj nudi', 'Dostupnost', 'Proveri cenu', 'Besplatan parking na licu mesta', 'Izrađeno uz StayFlow'],
  el: ['Σχετικά με το κατάλυμα', 'Τι προσφέρει το κατάλυμα', 'Διαθεσιμότητα', 'Έλεγχος τιμής', 'Δωρεάν πάρκινγκ στον χώρο', 'Δημιουργήθηκε με StayFlow'],
  ro: ['Despre această locuință', 'Ce oferă locuința', 'Disponibilitate', 'Verifică prețul', 'Parcare gratuită în incintă', 'Realizat cu StayFlow'],
}
const BG_ONLY = ['Наличност', 'Какво предлага имотът', 'Къде ще бъдете', 'Правила на имота', 'Провери цена', 'Изпрати заявка', 'Изготвено със StayFlow']

const overflowCheck = (page) =>
  page.evaluate(() => {
    const iw = document.documentElement.clientWidth
    const wide = [...document.querySelectorAll('body *')]
      .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).position !== 'fixed' && !e.closest('.stay-photos, .stay-bar, [aria-hidden="true"]') && (r.right > iw + 1 || r.left < -1) })
      .slice(0, 4).map((e) => `${e.tagName}.${String(e.className).slice(0, 30)} ${Math.round(e.getBoundingClientRect().left)}→${Math.round(e.getBoundingClientRect().right)}`)
    return { scroll: document.documentElement.scrollWidth > iw, wide }
  })

/* ============================================================ всеки език: текстове, азбука, препълване, достъпност */
for (const { code, html, name, locale } of LANGUAGES.filter((l) => l.code !== 'bg')) {
  for (const [w, h] of [[1440, 900], [375, 812]]) {
    const { ctx, page, errors } = await open(code, w, h)
    const text = await page.evaluate(() => document.body.innerText)
    const flat = squash(text)
    const missing = expected(code).filter((s) => !flat.includes(squash(s)))
    ok(`${code} ${w}: всички текстове на страницата са на езика`, missing.length === 0, missing.slice(0, 4).join(' | '))
    const spotMissing = SPOT[code].filter((s) => !flat.includes(s))
    ok(`${code} ${w}: ръчни проверки (${SPOT[code].length} израза)`, spotMissing.length === 0, spotMissing.join(' | '))
    const lang = await page.evaluate(() => document.documentElement.lang)
    ok(`${code} ${w}: <html lang="${html}">`, lang === html, lang)
    // „Провери цена“ е еднакво на български и македонски — не е показател за остатък
    const bgOnly = BG_ONLY.filter((x) => !(code === 'mk' && x === 'Провери цена'))
    ok(`${code} ${w}: няма български интерфейсни текстове`, bgOnly.every((x) => !flat.includes(x)), bgOnly.filter((x) => flat.includes(x)).join(' | '))
    const wk = await page.evaluate(() => [...document.querySelectorAll('.stay-week')[0].children].map((e) => e.textContent.trim()))
    ok(`${code} ${w}: заглавие на календара — 7 различни дни от седмицата`, wk.length === 7 && new Set(wk).size === 7 && wk.every(Boolean), wk.join(' '))
    if (['en', 'el', 'ro', 'sr-latn'].includes(code)) {
      let rest = flat
      for (const s of [...OWNER, ...LANGUAGES.map((l) => l.name)]) rest = rest.split(squash(s)).join(' ')
      const cyr = rest.match(/[Ѐ-ӿ]+/g)
      ok(`${code} ${w}: няма кирилица освен текстовете на собственика`, !cyr, cyr?.slice(0, 5).join(' '))
    }
    const of = await overflowCheck(page)
    ok(`${code} ${w}: няма препълване встрани`, !of.scroll && of.wide.length === 0, of.wide.join(' ; '))
    ok(`${code} ${w}: без грешки в конзолата`, errors.length === 0, errors.join(' | '))
    await page.evaluate(axeSource)
    const res = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } }))
    const n = res.violations.reduce((s, v) => s + v.nodes.length, 0)
    ok(`${code} ${w}: axe — 0 нарушения`, n === 0, res.violations.map((v) => `${v.id}(${v.nodes.length}) ${v.nodes[0].target.join(' ').slice(0, 60)}`).join(' | '))
    if (w === 375) {
      const chip = await page.evaluate(() => { const r = document.querySelector('.stay-lang').getBoundingClientRect(); const s = document.querySelector('.stay-chip:not(.stay-lang)').getBoundingClientRect(); return { h: Math.round(r.height), right: Math.round(r.right), vw: innerWidth, overlap: !(r.left >= s.right || r.right <= s.left) } })
      ok(`${code} 375: чипът за език е ≥ 44 px, вътре в екрана и не лази по „Сподели“`, chip.h >= 44 && chip.right <= chip.vw && !chip.overlap, JSON.stringify(chip))
    }
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: `scripts/visual/out/lang-${code}-${w}.png` })
    await ctx.close()
  }
}

/* ============================================================ избор, запомняне, откриване */
{
  const { ctx, page } = await open(null, 1440, 900, { locale: 'en-US' })
  ok('браузър на английски, без ?lang → английски', (await page.evaluate(() => document.documentElement.lang)) === 'en' && /About this place/.test(await page.evaluate(() => document.body.innerText)))
  await page.locator('.stay-lang select').selectOption('ro')
  await page.waitForFunction(() => /Despre această locuință/.test(document.body.innerText))
  const st = await page.evaluate(() => ({ lang: document.documentElement.lang, search: location.search, stored: localStorage.getItem('stayflow.stayLang'), cur: document.querySelector('.stay-lang span').textContent }))
  ok('избор „Română“: страницата, <html lang>, адресът (?lang=ro), запомнянето и чипът се сменят', st.lang === 'ro' && st.search === '?lang=ro' && st.stored === 'ro' && st.cur === 'Română', JSON.stringify(st))
  await page.goto(`${base}/stay/tihi-bryag`, { waitUntil: 'load' })
  await page.waitForSelector('.stay-month')
  ok('отваряне пак без ?lang → помни румънски', /Despre această locuință/.test(await page.evaluate(() => document.body.innerText)))
  await page.goto(`${base}/stay/tihi-bryag?lang=mk`, { waitUntil: 'load' })
  await page.waitForSelector('.stay-month')
  ok('?lang=mk бие запомненото', /За ова место/.test(await page.evaluate(() => document.body.innerText)))
  const shared = await page.evaluate(() => { const u = new URL(location.href); return u.searchParams.get('lang') })
  ok('връзката за споделяне носи езика (?lang=mk)', shared === 'mk')
  await page.keyboard.press('Tab')
  await ctx.close()
}
for (const [loc, want, probe] of [['ro-RO', 'ro', 'Despre această locuință'], ['el-GR', 'el', 'Σχετικά με το κατάλυμα'], ['mk-MK', 'mk', 'За ова место'], ['sr-RS', 'sr-Latn', 'O ovom smeštaju'], ['sr-Cyrl-RS', 'sr', 'О овом смештају'], ['de-DE', 'en', 'About this place'], ['bg-BG', 'bg', 'За това място']]) {
  const { ctx, page } = await open(null, 1440, 900, { locale: loc })
  const got = await page.evaluate(() => ({ lang: document.documentElement.lang, text: document.body.innerText }))
  ok(`браузър ${loc} без ?lang → ${want}`, got.lang === want && got.text.includes(probe), got.lang)
  await ctx.close()
}

/* ============================================================ описанието на собственика */
{
  const note = { bg: 'Описанието е написано от собственика на български.', en: 'The host wrote this description in English.' }
  for (const [code, wantText, wantNote] of [['bg', 'Двуетажна къща на 200 метра', null], ['en', 'Two-storey house', null], ['mk', 'Two-storey house', translate('mk', 'descNoteEn')], ['ro', 'Two-storey house', translate('ro', 'descNoteEn')]]) {
    const { ctx, page } = await open(code, 1440, 900)
    const t = squash(await page.evaluate(() => document.body.innerText))
    ok(`описание (${code}): „${wantText}…“${wantNote ? ' + бележка за езика' : ', без бележка'}`, t.includes(wantText) && (wantNote ? t.includes(wantNote) : !/написано от собственика|wrote this description|Описот е напишан|Gazda a scris/.test(t)), wantNote ?? '')
    await ctx.close()
  }
  // само българско описание → английска страница показва българското и казва това
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'bg-BG' })
  const page = await ctx.newPage()
  await page.route('**/rpc/public_property', async (route) => {
    const res = await route.fetch()
    const body = await res.json()
    await route.fulfill({ response: res, json: body.map((p) => ({ ...p, public_description_en: null })) })
  })
  await page.goto(`${base}/stay/tihi-bryag?lang=en`, { waitUntil: 'load' })
  await page.waitForSelector('.stay-month')
  const t2 = squash(await page.evaluate(() => document.body.innerText))
  ok('само българско описание на английска страница: показва го + „The host wrote this description in Bulgarian.“', t2.includes('Двуетажна къща') && t2.includes('The host wrote this description in Bulgarian.'))
  await ctx.close()
  void note
}

/* ============================================================ цена, заявка, съобщения от сървъра — на румънски */
{
  const { ctx, page, errors } = await open('ro', 1440, 900)
  const t = (k, v) => translate('ro', k, v)
  const err = () => page.evaluate(() => squash(document.querySelector('.stay-booking .stay-note--error')?.textContent ?? ''))
  await page.evaluate(() => { window.squash = (s) => s.replace(/\s+/g, ' ').trim() })
  await page.getByRole('button', { name: t('checkPriceBtn') }).click()
  ok('без дати: „Alegeți data de sosire…“', (await err()) === t('errPickDates'), await err())
  await page.locator('.stay-booking input[type="date"]').nth(0).fill(plus(43))
  await page.locator('.stay-booking input[type="date"]').nth(1).fill(plus(40))
  await page.getByRole('button', { name: t('checkPriceBtn') }).click()
  ok('обратен ред на датите: „Data plecării trebuie…“', (await err()) === t('errDateOrder'), await err())
  await page.locator('.stay-booking input[type="date"]').nth(0).fill(plus(40))
  await page.locator('.stay-booking input[type="date"]').nth(1).fill(plus(43))
  await page.getByRole('button', { name: t('checkPriceBtn') }).click()
  await page.waitForSelector('.stay-quote')
  const q = squash(await page.evaluate(() => document.querySelector('.stay-quote').textContent))
  ok('цена: „Disponibil…“, „Cazare (3 nopți)“, 286.00 €, taxă, total, avans', [t('quoteOk'), t('stayLine', { nights: '3 nopți' }), '286.00 €', t('cleaningFee'), t('total'), t('deposit', { amount: '' }).trim()].every((s) => q.includes(s)), q.slice(0, 200))

  const send = page.getByRole('button', { name: t('requestBtn') })
  await send.click()
  ok('заявка без име → „Numele este obligatoriu.“', (await err()) === t('errName'), await err())
  await page.getByLabel(`${t('fieldName')} *`).fill('Ion Popescu')
  await send.click()
  ok('заявка без телефон и имейл → „Introduceți un telefon sau un e-mail…“', (await err()) === t('errContact'), await err())
  await page.locator('.stay-booking input[type="tel"]').fill('12')
  await send.click()
  ok('къс телефон → съобщение за телефон на румънски', (await err()) === t('errPhone'), await err())
  await page.locator('.stay-booking input[type="tel"]').fill('')
  await page.locator('.stay-booking input[type="email"]').fill('ion@x')
  await send.click()
  ok('имейл без домейн → съобщение за имейл на румънски', (await err()) === t('errEmail'), await err())
  await page.locator('.stay-booking input[type="email"]').fill('')
  await page.locator('.stay-booking input[type="tel"]').fill('+40 712 345 678')

  let mode = 'rate'
  await page.route('**/api/booking-request', (route) => {
    if (mode === 'rate') return route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'Твърде много заявки. Опитайте отново по-късно.' }) })
    if (mode === 'taken') return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'Тези дати вече не са свободни.' }) })
    if (mode === 'unknown') return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'Нещо съвсем ново на български.' }) })
    if (mode === 'down') return route.abort()
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })
  for (const [m, key] of [['rate', 'srv.rate'], ['taken', 'quoteTaken'], ['unknown', 'errSend'], ['down', 'errSend']]) {
    mode = m
    await send.click()
    await page.waitForTimeout(250)
    ok(`съобщение от сървъра (${m}) → на румънски`, (await err()) === t(key), await err())
  }
  mode = 'ok'
  await send.click()
  await page.waitForSelector('[role="status"]')
  const done = squash(await page.evaluate(() => document.querySelector('[role="status"]').textContent))
  ok('успех: „Solicitarea a fost trimisă“ + „Gazda vă va contacta…“', done.includes(t('sentTitle')) && done.includes(t('sentText')), done)
  ok('без грешки в конзолата (цена и заявка)', errors.length === 0, errors.join(' | '))
  await page.screenshot({ path: 'scripts/visual/out/lang-ro-booking-1440.png' })
  await ctx.close()
}

/* ============================================================ лайтбокс, брой отзиви и малки форми на сръбски/гръцки */
{
  const { ctx, page } = await open('el', 1440, 900)
  await page.locator('.stay-photo button').first().click()
  await page.waitForSelector('[role="dialog"]')
  const lb = await page.evaluate(() => ({ label: document.querySelector('[role="dialog"]').getAttribute('aria-label'), close: document.querySelector('.stay-lightbox__close').getAttribute('aria-label'), next: document.querySelector('.stay-lightbox__next').getAttribute('aria-label'), alt: document.querySelector('.stay-lightbox__img').alt }))
  ok('лайтбокс на гръцки: етикети на диалога, „Κλείσιμο“, „Επόμενη φωτογραφία“', /φωτογραφία 1 από 8/.test(lb.label) && lb.close === 'Κλείσιμο' && lb.next === 'Επόμενη φωτογραφία' && /φωτογραφία 1/.test(lb.alt), JSON.stringify(lb))
  await ctx.close()
}
{
  const { ctx, page } = await open('sr', 375, 812)
  const stars = await page.evaluate(() => document.querySelector('.stay-stars[role="img"]').getAttribute('aria-label'))
  ok('сръбски: оценката за екранен четец е на сръбски („Просечна оцена 4.7 од 5“)', stars === 'Просечна оцена 4.7 од 5', stars)
  const gal = await page.evaluate(() => ({ all: document.querySelector('.stay-gallery__all').textContent.trim(), open: document.querySelector('.stay-photo button').getAttribute('aria-label') }))
  ok('сръбски: „Све фотографије (8)“ и „Отвори фотографију 1 од 8“', gal.all === 'Све фотографије (8)' && gal.open === 'Отвори фотографију 1 од 8', JSON.stringify(gal))
  await ctx.close()
}
{
  const { ctx, page } = await open('ro', 375, 812)
  const bar = await page.evaluate(() => ({ night: document.querySelector('.stay-bar small').textContent, btn: document.querySelector('.stay-bar .stay-btn').textContent.trim() }))
  ok('румънски, лента на телефон: „pe noapte“ и „Verifică datele“', bar.night === 'pe noapte' && bar.btn === 'Verifică datele', JSON.stringify(bar))
  await ctx.close()
}

/* ============================================================ БГ остава както е; „няма снимки“ работи на всеки език; 404 */
{
  const { ctx, page } = await open('en', 1440, 900, { slug: 'bez-snimki' })
  const heads = await page.evaluate(() => [...document.querySelectorAll('.stay-sec h2, .stay-sec .stay-sub')].map((h) => h.textContent.trim()))
  ok('имот с малко попълнено, на английски: само Availability и Property rules', heads.join(' | ') === 'Entire place in Созопол | Availability | Property rules', heads.join(' | '))
  await ctx.close()
}
for (const [code, title] of [['en', 'Page not found'], ['ro', 'Pagina nu a fost găsită'], ['el', 'Η σελίδα δεν βρέθηκε'], ['bg', 'Страницата не е намерена']]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'bg-BG' })
  const page = await ctx.newPage()
  await page.goto(`${base}/stay/няма-такъв?lang=${code}`, { waitUntil: 'load' })
  await page.waitForSelector('h1')
  ok(`404 на ${code}: „${title}“`, (await page.evaluate(() => document.querySelector('h1').textContent)) === title)
  await ctx.close()
}
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'bg-BG' })
  const page = await ctx.newPage()
  await page.goto(`${base}/stay/tihi-bryag?lang=ro`, { waitUntil: 'load' })
  await page.waitForSelector('.stay-month')
  // навигация вътре в приложението (без презареждане), както когато се излезе от страницата през връзка
  await page.evaluate(() => { history.pushState({}, '', '/login'); window.dispatchEvent(new PopStateEvent('popstate')) })
  await page.waitForSelector('h1, h2')
  const l = await page.evaluate(() => document.documentElement.lang)
  ok('след излизане от публичната страница <html lang> се връща на български (приложението на собственика е на български)', l === 'bg', l)
  await ctx.close()
}

await browser.close()
console.log(`\n${pass} успешни, ${fail} провалени\n`)
process.exit(fail ? 1 : 0)
