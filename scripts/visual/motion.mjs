// Движение (стъпка 1г): проверки в реален браузър + кадри на 3 момента.
//   node scripts/visual/motion.mjs http://localhost:4174            — само проверки
//   node scripts/visual/motion.mjs http://localhost:4174 --frames   — проверки + кадри в scripts/visual/out/motion/
// Кадрите са детерминирани: всички CSS/WAAPI анимации се спират на 0 и се „превъртат“ до зададен момент.
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { USER } from './seed.mjs'

const base = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'http://localhost:4174'
const FRAMES = process.argv.includes('--frames')
const OUT = path.resolve('scripts/visual/out/motion')
mkdirSync(OUT, { recursive: true })

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

async function open({ reduced = false, hold = false, route = '/', width = 375, height = 812 } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: hold ? 2 : 1,
    isMobile: true,
    hasTouch: true,
    locale: 'bg-BG',
    timezoneId: 'Europe/Sofia',
    reducedMotion: reduced ? 'reduce' : 'no-preference',
  })
  await ctx.addInitScript((s) => {
    try {
      localStorage.setItem('sb-localhost-auth-token', JSON.stringify(s))
      localStorage.setItem('stayflow.autoSetupSeen', '1')
    } catch {}
  }, session)
  // Записва всяка анимация (име, времетраене, свойства), за да се провери „само transform и opacity“.
  await ctx.addInitScript(() => {
    window.__anims = []
    const note = (a) => {
      if (a.__n) return
      a.__n = 1
      try {
        const t = a.effect?.getTiming?.() ?? {}
        const props = new Set()
        for (const k of a.effect?.getKeyframes?.() ?? []) for (const p of Object.keys(k)) if (!['offset', 'easing', 'composite', 'computedOffset'].includes(p)) props.add(p)
        window.__anims.push({ name: a.animationName || a.transitionProperty || 'waapi', duration: Number(t.duration), delay: Number(t.delay), iterations: t.iterations, props: [...props], target: a.effect?.target?.className?.toString?.().slice(0, 40) ?? '' })
      } catch {}
    }
    new MutationObserver(() => document.getAnimations().forEach(note)).observe(document, { subtree: true, childList: true, attributes: true })
    const origAnimate = Element.prototype.animate
    Element.prototype.animate = function (...args) {
      const a = origAnimate.apply(this, args)
      note(a)
      return a
    }
  })
  if (hold) {
    await ctx.addInitScript(() => {
      window.__held = []
      const grab = () => {
        for (const a of document.getAnimations()) {
          if (a.__h) continue
          a.__h = true
          if (a.effect?.getTiming?.().iterations === Infinity) continue
          a.pause()
          a.currentTime = 0
          window.__held.push(a)
        }
      }
      new MutationObserver(grab).observe(document, { subtree: true, childList: true, attributes: true })
      window.__seek = (t) => window.__held.forEach((a) => { try { a.currentTime = t } catch {} })
      window.__release = () => window.__held.forEach((a) => { try { a.finish() } catch {} })
    })
  }
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(base + route, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  return { ctx, page, errors }
}

const settle = (page, ms = 1100) => page.waitForTimeout(ms)
const anims = (page) => page.evaluate(() => window.__anims)
const allowed = new Set(['transform', 'opacity'])

