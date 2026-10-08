// Тестове за дизайн системата — чиста логика, без браузър и без зависимости.
//   node scripts/test-design.mjs
// 1) палитрата „Златен час“ (stayThemeVars) държи контраст ≥ 4.5:1 за ВСЕКИ акцентен цвят;
// 2) токените на приложението (src/styles/tokens.css) — виж секцията по-долу, ако файлът съществува.
import { readFileSync, existsSync } from 'node:fs'
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

  // 2b) всички светли/тъмни двойки на състоянията: мек фон + тъмен текст ≥ 7:1 (AAA за основния текст), плътен + бял ≥ 4.5
  for (const tone of ['success', 'warning', 'danger', 'info']) {
    const solid = hex(`color-${tone}-600`)
    ok(`${tone}-600 с бял текст ≥ 4.5 (плътен бутон/значка)`, !!solid && contrastRatio('#ffffff', solid) >= 4.5, solid ? contrastRatio('#ffffff', solid).toFixed(2) : 'липсва')
    const soft = hex(`color-${tone}-50`)
    const deep = hex(`color-${tone}-800`)
    ok(`${tone}-800 върху ${tone}-50 ≥ 7 (AAA)`, !!soft && !!deep && contrastRatio(deep, soft) >= 7, soft && deep ? contrastRatio(deep, soft).toFixed(2) : 'липсва')
  }

  // 2c) старите имена (emerald/amber/red/rose/blue) сочат към съществуващи стойности — иначе класовете в екраните „осиротяват“
  const legacy = { emerald: 'success', amber: 'warning', red: 'danger', rose: 'danger', blue: 'info' }
  const broken = []
  for (const [old, now] of Object.entries(legacy)) {
    for (const step of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]) {
      if (vars[`color-${old}-${step}`] !== `var(--color-${now}-${step})` || !hex(`color-${old}-${step}`)) broken.push(`${old}-${step}`)
    }
  }
  ok('старите имена на цветовете (emerald, amber, red, rose, blue) се разрешават до нови стойности', broken.length === 0, broken.slice(0, 4).join(', '))

  // 2d) неутралната скала е монотонна (по-голямо число = по-тъмно) и без дупки
  const lum = (h) => contrastRatio(h, '#000000')
  const slate = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((s) => hex(`color-slate-${s}`))
  ok('неутралната скала slate-50…950 е пълна и последователно потъмнява', slate.every(Boolean) && slate.every((h, i) => i === 0 || lum(h) < lum(slate[i - 1])))

  // 2e) движение: приложението е ≤ 200 ms; разстояние за пръст ≥ 44 px
  const ms = (name) => Number((vars[name] || '').replace('ms', ''))
  ok('времената на движение са ≤ 200 ms (fast/base/slow)', ['duration-fast', 'duration-base', 'duration-slow'].every((n) => ms(n) > 0 && ms(n) <= 200), ['duration-fast', 'duration-base', 'duration-slow'].map((n) => vars[n]).join(' / '))
  const rem = (name) => Number((vars[name] || '').replace('rem', '')) * 16
  ok('--control-h и --tap-min са ≥ 44 px', rem('control-h') >= 44 && rem('tap-min') >= 44, `${rem('control-h')} / ${rem('tap-min')} px`)

  // 2f) шрифт: Onest е първият в стека и всеки файл от @font-face съществува
  ok('основният шрифт е Onest (кирилица)', /^"Onest"/.test(vars['font-sans'] || ''), vars['font-sans']?.slice(0, 30))
  const fonts = read('src/styles/fonts.css')
  const files = [...fonts.matchAll(/url\("([^"]+)"\)/g)].map((m) => m[1])
  ok('всички файлове от fonts.css съществуват в /public', files.length >= 3 && files.every((f) => existsSync(join(root, 'public', f))), files.join(', '))
  ok('кирилското подмножество покрива българската азбука (U+0400–045F)', /U\+0400-045F/.test(fonts))

  // 2g) „без сурови цветове в компонентите“: components.css и base.css ползват само токени
  for (const f of ['src/styles/components.css', 'src/styles/base.css']) {
    const css = read(f).replace(/\/\*[\s\S]*?\*\//g, '')
    const raw = [...css.matchAll(/(?<![&%\w-])#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]).filter((h) => !['#fff', '#ffffff'].includes(h.toLowerCase()))
    ok(`${f}: няма сурови hex цветове (само токени; бялото #fff е позволено)`, raw.length === 0, raw.slice(0, 5).join(', '))
  }
}



console.log(`\n${pass} успешни, ${fail} провалени\n`)
process.exit(fail ? 1 : 0)
