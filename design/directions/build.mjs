// Генератор на макетите за трите посоки.
//   node design/directions/build.mjs
// Един и същ HTML (структура + данни от scripts/visual/seed.mjs) за трите посоки; различава се само
// CSS-ът (css/shared.css + css/a|b|c.css) — така сравнението е честно. Иконите са от lucide-react.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as L from 'lucide-react'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TABLES, RPC, TODAY } from '../../scripts/visual/seed.mjs'
import { DIRECTIONS } from './palettes.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const OUT = join(here, 'out')
mkdirSync(OUT, { recursive: true })

/* ------------------------------------------------------------------ помощници */
const icon = (name, size = 18, stroke = 1.75) => renderToStaticMarkup(createElement(L[name], { size, strokeWidth: stroke, 'aria-hidden': true }))
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const NB = ' '
const group = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, NB)
const money = (n, d = 2) => `${n < 0 ? '−' : ''}${group(Math.trunc(Math.abs(n)))},${Math.abs(n).toFixed(d).split('.')[1]}${NB}€`
const moneyParts = (n) => {
  const [i, f] = Math.abs(n).toFixed(2).split('.')
  return { int: `${n < 0 ? '−' : ''}${group(i)}`, dec: `,${f}`, cur: '€' }
}
const dt = (iso, opt) => new Intl.DateTimeFormat('bg-BG', { timeZone: 'UTC', ...opt }).format(new Date(iso + 'T00:00:00Z'))
const dShort = (iso) => dt(iso, { day: '2-digit', month: '2-digit' })
const dFull = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`
const addDays = (iso, n) => {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const nights = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000)
const initials = (name) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
const SRC = { airbnb: 'Airbnb', booking: 'Booking.com', direct: 'Директна', manual: 'Ръчно' }
const STATUS = { confirmed: ['Потвърдена', 'ok'], pending: ['Чакаща', 'wait'], cancelled: ['Отказана', 'off'] }
const prop = Object.fromEntries(TABLES.properties.map((p) => [p.id, p]))
const short = (p) => prop[p].name

/* ------------------------------------------------------------------ данни */
const live = TABLES.bookings.filter((b) => b.status !== 'cancelled')
const arriving = live.filter((b) => b.check_in === TODAY)
const leaving = live.filter((b) => b.check_out === TODAY)
const inHouse = live.filter((b) => b.check_in < TODAY && b.check_out > TODAY)
const stayNow = [...arriving, ...inHouse]
const pendingReqs = TABLES.booking_requests.filter((r) => r.status === 'pending')
const horizon = addDays(TODAY, 14)
const events = []
for (const b of live) {
  if (b.check_in > TODAY && b.check_in <= horizon) events.push({ date: b.check_in, kind: 'in', b })
  if (b.check_out >= TODAY && b.check_out <= horizon) events.push({ date: b.check_out, kind: 'out', b })
}
events.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : x.kind === 'out' ? -1 : 1))
const byDay = events.reduce((m, e) => ((m[e.date] ??= []).push(e), m), {})

const month1 = TODAY.slice(0, 8) + '01'
const monthEnd = dt(addDays(month1.slice(0, 7) + '-28', 4), { day: '2-digit' }) // не се ползва; изчисляваме отдолу
const lastDay = new Date(Date.UTC(+TODAY.slice(0, 4), +TODAY.slice(5, 7), 0)).getUTCDate()
const E = RPC.earnings_by_month({ p_from: month1, p_to: `${TODAY.slice(0, 8)}${String(lastDay).padStart(2, '0')}` })[0]
const EP = RPC.earnings_by_property({ p_from: month1, p_to: `${TODAY.slice(0, 8)}${String(lastDay).padStart(2, '0')}` })
// 12 месеца (синтетични, за външния вид на графиката): [директни, платформи]
const MONTHS = ['ное', 'дек', 'яну', 'фев', 'мар', 'апр', 'май', 'юни', 'юли', 'авг', 'сеп', 'окт']
const SERIES = [[420, 380], [880, 520], [310, 240], [260, 180], [520, 410], [740, 620], [1180, 960], [1960, 1340], [2860, 1790], [3240, 2210], [2380, 1520], [1690, 1715]]

/* ------------------------------------------------------------------ навигация */
const NAV = [
  ['dashboard', 'Табло', 'LayoutDashboard'],
  ['earnings', 'Приходи', 'TrendingUp'],
  ['calendar', 'Календар', 'CalendarDays'],
  ['bookings', 'Резервации', 'BookMarked'],
  ['requests', 'Заявки', 'Inbox', pendingReqs.length],
  ['cleaning', 'Почистване', 'ClipboardCheck'],
  ['pricing', 'Цени', 'BadgePercent'],
  ['cards', 'Адресни карти', 'MapPin'],
  ['codes', 'Кодове за достъп', 'KeyRound'],
  ['invoices', 'Фактури', 'FileText'],
]
const NAV2 = [
  ['properties', 'Имоти', 'Building2'],
  ['notifications', 'Известия', 'Bell'],
]
const TABS = [
  ['dashboard', 'Табло', 'LayoutDashboard'],
  ['calendar', 'Календар', 'CalendarDays'],
  ['bookings', 'Резервации', 'BookMarked'],
  ['earnings', 'Приходи', 'TrendingUp'],
  ['more', 'Още', 'Ellipsis'],
]
const item = ([id, label, ic, n], active) =>
  `<a class="item${id === active ? ' is-active' : ''}" href="#"><span class="ico">${icon(ic, 18)}</span><span class="lbl">${label}</span>${n ? `<em class="n">${n}</em>` : ''}</a>`

function shell(dirKey, screen, title, body) {
  const tabsActive = screen
  return `<div class="shell">
  <aside class="side">
    <div class="brand"><span class="mark">${icon('Waves', 20, 2)}</span><span class="word">StayFlow</span></div>
    <nav class="menu" aria-label="Основно меню">
      <p class="grp">Управление</p>
      ${NAV.map((n) => item(n, screen)).join('\n      ')}
      <p class="grp">Настройки</p>
      ${NAV2.map((n) => item(n, screen)).join('\n      ')}
    </nav>
    <div class="me"><span class="av">ИП</span><span class="who"><b>Иван Петров</b><small>Морски имоти ЕООД</small></span></div>
  </aside>
  <div class="main">
    <header class="bar">
      <span class="bar-t">${esc(title)}</span>
      <span class="bar-s">${icon('Search', 18)}<span class="hint">Търси резервация, гост, имот…</span><kbd>⌘K</kbd></span>
      <span class="bar-r"><span class="bell">${icon('Bell', 18)}</span><span class="av">ИП</span></span>
    </header>
    <main class="page">