/* ============================================================ A. долна лента */
{
  const { ctx, page, errors } = await open()
  await settle(page)
  const dock = await page.evaluate(() => {
    const d = document.querySelector('.dock')
    const r = d.getBoundingClientRect()
    const bg = getComputedStyle(d).backgroundColor
    const tabs = [...d.querySelectorAll('.dock-tab')].map((t) => {
      const tr = t.getBoundingClientRect()
      const cs = getComputedStyle(t)
      return { name: t.getAttribute('aria-label'), w: tr.width, h: tr.height, cur: t.getAttribute('aria-current'), text: t.querySelector('.dock-label')?.textContent.trim() ?? '', color: cs.color }
    })
    return { gap: innerHeight - r.bottom, left: r.left, right: innerWidth - r.right, bg, tabs, badge: d.querySelector('.dock-badge')?.getAttribute('data-count') ?? null, radius: getComputedStyle(d).borderRadius }
  })
  ok('в лентата има точно 5 места: Табло · Календар · Резервации · Приходи · Още', dock.tabs.length === 5 && ['Табло', 'Календар', 'Резервации', 'Приходи'].every((n, i) => dock.tabs[i].name === n) && /^Още/.test(dock.tabs[4].name), dock.tabs.map((t) => t.name).join(' · '))
  ok('всеки бутон е ≥ 44 × 44 px', dock.tabs.every((t) => t.w >= 44 && t.h >= 44), dock.tabs.map((t) => `${Math.round(t.w)}×${Math.round(t.h)}`).join(' '))
  ok('лентата плава над долния ръб (≥ 12 px) и има поле отстрани', dock.gap >= 12 && dock.left >= 12 && dock.right >= 12, `долу ${Math.round(dock.gap)}, странично ${Math.round(dock.left)}/${Math.round(dock.right)}, радиус ${dock.radius}`)
  ok('активното място („Табло“) е с aria-current и показва име; неактивните са само икони', dock.tabs[0].cur === 'page' && dock.tabs[0].text === 'Табло' && dock.tabs.slice(1).every((t) => t.cur === null && t.text === ''), JSON.stringify(dock.tabs.map((t) => t.text)))
  ok('значката на „Още“ показва броя чакащи заявки и е в aria-label', dock.badge === '2' && /2/.test(dock.tabs[4].name), `${dock.badge} / ${dock.tabs[4].name}`)

  // контраст на иконите (≥ 3:1) спрямо фона на лентата — и на активния текст върху хапчето
  const contrast = await page.evaluate(() => {
    const rgb = (s) => s.match(/[\d.]+/g).slice(0, 3).map(Number)
    const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
    const ratio = (a, b) => { const x = lum(rgb(a)); const y = lum(rgb(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
    const dock = document.querySelector('.dock')
    const inactive = dock.querySelector('.dock-tab:not([data-active]) svg')
    const active = dock.querySelector('.dock-tab[data-active]')
    const pill = dock.querySelector('.dock-pill')
    return { icon: ratio(getComputedStyle(inactive).color, getComputedStyle(dock).backgroundColor), label: ratio(getComputedStyle(active).color, getComputedStyle(pill).backgroundColor) }
  })
  ok('иконите на неактивните места имат контраст ≥ 3:1 спрямо лентата', contrast.icon >= 3, contrast.icon.toFixed(2) + ':1')
  ok('името на активното място има контраст ≥ 4.5:1 върху хапчето', contrast.label >= 4.5, contrast.label.toFixed(2) + ':1')

  // фокус с клавиатура е видим
  await page.keyboard.press('Tab')
  const focused = await page.evaluate(() => {
    const dockTabs = [...document.querySelectorAll('.dock-tab')]
    dockTabs[1].focus()
    const cs = getComputedStyle(dockTabs[1])
    return { style: cs.outlineStyle, width: parseFloat(cs.outlineWidth), match: dockTabs[1].matches(':focus-visible') }
  })
  await page.keyboard.press('Tab')
  const focus2 = await page.evaluate(() => {
    const el = document.activeElement
    const cs = getComputedStyle(el)
    return { cls: el.className, style: cs.outlineStyle, width: parseFloat(cs.outlineWidth) }
  })
  ok('фокусът с клавиатура е видим (контур ≥ 2 px)', (focus2.style !== 'none' && focus2.width >= 2) || (focused.match && focused.style !== 'none'), `${focus2.style} ${focus2.width}px (${String(focus2.cls).slice(0, 20)})`)

  // смяна на раздел: хапчето се плъзга с transform ≤ 180 ms
  const before = await page.evaluate(() => { const r = document.querySelector('.dock-pill').getBoundingClientRect(); return { x: r.left, w: r.width } })
  await page.getByRole('link', { name: 'Календар', exact: true }).click()
  await page.waitForTimeout(60)
  const during = (await anims(page)).filter((a) => a.name === 'waapi' && a.target.includes('dock-pill'))
  ok('хапчето се анимира при смяна на раздел: 180 ms, само transform', during.length >= 1 && during.every((a) => a.duration === 180 && a.props.join() === 'transform'), JSON.stringify(during))
  await page.waitForTimeout(450)
  const after = await page.evaluate(() => {
    const pill = document.querySelector('.dock-pill').getBoundingClientRect()
    const tab = document.querySelector('.dock-tab[data-active]').getBoundingClientRect()
    return { px: pill.left, pw: pill.width, tx: tab.left, tw: tab.width, name: document.querySelector('.dock-tab[data-active]').getAttribute('aria-label'), h1: document.querySelector('h1')?.textContent }
  })
  ok('след смяната хапчето покрива точно новото място', Math.abs(after.px - after.tx) <= 1 && Math.abs(after.pw - after.tw) <= 1 && after.name === 'Календар', `${after.name}: хапче ${Math.round(after.px)}/${Math.round(after.pw)} ≈ място ${Math.round(after.tx)}/${Math.round(after.tw)}; преди ${Math.round(before.x)}/${Math.round(before.w)}`)
  const pageAnims = (await anims(page)).filter((a) => a.name === 'page-in')
  ok('екранът влиза с page-in ≤ 200 ms', pageAnims.length >= 1 && pageAnims.every((a) => a.duration <= 200 && a.props.every((p) => allowed.has(p))), JSON.stringify(pageAnims.slice(-1)))
  ok('без грешки в конзолата', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

/* ============================================================ B. лист „Още“ */
{
  const { ctx, page } = await open()
  await settle(page)
  const opener = page.getByRole('button', { name: /^Още/ })
  await opener.click()
  await page.waitForSelector('[role="dialog"]')
  await page.waitForTimeout(420)
  const open1 = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]')
    const r = d.getBoundingClientRect()
    const links = [...d.querySelectorAll('a')].map((a) => ({ t: a.textContent.trim(), h: a.getBoundingClientRect().height }))
    const close = [...d.querySelectorAll('button')].map((b) => ({ n: b.getAttribute('aria-label') || b.textContent.trim(), h: b.getBoundingClientRect().height, w: b.getBoundingClientRect().width }))
    return { modal: d.getAttribute('aria-modal'), title: document.getElementById(d.getAttribute('aria-labelledby'))?.textContent, bottom: Math.round(r.bottom), vh: innerHeight, links, close, focusInside: d.contains(document.activeElement) || document.activeElement === d, overflow: document.body.style.overflow }
  })
  ok('„Още“ е диалог (role=dialog, aria-modal, заглавие „Още“), долен лист', open1.modal === 'true' && open1.title === 'Още' && open1.bottom === open1.vh, `дъно ${open1.bottom}/${open1.vh}`)
  ok('съдържа Заявки (с брояч), Имоти, Известия, Правила', ['Заявки', 'Имоти', 'Известия', 'Правила'].every((n) => open1.links.some((l) => l.t.startsWith(n))) && open1.links.some((l) => /^Заявки\s*2$/.test(l.t.replace(/\s+/g, ' ').replace('чакащи: ', ''))), open1.links.slice(0, 5).map((l) => l.t).join(' | '))
  ok('всички връзки и бутони в листа са ≥ 44 px високи', open1.links.every((l) => l.h >= 44) && open1.close.every((b) => b.h >= 44), `най-ниска връзка ${Math.round(Math.min(...open1.links.map((l) => l.h)))}`)
  ok('фокусът влиза в листа и страницата отзад не скролира', open1.focusInside && open1.overflow === 'hidden')
  const enter = (await anims(page)).filter((a) => a.name === 'sheet-in' || a.name === 'modal-fade')
  ok('листът влиза с плъзгане 280 ms (само transform), сенчестият слой — с opacity', enter.some((a) => a.name === 'sheet-in' && a.duration === 280 && a.props.join() === 'transform') && enter.some((a) => a.name === 'modal-fade' && a.props.join() === 'opacity'), JSON.stringify(enter))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(60)
  const closing = await page.evaluate(() => ({ state: document.querySelector('.modal-root')?.getAttribute('data-state'), inert: document.querySelector('.modal-root')?.hasAttribute('inert') }))
  const exit = (await anims(page)).filter((a) => a.name === 'sheet-out')
  ok('при затваряне листът излиза (data-state=closing, inert) с 180 ms ease-in, само transform', closing.state === 'closing' && closing.inert && exit.length === 1 && exit[0].duration === 180 && exit[0].props.join() === 'transform', JSON.stringify(exit))
  await page.waitForTimeout(350)
  const gone = await page.evaluate(() => ({ dialog: !!document.querySelector('[role="dialog"]'), activeLabel: document.activeElement?.getAttribute('aria-label') }))
  ok('след изхода листът е махнат и фокусът се връща на „Още“', !gone.dialog && /^Още/.test(gone.activeLabel ?? ''), gone.activeLabel)
  await ctx.close()
}

/* ============================================================ C. каскада и брояч (първо зареждане) */
{
  const { ctx, page } = await open({ route: '/earnings' })
  await page.waitForSelector('[role="img"][aria-label^="Печалба"]', { timeout: 8000 })
  // следим числото на „Печалба“ от момента, в който се появи
  const timeline = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const el = document.querySelector('[role="img"][aria-label^="Печалба"] span[aria-hidden="true"]')
        const t0 = performance.now()
        const seen = []
        const tick = () => {
          const t = performance.now() - t0
          const txt = el.textContent
          if (!seen.length || seen[seen.length - 1].txt !== txt) seen.push({ t: Math.round(t), txt })
          if (t < 900) requestAnimationFrame(tick)
          else resolve(seen)
        }
        tick()
      })
  )
  const final = Number((await page.getAttribute('[role="img"][aria-label^="Печалба"]', 'aria-label')).match(/(-?\d+)\./)?.[1])
  const nums = timeline.map((s) => Number(s.txt))
  const last = timeline[timeline.length - 1]
  ok('„Печалба“ се брои нагоре отначало: започва от по-малко от крайното и расте', nums[0] < final && nums.every((v, i) => i === 0 || v >= nums[i - 1]), `${timeline.length} стойности: ${nums.slice(0, 3).join('→')}…${nums[nums.length - 1]}`)
  ok('стига до крайната стойност за ≤ 600 ms', Number(last.txt) === final && last.t <= 650, `краят е ${last.txt} на ${last.t} ms (крайно ${final})`)
  const rises = await page.evaluate(() => [...document.querySelectorAll('[data-rise]')].map((e) => Number(e.getAttribute('data-rise'))))
  const risesA = (await anims(page)).filter((a) => a.name === 'rise-in')
  ok('каскадата засяга ≤ 8 елемента със стъпка ≤ 40 ms (32 ms), 180 ms, само opacity/transform', rises.length > 0 && rises.length <= 8 && rises.every((n) => n <= 7) && risesA.every((a) => a.duration === 180 && a.props.every((p) => allowed.has(p))) && Math.max(...risesA.map((a) => a.delay)) <= 224, `${rises.length} елемента; закъснение до ${Math.max(...risesA.map((a) => a.delay))} ms`)
  const grow = (await anims(page)).filter((a) => a.name === 'grow-y')
  ok('графиката расте веднъж: 280 ms, само transform', grow.length > 0 && grow.every((a) => a.duration === 280 && a.props.join() === 'transform'), `${grow.length} стълба`)

  // втори път (навигация в приложението): без брояч, без каскада, без растеж
  await page.getByRole('link', { name: 'Табло', exact: true }).click()
  await page.waitForTimeout(700)
  await page.getByRole('link', { name: 'Приходи', exact: true }).click()
  await page.waitForSelector('[role="img"][aria-label^="Печалба"]')
  const second = await page.evaluate(() => ({
    txt: document.querySelector('[role="img"][aria-label^="Печалба"] span[aria-hidden="true"]').textContent,
    rise: document.querySelectorAll('[data-rise]').length,
    grow: document.querySelectorAll('.grow-y').length,
  }))
  ok('второто отваряне е без повторение: числото е крайно веднага, няма каскада и растеж', Number(second.txt) === final && second.rise === 0 && second.grow === 0, JSON.stringify(second))
  await ctx.close()
}

