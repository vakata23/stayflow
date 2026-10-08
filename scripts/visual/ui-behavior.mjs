// Поведение на общите компоненти в реален браузър (витрината /design).
//   node harness/ui-behavior.mjs <base>
import { chromium } from 'playwright'

const base = process.argv[2] || 'http://localhost:4174'
const COARSE = ['--blink-settings=primaryPointerType=2,availablePointerTypes=2,primaryHoverType=1,availableHoverTypes=1']
let pass = 0
let fail = 0
const ok = (name, cond, extra = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`)
}

async function suite(label, vp, args = [], ctxOpts = {}) {
  const browser = await chromium.launch({ channel: 'chrome', args })
  const ctx = await browser.newContext({ ...vp, viewport: { width: vp.width, height: vp.height }, locale: 'bg-BG', ...ctxOpts })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${base}/design`, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(800)
  const L = (s) => `${label}: ${s}`

  // ---- прозорец
  const opener = page.getByRole('button', { name: 'Отвори прозорец' })
  await opener.scrollIntoViewIfNeeded()
  await opener.click()
  await page.waitForSelector('[role="dialog"]')
  await page.waitForTimeout(350)
  const dlg = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]')
    const r = d.getBoundingClientRect()
    const title = document.getElementById(d.getAttribute('aria-labelledby'))?.textContent
    return { modal: d.getAttribute('aria-modal'), title, inside: d.contains(document.activeElement) || document.activeElement === d, overflow: document.body.style.overflow, bottom: Math.round(r.bottom), width: Math.round(r.width), left: Math.round(r.left), vh: innerHeight, vw: innerWidth, desc: !!document.getElementById(d.getAttribute('aria-describedby') || '__')?.textContent }
  })
  ok(L('прозорецът е role=dialog, aria-modal, със заглавие за екранен четец'), dlg.modal === 'true' && dlg.title === 'Изтриване на запис', dlg.title)
  ok(L('фокусът влиза в прозореца и страницата отзад не скролира'), dlg.inside && dlg.overflow === 'hidden')
  ok(L('има описание за екранен четец (aria-describedby)'), dlg.desc)
  if (vp.width < 640) ok(L('на телефон е долен лист (долу, на цялата ширина)'), Math.abs(dlg.bottom - dlg.vh) <= 1 && dlg.width === dlg.vw, `${dlg.width}×bottom ${dlg.bottom}/${dlg.vh}`)
  else ok(L('на голям екран е центриран'), Math.abs(dlg.left * 2 + dlg.width - dlg.vw) <= 2, `left ${dlg.left}, ширина ${dlg.width}`)

  let leaked = 0
  for (let i = 0; i < 9; i++) {
    await page.keyboard.press(i % 2 ? 'Tab' : 'Shift+Tab')
    if (!(await page.evaluate(() => document.querySelector('[role="dialog"]').contains(document.activeElement)))) leaked++
  }
  ok(L('Tab/Shift+Tab не изкарват фокуса извън прозореца (9 натискания)'), leaked === 0, `изтекли: ${leaked}`)

  await page.keyboard.press('Escape')
  await page.waitForTimeout(150)
  const after = await page.evaluate(() => ({ open: !!document.querySelector('[role="dialog"]'), overflow: document.body.style.overflow, active: document.activeElement?.textContent?.trim() }))
  ok(L('Esc затваря прозореца и връща скрола'), !after.open && after.overflow !== 'hidden')
  ok(L('фокусът се връща на бутона, който го е отворил'), /Отвори прозорец/.test(after.active || ''), after.active)

  await opener.click()
  await page.waitForSelector('[role="dialog"]')
  await page.mouse.click(vp.width < 640 ? 187 : 30, 40) // върху фона зад прозореца
  await page.waitForTimeout(150)
  ok(L('клик върху фона затваря прозореца'), (await page.locator('[role="dialog"]').count()) === 0)

  // ---- бутони: натискане и фокус
  const btn = page.getByRole('button', { name: 'Запази', exact: true }).first()
  await btn.scrollIntoViewIfNeeded()
  const box = await btn.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(220)
  const pressed = await btn.evaluate((el) => getComputedStyle(el).transform)
  await page.mouse.up()
  ok(L('основният бутон се свива при натискане (scale 0.98)'), /matrix\(0\.98/.test(pressed), pressed)
  await page.mouse.move(0, 0)

  await page.keyboard.press('Tab')
  await page.evaluate(() => document.querySelector('.btn').focus())
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  const ring = await page.evaluate(() => { const cs = getComputedStyle(document.activeElement); return { w: cs.outlineWidth, s: cs.outlineStyle } })
  ok(L('при фокус от клавиатура има видим контур 2 px'), ring.w === '2px' && ring.s === 'solid', `${ring.w} ${ring.s}`)

  // ---- полета
  const inp = await page.evaluate(() => {
    const el = document.querySelector('.control')
    const cs = getComputedStyle(el)
    const bad = document.querySelector('.control[aria-invalid="true"]')
    return { fs: cs.fontSize, h: Math.round(el.getBoundingClientRect().height), badBorder: getComputedStyle(bad).borderTopColor, alert: !!document.querySelector('.field-error[role="alert"]') }
  })
  ok(L('текстът в полетата е 16 px (iOS не увеличава)'), inp.fs === '16px', inp.fs)
  ok(L('полето е ≥ 44 px високо'), inp.h >= 44, `${inp.h} px`)
  ok(L('невалидно поле: червена граница + грешка с role=alert'), /rgb\(193, 42, 31\)/.test(inp.badBorder) && inp.alert, inp.badBorder)

  // ---- превключвател без „отметка“
  const sw = await page.evaluate(() => { const i = document.querySelector('.switch input'); return { checked: i.checked, after: getComputedStyle(i, '::after').content } })
  ok(L('превключвателят няма отметка върху плъзгача'), sw.checked && (sw.after === 'none' || sw.after === 'normal'), sw.after)

  // ---- размери за пръст
  const sizes = await page.evaluate(() => {
    const pick = (sel) => [...document.querySelectorAll(sel)].filter((e) => e.offsetParent !== null).map((e) => e.offsetHeight)
    return { btn: Math.min(...pick('.btn')), icon: Math.min(...pick('.icon-btn')), check: Math.min(...pick('.check')), seg: Math.min(...pick('.segmented button')) }
  })
  if (vp.width < 640) ok(L('на тъч всички бутони, иконни бутони, отметки и сегменти са ≥ 44 px'), Math.min(sizes.btn, sizes.icon, sizes.check, sizes.seg) >= 44, JSON.stringify(sizes))
  else ok(L('с мишка: основните ≥ 44 px, а малките (sm/сегменти) ≥ 36 px'), sizes.icon >= 44 && sizes.check >= 44 && sizes.btn >= 36 && sizes.seg >= 36, JSON.stringify(sizes))

  // ---- хоризонтално препълване и грешки
  const sw2 = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
  ok(L('няма хоризонтално препълване'), sw2)
  ok(L('няма грешки в конзолата'), errors.length === 0, errors.join(' | '))
  await browser.close()
}

await suite('375 тъч', { width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, COARSE)
await suite('1440 мишка', { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false })

// ---- намалено движение
{
  const browser = await chromium.launch({ channel: 'chrome' })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  await page.goto(`${base}/design`, { waitUntil: 'load' })
  await page.waitForTimeout(600)
  const d = await page.evaluate(() => {
    const b = getComputedStyle(document.querySelector('.btn'))
    return { dur: b.transitionDuration, spin: getComputedStyle(document.querySelector('.animate-spin')).animationDuration }
  })
  ok('намалено движение: преходите на бутона са изключени', parseFloat(d.dur) <= 0.001, d.dur)
  ok('намалено движение: въртящият се индикатор само забавя ход (не изчезва)', parseFloat(d.spin) >= 1, d.spin)
  await browser.close()
}

console.log(`\n${pass} успешни, ${fail} провалени\n`)
process.exit(fail ? 1 : 0)
