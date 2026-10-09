// Тестове за дизайн системата — чиста логика, без браузър и без зависимости.
//   node scripts/test-design.mjs
// 1) палитрата „Златен час“ (stayThemeVars) държи контраст ≥ 4.5:1 за ВСЕКИ акцентен цвят;
// 2) токените на приложението (src/styles/tokens.css) — виж секцията по-долу, ако файлът съществува.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { stayThemeVars, contrastRatio, hexToRgb, rgbToHex } = await import(
  pathToFileURL(join(root, 'src/lib/accentColor.js')).href
)

let pass = 0
let fail = 0
const ok = (name, cond, extra = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`)
}

// ---------------------------------------------------------------- 1. палитра по акцент
// Обхождане на цветовото колело (всеки 15°) × наситеност × светлина.
const hslToHex = (h, s, l) => {
  const a = s * Math.min(l, 1 - l)
  const f = (n) => {
    const k = (n + h / 30) % 12
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
  }
  return rgbToHex([f(0) * 255, f(8) * 255, f(4) * 255])
}

let worst = { name: '', ratio: 99, accent: '' }
let checked = 0
let bad = []
const track = (name, ratio, accent) => {
  if (ratio < worst.ratio) worst = { name, ratio, accent }
  if (ratio < 4.5) bad.push(`${name} ${ratio.toFixed(2)} @ ${accent}`)
}
const accents = [undefined, null, '#000000', '#ffffff', '#808080']
for (let h = 0; h < 360; h += 15) for (const s of [0.1, 0.35, 0.65, 0.95]) for (const l of [0.08, 0.25, 0.45, 0.65, 0.85, 0.97]) accents.push(hslToHex(h, s, l))

for (const accent of accents) {
  const v = stayThemeVars(accent)
  checked++
  track('бял текст върху акцент (бутон)', contrastRatio('#ffffff', v['--stay-accent']), accent)
  track('акцент като текст върху хартия', contrastRatio(v['--stay-accent-text'], v['--stay-paper']), accent)
  track('акцент като текст върху карта', contrastRatio(v['--stay-accent-text'], v['--stay-paper-deep']), accent)
  track('мастило върху хартия', contrastRatio(v['--stay-ink'], v['--stay-paper']), accent)
  track('мастило върху карта', contrastRatio(v['--stay-ink'], v['--stay-paper-deep']), accent)
  track('приглушен текст върху хартия', contrastRatio(v['--stay-muted'], v['--stay-paper']), accent)
  track('приглушен текст върху карта', contrastRatio(v['--stay-muted'], v['--stay-paper-deep']), accent)
}
ok(`палитрата „Златен час“ минава контраста ≥ 4.5 за ${checked} акцента (вкл. липсващ, черен, бял, сив)`, bad.length === 0, bad.slice(0, 3).join(' | ') || `най-слабо: ${worst.name} ${worst.ratio.toFixed(2)}`)

const sample = stayThemeVars('#a8652a')
ok('всички цветове са валиден #rrggbb', ['--stay-accent', '--stay-accent-text', '--stay-paper', '--stay-paper-deep', '--stay-ink', '--stay-muted', '--stay-glow'].every((k) => /^#[0-9a-f]{6}$/.test(sample[k])))
ok('сянката за градиентите е „r,g,b“', /^\d{1,3},\d{1,3},\d{1,3}$/.test(sample['--stay-shade']))
ok('хартията е светла, мастилото е тъмно', hexToRgb(sample['--stay-paper']).every((c) => c > 200) && hexToRgb(sample['--stay-ink']).every((c) => c < 60))

// ---------------------------------------------------------------- 2. токени на приложението
const read = (p) => readFileSync(join(root, p), 'utf8')
const tokensPath = join(root, 'src/styles/tokens.css')
if (existsSync(tokensPath)) {
  const css = read('src/styles/tokens.css')
  const vars = {}
  for (const m of css.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)) vars[m[1]] = m[2].trim()
  // Разрешава var(--x) верижно до #hex.
  const hex = (name, depth = 0) => {
    const raw = vars[name]
    if (!raw || depth > 8) return null
    const ref = raw.match(/^var\(--([a-z0-9-]+)\)$/i)
    if (ref) return hex(ref[1], depth + 1)
    return /^#[0-9a-f]{6}$/i.test(raw) ? raw.toLowerCase() : null
  }

  // 2a) двойки текст/фон (единният списък е и в витрината на /design)
  const pairs = JSON.parse(read('scripts/token-pairs.json'))
  for (const [fg, bg, min, why] of pairs) {
    const a = hex('color-' + fg)
    const b = hex('color-' + bg)
    if (!a || !b) {
      ok(`${why}: ${fg} върху ${bg}`, false, `не се разрешава (${a ?? '?'} / ${b ?? '?'})`)
      continue
    }
    const r = contrastRatio(a, b)
    ok(`${why}: ${fg} върху ${bg} ≥ ${min}`, r >= min, `${r.toFixed(2)}:1 (${a} / ${b})`)
  }

  // 2b) състояния: плътен цвят с бял текст ≥ 4.5; мек фон + тъмен текст ≥ 7 (AAA за основния текст)
  for (const tone of ['success', 'warning', 'danger', 'info']) {
    const solid = hex('color-' + tone)
    ok(tone + ' с бял текст ≥ 4.5 (плътен бутон/значка)', !!solid && contrastRatio('#ffffff', solid) >= 4.5, solid ? contrastRatio('#ffffff', solid).toFixed(2) : 'липсва')
    const soft = hex('color-' + tone + '-soft')
    const deep = hex('color-' + tone + '-ink')
    ok(tone + '-ink върху ' + tone + '-soft ≥ 7 (AAA)', !!soft && !!deep && contrastRatio(deep, soft) >= 7, soft && deep ? contrastRatio(deep, soft).toFixed(2) : 'липсва')
    ok(tone + '-line е различим от ' + tone + '-soft (разделител)', !!hex('color-' + tone + '-line') && hex('color-' + tone + '-line') !== soft)
  }

  // 2c) НЯМА съвместимостен слой: старите скали не съществуват в токените
  const legacyNames = Object.keys(vars).filter((n) => /^color-(slate|brand|emerald|amber|red|rose|blue|teal|gray|zinc|canvas)(-|$)/.test(n))
  ok('в tokens.css няма стари цветови скали (slate, brand, emerald, amber, red, rose, blue, teal)', legacyNames.length === 0, legacyNames.slice(0, 5).join(', '))

  // 2d) екраните ползват само ролите: няма клас със стар цвят никъде в src (ProtectedRoute е умишлено недокоснат)
  const walk = (dir) => readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : /\.(jsx?|css)$/.test(n) ? [p] : []
  })
  const oldClass = /\b(?:bg|text|border|ring|divide|from|to|via|fill|stroke|outline|decoration|placeholder|accent|caret|shadow)-(?:slate|gray|zinc|neutral|stone|brand|teal|emerald|amber|red|rose|blue|cyan|sky|indigo|violet|purple|green|yellow|orange)-\d{2,3}\b/
  const stale = []
  for (const f of walk(join(root, 'src'))) {
    const rel = f.slice(root.length + 1).replace(/\\/g, '/')
    if (rel === 'src/components/ProtectedRoute.jsx') continue
    const m = readFileSync(f, 'utf8').match(oldClass)
    if (m) stale.push(rel + ':' + m[0])
  }
  ok('в src няма класове със стари цветове (само семантични роли)', stale.length === 0, stale.slice(0, 4).join(', '))

  // 2e) движение: три времена (120 / 180 / 280 ms), една крива за вход и една за изход; пръст ≥ 44 px
  const ms = (name) => Number((vars[name] || '').replace('ms', ''))
  ok('времената на движение са 120 / 180 / 280 ms', ms('duration-fast') === 120 && ms('duration-base') === 180 && ms('duration-slow') === 280, ['duration-fast', 'duration-base', 'duration-slow'].map((n) => vars[n]).join(' / '))
  ok('има една крива за вход (ease-out) и една за изход (ease-in)', /^cubic-bezier\(/.test(vars['ease-out'] || '') && /^cubic-bezier\(/.test(vars['ease-in'] || ''))
  const rem = (name) => Number((vars[name] || '').replace('rem', '')) * 16
  ok('--control-h и --tap-min са ≥ 44 px', rem('control-h') >= 44 && rem('tap-min') >= 44, rem('control-h') + ' / ' + rem('tap-min') + ' px')
  ok('картите са 24 px (--radius-2xl)', rem('radius-2xl') === 24, rem('radius-2xl') + ' px')

  // 2f) шрифтове: Onest за интерфейса, Literata за заглавия и големите числа; всеки файл от @font-face съществува
  ok('основният шрифт е Onest (кирилица)', /^"Onest"/.test(vars['font-sans'] || ''), vars['font-sans']?.slice(0, 30))
  ok('шрифтът за заглавия и големи числа е Literata', /^"Literata"/.test(vars['font-display'] || ''), vars['font-display']?.slice(0, 30))
  const fonts = read('src/styles/fonts.css')
  const files = [...fonts.matchAll(/url\("([^"]+)"\)/g)].map((m) => m[1])
  ok('всички файлове от fonts.css съществуват в /public', files.length >= 6 && files.every((f) => existsSync(join(root, 'public', f))), files.length + ' файла')
  ok('Onest и Literata имат кирилско подмножество (U+0400–045F)', (fonts.match(/U\+0400-045F/g) || []).length >= 2)
  const base = read('src/styles/base.css')
  ok('заглавията h1–h3 са във Literata, таблиците с равноширочни цифри', /h1,\s*h2,\s*h3\s*\{[^}]*font-family:\s*var\(--font-display\)/.test(base) && /tabular-nums/.test(base))

  // 2f2) намалено движение: всяка анимация и преход се изключват; крайното състояние е веднага
  ok('при prefers-reduced-motion анимациите и преходите са изключени (animation: none, transition: none)', /prefers-reduced-motion:\s*reduce\)\s*\{[^}]*animation:\s*none\s*!important[^}]*transition:\s*none\s*!important/.test(base.replace(/\s+/g, ' ').replace(/\} *\}/g, '}}')) || (/prefers-reduced-motion/.test(base) && /animation:\s*none\s*!important/.test(base) && /transition:\s*none\s*!important/.test(base)))

  // 2f3) PWA: цветът на лентата в браузъра и фонът на стартовия екран са фонът на приложението
  const surface = hex('color-surface')
  const html = read('index.html')
  const vite = read('vite.config.js')
  ok('index.html: theme-color е фонът на приложението (surface)', new RegExp('name="theme-color" content="' + surface + '"', 'i').test(html), surface)
  ok('manifest: theme_color и background_color са фонът на приложението (surface)', new RegExp("theme_color: '" + surface + "'", 'i').test(vite) && new RegExp("background_color: '" + surface + "'", 'i').test(vite), surface)
  ok('Literata е в прекеша на service worker-а и кирилицата е с preload', /fonts\/literata-\*\.woff2/.test(vite) && /preload" href="\/fonts\/literata-cyrillic\.woff2"/.test(html))

  // 2f4) токените съвпадат с одобрената посока А «Златен час» (макетите в design/directions)
  const dp = join(root, 'design/directions/palettes.mjs')
  if (existsSync(dp)) {
    const { DIRECTIONS } = await import(pathToFileURL(dp).href)
    const A = DIRECTIONS.a.c
    const map = { surface: 'canvas', card: 'surface', sunken: 'sunken', line: 'line', 'line-strong': 'line-strong', ink: 'ink', 'ink-soft': 'ink-soft', 'ink-muted': 'ink-muted', accent: 'accent', 'accent-hover': 'accent-hover', 'accent-soft': 'accent-soft', 'accent-ink': 'accent-ink', 'on-accent': 'on-accent', success: 'success', 'success-soft': 'success-soft', 'success-ink': 'success-ink', warning: 'warning', 'warning-soft': 'warning-soft', 'warning-ink': 'warning-ink', danger: 'danger', 'danger-soft': 'danger-soft', 'danger-ink': 'danger-ink', 'chart-1': 'chart-1', 'chart-2': 'chart-2', 'src-airbnb': 'src-airbnb', 'src-booking': 'src-booking', 'src-direct': 'src-direct' }
    const diff = Object.entries(map).filter(([tok, key]) => (hex('color-' + tok) || '').toLowerCase() !== String(A[key]).toLowerCase()).map(([tok, key]) => tok + ' ' + hex('color-' + tok) + ' ≠ ' + A[key])
    ok('цветовете в tokens.css са тези от одобрената посока А (' + Object.keys(map).length + ' роли)', diff.length === 0, diff.slice(0, 3).join(' | '))
  }

  // 2g) „без сурови цветове в компонентите“: components.css и base.css ползват само токени
  for (const f of ['src/styles/components.css', 'src/styles/base.css']) {
    const css = read(f).replace(/\/\*[\s\S]*?\*\//g, '')
    const raw = [...css.matchAll(/(?<![&%\w-])#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]).filter((h) => !['#fff', '#ffffff'].includes(h.toLowerCase()))
    ok(`${f}: няма сурови hex цветове (само токени; бялото #fff е позволено)`, raw.length === 0, raw.slice(0, 5).join(', '))
  }
}



// ---------------------------------------------------------------- 3. палитри на трите визуални посоки (design/directions)
const dirsPath = join(root, 'design/directions/palettes.mjs')
if (existsSync(dirsPath)) {
  const { DIRECTIONS, check } = await import(pathToFileURL(dirsPath).href)
  for (const d of Object.values(DIRECTIONS)) {
    const res = check(d)
    const bad = res.filter((r) => !r.ok)
    ok('посока ' + d.key.toUpperCase() + ' «' + d.name + '»: всички ' + res.length + ' двойки (текст ≥ 4.5, граници/фокус/графики ≥ 3) минават', bad.length === 0, bad.map((r) => r.fg + '/' + r.bg + ' ' + r.ratio.toFixed(2)).join(', ') || 'най-ниска ' + Math.min(...res.map((r) => r.ratio / r.min)).toFixed(2) + '× от нужното')
  }
}

console.log(`\n${pass} успешни, ${fail} провалени\n`)
process.exit(fail ? 1 : 0)