/* ============================================================ D. намалено движение */
{
  const { ctx, page } = await open({ reduced: true, route: '/earnings' })
  await page.waitForSelector('[role="img"][aria-label^="Печалба"]', { timeout: 8000 })
  const first = await page.evaluate(() => document.querySelector('[role="img"][aria-label^="Печалба"] span[aria-hidden="true"]').textContent)
  const final = Number((await page.getAttribute('[role="img"][aria-label^="Печалба"]', 'aria-label')).match(/(-?\d+)\./)?.[1])
  ok('при „намалено движение“ числото е крайно веднага (без броене)', Number(first) === final, `${first} / ${final}`)
  const tt = await page.evaluate(() => {
    const out = []
    for (const a of document.getAnimations()) {
      const t = a.effect.getTiming()
      if (t.iterations !== Infinity && Number(t.duration) > 1) out.push(`${a.animationName}:${t.duration}`)
    }
    return out
  })
  ok('при „намалено движение“ няма анимации с видимо времетраене (всяка е ≤ 1 ms)', tt.length === 0, tt.join(', '))
  await page.getByRole('link', { name: 'Календар', exact: true }).click()
  await page.waitForTimeout(80)
  const pillAnim = await page.evaluate(() => document.querySelector('.dock-pill').getAnimations().length)
  const pillPos = await page.evaluate(() => { const p = document.querySelector('.dock-pill').getBoundingClientRect(); const t = document.querySelector('.dock-tab[data-active]').getBoundingClientRect(); return Math.abs(p.left - t.left) <= 1 && Math.abs(p.width - t.width) <= 1 })
  ok('при „намалено движение“ хапчето се мести веднага (без анимация)', pillAnim === 0 && pillPos, `анимации ${pillAnim}, позиция ${pillPos}`)
  await page.getByRole('button', { name: /^Още/ }).click()
  await page.waitForSelector('[role="dialog"]')
  const panel = await page.evaluate(() => { const r = document.querySelector('.modal-panel').getBoundingClientRect(); return Math.round(innerHeight - r.bottom) })
  ok('при „намалено движение“ листът е веднага на мястото си', panel === 0, `разстояние до дъното ${panel}`)
  await ctx.close()
}