${body}
    </main>
  </div>
  <nav class="tabs" aria-label="Долна навигация">
    ${TABS.map(([id, label, ic]) => `<a class="tab${id === tabsActive ? ' is-active' : ''}" href="#"><span class="ti">${icon(ic, 22)}</span><span class="tl">${label}</span></a>`).join('\n    ')}
  </nav>
</div>`
}

/* ------------------------------------------------------------------ екрани */
const tag = (src) => `<span class="tag src-${src}"><i></i>${SRC[src]}</span>`
const head = (eyebrow, h1, lede, actions = '') =>
  `<header class="head"><div class="head-t"><p class="eyebrow">${eyebrow}</p><h1>${h1}</h1><p class="lede">${lede}</p></div><div class="actions">${actions}</div></header>`
const btn = (txt, ic, kind = 'primary') => `<a class="btn btn-${kind}" href="#">${ic ? icon(ic, 18, 2) : ''}<span>${txt}</span></a>`

function dashboard() {
  const dateLine0 = dt(TODAY, { weekday: 'long', day: 'numeric', month: 'long' })
  const dateLine = dateLine0.charAt(0).toUpperCase() + dateLine0.slice(1)
  const kpis = [
    ['Пристигат днес', arriving.length, arriving[0] ? `${esc(arriving[0].guest_name)} · ${prop[arriving[0].property_id].checkin_time}` : 'няма'],
    ['Напускат днес', leaving.length, leaving[0] ? esc(leaving[0].guest_name) : 'няма'],
    ['Настанени сега', stayNow.length, `${new Set(stayNow.map((b) => b.property_id)).size} от ${TABLES.properties.length} имота`],
    ['Нови заявки', pendingReqs.length, 'чакат отговор'],
  ]
  const stays = stayNow
    .map((b) => {
      const total = nights(b.check_in, b.check_out)
      const done = Math.max(0, Math.min(total, nights(b.check_in, TODAY)))
      const isToday = b.check_in === TODAY
      return `<article class="stay${isToday ? ' is-today' : ''}">
        <span class="av av-g">${initials(b.guest_name)}</span>
        <div class="stay-w"><b>${esc(b.guest_name)}</b><small>${esc(short(b.property_id))}</small></div>
        <div class="stay-s">${isToday ? `${icon('LogIn', 16, 2)} Пристига днес · ${prop[b.property_id].checkin_time}` : `${icon('Moon', 16, 2)} Настанен · до ${dShort(b.check_out)}`}</div>
        <div class="bar-p" aria-label="${done} от ${total} нощувки"><i style="width:${Math.round((done / total) * 100)}%"></i></div>
        ${tag(b.source)}
      </article>`
    })
    .join('\n')
  const days = Object.entries(byDay)
    .map(([d, evs]) => {
      const dd = dt(d, { day: 'numeric' })
      const wd = dt(d, { weekday: 'long' })
      const mm = dt(d, { month: 'long' })
      return `<div class="day"><h3 class="day-h"><b>${dd}</b><span>${wd}<small>${mm}</small></span></h3><ul class="evs">
      ${evs
        .map(
          (e) => `<li class="ev ev-${e.kind}"><span class="ev-i">${icon(e.kind === 'in' ? 'LogIn' : 'LogOut', 16, 2)}</span><span class="ev-n"><b>${esc(e.b.guest_name)}</b><small>${esc(short(e.b.property_id))}</small></span><span class="ev-k">${e.kind === 'in' ? 'Настаняване' : 'Напускане'}</span>${tag(e.b.source)}</li>`
        )
        .join('\n      ')}
      </ul></div>`
    })
    .join('\n')
  return head(esc(dateLine), 'Табло', 'Какво се случва в имотите днес и през следващите 14 дни.', btn('Нова резервация', 'Plus')) +
    `<section class="kpis">${kpis.map(([l, n, s]) => `<div class="kpi"><span class="kpi-l">${l}</span><b class="kpi-n">${n}</b><span class="kpi-s">${s}</span></div>`).join('')}</section>
    <section class="panel now"><div class="panel-h"><h2>Сега в имотите</h2><span class="count">${stayNow.length}</span></div><div class="stays">${stays}</div></section>
    <section class="panel soon"><div class="panel-h"><h2>Следващите 14 дни</h2><span class="count">${events.length}</span></div><div class="timeline">${days}</div></section>`
}

function bookings() {
  const rows = TABLES.bookings.slice().sort((a, b) => (a.check_in < b.check_in ? 1 : -1)).slice(0, 9)
  const incomplete = TABLES.bookings.filter((b) => ['airbnb', 'booking'].includes(b.source) && b.status !== 'cancelled' && (!b.total_price || !b.commission)).length || 8
  return head('Всички резервации', 'Резервации', 'Филтри, сортиране и бързо редактиране.', btn('Нова резервация', 'Plus')) +
    `<div class="note">${icon('TriangleAlert', 18, 2)}<p><b>${incomplete} резервации</b> от платформи чакат цена и комисиона — иначе приходите ще се смятат грешно.</p><a href="#">Покажи само тях</a></div>
    <div class="filters"><label class="f"><span>Имот</span><span class="sel">Всички имоти${icon('ChevronDown', 16, 2)}</span></label><label class="f"><span>Статус</span><span class="sel">Всички${icon('ChevronDown', 16, 2)}</span></label><label class="f"><span>От</span><span class="sel">дд.мм.гггг${icon('CalendarDays', 16, 2)}</span></label><label class="f"><span>До</span><span class="sel">дд.мм.гггг${icon('CalendarDays', 16, 2)}</span></label></div>
    <div class="blist" role="table">
      <div class="bhead" role="row"><span>Гост</span><span>Имот</span><span>Настаняване</span><span>Напускане</span><span class="r">Нощ.</span><span class="r">Цена</span><span class="r">Комисиона</span><span>Източник</span><span>Статус</span></div>
      ${rows
        .map((b) => {
          const [st, k] = STATUS[b.status]
          const n = nights(b.check_in, b.check_out)
          return `<div class="brow" role="row">
        <span class="c-guest"><span class="av av-g">${initials(b.guest_name)}</span><span><b>${esc(b.guest_name)}</b><small class="s-phone">${esc(b.guest_phone)}</small><small class="s-prop">${esc(short(b.property_id))}</small></span></span>
        <span class="c-prop">${esc(short(b.property_id))}</span>
        <span class="c-in"><small class="m-l">Настаняване</small>${dFull(b.check_in)}</span>
        <span class="c-out"><small class="m-l">Напускане</small>${dFull(b.check_out)}</span>
        <span class="c-n r"><small class="m-l">Нощувки</small>${n}</span>
        <span class="c-price r"><small class="m-l">Цена</small>${money(b.total_price)}</span>
        <span class="c-comm r"><small class="m-l">Комисиона</small>${b.commission ? money(b.commission) : '—'}</span>
        <span class="c-src">${tag(b.source)}</span>
        <span class="c-st"><em class="st st-${k}">${st}</em></span>
      </div>`
        })
        .join('\n      ')}
    </div>`
}

function chartSvg() {
  const W = 760, H = 220, pad = { l: 8, r: 8, t: 14, b: 26 }
  const max = Math.max(...SERIES.map(([a, b]) => a + b))
  const bw = (W - pad.l - pad.r) / SERIES.length
  const ih = H - pad.t - pad.b
  const bars = SERIES.map(([a, b], i) => {
    const x = pad.l + i * bw + bw * 0.2
    const w = bw * 0.6
    const ha = (a / max) * ih
    const hb = (b / max) * ih
    const y0 = H - pad.b
    const last = i === SERIES.length - 1
    return `<g class="bar-g${last ? ' is-cur' : ''}"><rect class="b1" x="${x.toFixed(1)}" y="${(y0 - ha).toFixed(1)}" width="${w.toFixed(1)}" height="${ha.toFixed(1)}" rx="3"/><rect class="b2" x="${x.toFixed(1)}" y="${(y0 - ha - hb - 2).toFixed(1)}" width="${w.toFixed(1)}" height="${hb.toFixed(1)}" rx="3"/><text x="${(x + w / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle">${MONTHS[i]}</text></g>`
  }).join('')
  const grid = [0.25, 0.5, 0.75].map((f) => `<line class="gl" x1="${pad.l}" x2="${W - pad.r}" y1="${(H - pad.b - f * ih).toFixed(1)}" y2="${(H - pad.b - f * ih).toFixed(1)}"/>`).join('')
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Приходи по месеци: директни и от платформи" preserveAspectRatio="xMidYMid meet">${grid}${bars}</svg>`
}

