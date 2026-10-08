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
const tokensPath = join(root, 'src/styles/tokens.css')
if (existsSync(tokensPath)) {
  const css = readFileSync(tokensPath, 'utf8')
  const vars = {}
  for (const m of css.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)) vars[m[1]] = m[2].trim()
  // Разрешава var(--x) верижно до #hex.
  const hex = (name, depth = 0) => {
    const raw = vars[name]
    if (!raw || depth > 6) return null
    const ref = raw.match(/^var\(--([a-z0-9-]+)\)$/i)
    if (ref) return hex(ref[1], depth + 1)
    return /^#[0-9a-f]{6}$/i.test(raw) ? raw.toLowerCase() : null
  }
  const pairs = JSON.parse(readFileSync(join(root, 'scripts/token-pairs.json'), 'utf8'))
  for (const [fg, bg, min, why] of pairs) {
    const a = hex(fg)
    const b = hex(bg)
    if (!a || !b) {
      ok(`токен ${fg} върху ${bg}: ${why}`, false, `не се разрешава (${a ?? '?'} / ${b ?? '?'})`)
      continue
    }
    const r = contrastRatio(a, b)
    ok(`${why}: ${fg} върху ${bg} ≥ ${min}`, r >= min, `${r.toFixed(2)}:1 (${a} / ${b})`)
  }
}

console.log(`\n${pass} успешни, ${fail} провалени\n`)
process.exit(fail ? 1 : 0)