/* ============================================================ E. натискане и тих скелет */
{
  const { ctx, page } = await open({ route: '/bookings' })
  await settle(page)
  const btn = page.getByRole('button', { name: 'Нова резервация' }).first()
  const box = await btn.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(260)
  const scale = await btn.evaluate((el) => getComputedStyle(el).transform)
  await page.mouse.up()
  const m = scale.match(/matrix\(([^,]+),/)
  ok('бутонът се натиска: scale 0.98', m && Math.abs(Number(m[1]) - 0.98) < 0.005, scale)
  const skeleton = await page.evaluate(() => {
    for (const sheet of document.styleSheets) {
      let rules
      try { rules = sheet.cssRules } catch { continue }
      for (const r of rules) {
        const walk = (rule) => {
          if (rule.type === CSSRule.KEYFRAMES_RULE && rule.name === 'skeleton-pulse') return [...rule.cssRules].flatMap((k) => [...k.style]).filter((v, i, a) => a.indexOf(v) === i)
          if (rule.cssRules) for (const c of rule.cssRules) { const x = walk(c); if (x) return x }
          return null
        }
        const x = walk(r)
        if (x) return { props: x }
      }
    }
    return null
  })
  ok('скелетът е тих: пулсира само с opacity (без блясък/преместване)', skeleton && skeleton.props.join() === 'opacity', JSON.stringify(skeleton))
  await ctx.close()
}

/* ============================================================ F. всички анимации ползват само transform/opacity */
{
  const { ctx, page } = await open({ route: '/' })
  await settle(page, 700)
  await page.getByRole('link', { name: 'Резервации', exact: true }).click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: /^Още/ }).click()
  await page.waitForTimeout(400)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  const list = (await anims(page)).filter((a) => a.iterations !== Infinity && !/^(background|color|border|box-shadow|outline|fill|stroke)/.test(a.name))
  const bad = list.filter((a) => a.props.some((p) => !allowed.has(p)))
  const long = list.filter((a) => a.duration > 280)
  ok('всички анимации на екрани, лента и лист са само transform/opacity', bad.length === 0, bad.map((a) => `${a.name}:${a.props}`).join(' | ') || `${list.length} анимации`)
  ok('нито една не е по-дълга от 280 ms', long.length === 0, long.map((a) => `${a.name}:${a.duration}`).join(' | '))
  await ctx.close()
}