function earnings() {
  const p = moneyParts(E.profit)
  const metrics = [
    ['Приходи', money(E.revenue), 'TrendingUp', 'преди комисиони'],
    ['Нетно', money(E.net), 'Wallet', 'след комисиони'],
    ['Заетост', `${String(E.occupancy_pct).replace('.', ',')} %`, 'BedDouble', `${E.nights_sold} от ${E.available_nights} нощувки`],
    ['Средна цена', money(E.adr), 'Tag', 'на нощувка'],
    ['Директни', `${String(E.direct_share_pct).replace('.', ',')} %`, 'Handshake', 'без комисиона'],
  ]
  return head('Октомври 2026', 'Приходи', 'Колко печелите — и колко спестявате, като резервирате директно.', btn('Разход', 'Minus', 'ghost') + btn('Приход', 'Plus') ) +
    `<div class="seg" role="group" aria-label="Период"><button class="is-on">Този месец</button><button>Тази година</button><button>Следващите 3 месеца</button><button>Свой период</button></div>
    <section class="hero" aria-label="Печалба">
      <div class="hero-main"><p class="hero-l">Печалба за октомври</p><p class="hero-v"><span class="i">${p.int}</span><span class="d">${p.dec}</span><span class="c">${p.cur}</span></p>
      <p class="hero-n">${money(E.net)} нетно <span>+ ${money(E.other_income)} други приходи</span> <span>− ${money(E.expenses)} разходи</span></p></div>
      <div class="hero-save">${icon('Sparkles', 20, 2)}<div><b>${money(E.commission_saved)}</b><small>спестена комисиона от директни резервации</small></div></div>
    </section>
    <section class="metrics">${metrics.map(([l, v, ic, s]) => `<div class="metric"><span class="metric-l">${icon(ic, 16, 2)}${l}</span><b class="metric-v">${v}</b><span class="metric-s">${s}</span></div>`).join('')}</section>
    <section class="panel chartp"><div class="panel-h"><h2>Приходи по месеци</h2><span class="legend"><i class="l1"></i>Директни<i class="l2"></i>Платформи</span></div>${chartSvg()}</section>
    <section class="panel byprop"><div class="panel-h"><h2>По имоти</h2></div>
      ${EP.map((r) => `<div class="prow"><span class="pn"><b>${esc(r.property_name)}</b><small>${r.nights_sold} нощувки · ${String(r.occupancy_pct).replace('.', ',')} % заетост</small></span><span class="pbar"><i style="width:${Math.min(100, Math.round(r.occupancy_pct * 2.6))}%"></i></span><span class="pv"><small>Приходи</small>${money(r.revenue)}</span><span class="pv"><small>Нетно</small>${money(r.net)}</span><span class="pv pp"><small>Печалба</small>${money(r.profit)}</span></div>`).join('')}
    </section>`
}

const SCREENS = {
  dashboard: ['Табло', dashboard],
  bookings: ['Резервации', bookings],
  earnings: ['Приходи', earnings],
}

/* ------------------------------------------------------------------ документ */
const FONT_LINKS = {
  a: 'family=Literata:opsz,wght@7..72,500;7..72,600;7..72,700&family=Onest:wght@400;500;600;700',
  b: 'family=Onest:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700',
  c: 'family=Golos+Text:wght@400;500;600;700;800',
}
const css = (f) => readFileSync(join(here, 'css', f), 'utf8')
const cssVars = (d) => `:root{${Object.entries(d.c).map(([k, v]) => `--${k}:${v}`).join(';')}}`

for (const d of Object.values(DIRECTIONS)) {
  for (const [screen, [title, render]] of Object.entries(SCREENS)) {
    const html = `<!doctype html>
<html lang="bg" data-dir="${d.key}" data-screen="${screen}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${d.name} · ${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?${FONT_LINKS[d.key]}&display=swap" rel="stylesheet">
<style>${cssVars(d)}\n${css('shared.css')}\n${css(`${d.key}.css`)}</style></head>
<body>
${shell(d.key, screen, title, render())}
</body></html>`
    writeFileSync(join(OUT, `${d.key}-${screen}.html`), html)
  }
}
console.log('готово:', Object.keys(SCREENS).length * 3, 'файла в design/directions/out')