/* ============================================================ кадри */
if (FRAMES) {
  const shots = {}
  const save = async (page, name, clip) => {
    const file = path.join(OUT, name + '.png')
    await page.screenshot({ path: file, clip })
    return file
  }
  const strip = async (name, title, items, w, h) => {
    const html = `<style>*{box-sizing:border-box;margin:0}body{background:#2b2118;padding:14px 14px 10px;font:13px system-ui;color:#f6efe3}
      h2{font:600 15px system-ui;margin-bottom:10px}.row{display:flex;gap:12px;align-items:flex-start}figure{flex:none}
      img{display:block;width:${w}px;height:${h}px;object-fit:cover;object-position:top;border-radius:12px;box-shadow:0 0 0 1px #ffffff26}figcaption{margin-top:6px;text-align:center;color:#e6dbc8}</style>
      <h2>${title}</h2><div class="row">${items.map(([f, cap]) => `<figure><img src="${pathToFileURL(f).href}"><figcaption>${cap}</figcaption></figure>`).join('')}</div>`
    const htmlFile = path.join(OUT, name + '.html')
    writeFileSync(htmlFile, html)
    const p = await browser.newPage({ viewport: { width: items.length * (w + 12) + 16, height: h + 70 }, deviceScaleFactor: 1 })
    await p.goto(pathToFileURL(htmlFile).href)
    await p.waitForTimeout(250)
    await p.screenshot({ path: path.join(OUT, name + '.png') })
    await p.close()
  }

  // 1. брояч „Печалба“ (реално време) — серия кадри
  {
    // кадрите са от живо зареждане (без задържане) на висок екран, за да не пречи лентата
    const fresh = await open({ route: '/earnings', height: 1100 })
    await fresh.page.waitForSelector('[role="img"][aria-label^="Печалба"]', { timeout: 8000 })
    const hero = await fresh.page.locator('section[aria-label="Печалба"]').boundingBox()
    const clip = { x: 0, y: Math.max(0, hero.y - 6), width: 375, height: 205 }
    const frames = []
    const t0 = Date.now()
    for (let i = 0; i < 7; i++) {
      const txt = await fresh.page.evaluate(() => document.querySelector('[role="img"][aria-label^="Печалба"] span[aria-hidden="true"]').textContent)
      const f = await save(fresh.page, `count-${i}`, clip)
      frames.push([f, `${txt} € · +${Date.now() - t0} ms`])
      await fresh.page.waitForTimeout(40)
    }
    await strip('motion-1-broyach', '1 · „Печалба“ се брои нагоре веднъж (≤ 600 ms), после стои', frames.slice(0, 5), 280, 153)
    shots.count = frames.map((f) => f[1])
    await fresh.ctx.close()
  }

  // 2. каскада на Табло (задържани анимации → точни моменти)
  {
    const { ctx, page } = await open({ route: '/', hold: true })
    await page.waitForSelector('[data-rise]', { timeout: 8000 })
    const items = []
    for (const t of [0, 60, 120, 200, 400]) {
      await page.evaluate((x) => window.__seek(x), t)
      await page.waitForTimeout(60)
      items.push([await save(page, `rise-${t}`), `${t} ms`])
    }
    await strip('motion-2-kaskada', '2 · Карти и редове се появяват меко (първите ~8, стъпка 32 ms)', items, 188, 406)
    await ctx.close()
  }

  // 3. долна лента: смяна на раздел + лист „Още“
  {
    const { ctx, page } = await open({ route: '/', hold: true })
    await page.waitForSelector('.dock-pill[data-ready]')
    await page.evaluate(() => window.__release())
    await page.waitForTimeout(200)
    await page.getByRole('link', { name: 'Резервации', exact: true }).click()
    const clipDock = { x: 0, y: 812 - 100, width: 375, height: 100 }
    const items = []
    for (const t of [0, 45, 90, 135, 180]) {
      await page.evaluate((x) => window.__seek(x), t)
      await page.waitForTimeout(40)
      items.push([await save(page, `dock-${t}`, clipDock), `${t} ms`])
    }
    await strip('motion-3-lenta', '3 · Хапчето се плъзга и сменя ширина (Табло → Резервации, 180 ms)', items, 280, 75)
    await page.evaluate(() => window.__release())
    await page.waitForTimeout(300)
    await page.getByRole('button', { name: /^Още/ }).click()
    const sheet = []
    for (const t of [0, 90, 180, 280]) {
      await page.evaluate((x) => window.__seek(x), t)
      await page.waitForTimeout(40)
      sheet.push([await save(page, `sheet-${t}`), `${t} ms`])
    }
    await strip('motion-3b-list', '3б · Листът „Още“ се плъзга отдолу (280 ms)', sheet, 188, 406)
    await ctx.close()
  }

  // 4. графиката расте
  {
    const { ctx, page } = await open({ route: '/earnings', hold: true })
    await page.waitForSelector('.grow-y', { state: 'attached', timeout: 8000 })
    await page.locator('svg[aria-label^="Приходи по месеци"]').scrollIntoViewIfNeeded()
    const card = await page.locator('svg[aria-label^="Приходи по месеци"]').boundingBox()
    const clip = { x: 8, y: card.y - 8, width: 359, height: card.height + 16 }
    const items = []
    for (const t of [0, 90, 180, 320, 520]) {
      await page.evaluate((x) => window.__seek(x), t)
      await page.waitForTimeout(40)
      items.push([await save(page, `chart-${t}`, clip), `${t} ms`])
    }
    await strip('motion-4-grafika', '4 · Графиката расте веднъж от основата (280 ms)', items, 220, Math.round(clip.height * (220 / clip.width)))
    await ctx.close()
  }
  console.log('кадри: ' + OUT)
}

await browser.close()
console.log(`\n${pass} успешни, ${fail} провалени\n`)
process.exit(fail ? 1 : 0)
