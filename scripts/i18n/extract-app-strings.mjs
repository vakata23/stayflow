// Събира всички български текстове в приложението на собственика (JSX текстове, надписи на атрибути,
// низове, шаблонни низове с ${…} → {0}, {1}) — основа на речника за гръцки и македонски и на теста за покритие.
//   node scripts/i18n/extract-app-strings.mjs            → печата обобщение
//   node scripts/i18n/extract-app-strings.mjs --json     → пише scripts/i18n/out/app-strings.json
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from '@babel/parser'
import traverseModule from '@babel/traverse'

const traverse = traverseModule.default ?? traverseModule
const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..')
const SRC = join(ROOT, 'src')

/** Какво НЕ се превежда: публичните страници за гости (имат собствен превод или са за гости), PDF фактурите, сървърният код. */
export const EXCLUDE = [
  `pages${sep}stay${sep}`, // публичната страница — свой превод на 6 езика
  `pages${sep}guest${sep}`, // картата за госта — публична, за гостите на собственика
  `lib${sep}invoicePdf.js`, `lib${sep}localeDates.js`, // македонските имена на месеци (изход, не изходен текст) // фактурата е документ на български (за гост/счетоводство)
  `lib${sep}icalServer.js`, `lib${sep}bookingRequestServer.js`, `lib${sep}outboxProcessor.js`, `lib${sep}notificationAdapters.js`,
  `lib${sep}autoEntriesServer.js`, `lib${sep}photoAnalysisServer.js`, // само на сървъра
  `pages${sep}DesignSystem.jsx`, // витрината на дизайна — вътрешна
  `i18n${sep}el.js`, `i18n${sep}mk.js`, `i18n${sep}translator.js`, `i18n${sep}appLang.js`, `i18n${sep}domTranslator.js`, // самият превод и речниците (AppLangSwitch.jsx се чете като екран)
]

const CYR = /[Ѐ-ӿ]/
const norm = (s) => s.replace(/\s+/g, ' ').trim()

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(jsx?|mjs)$/.test(name)) out.push(p)
  }
  return out
}

export function extractFile(file) {
  const code = readFileSync(file, 'utf8')
  const ast = parse(code, { sourceType: 'module', plugins: ['jsx'], errorRecovery: true })
  const found = []
  const add = (kind, text, node) => {
    const t = norm(text)
    if (t && CYR.test(t)) found.push({ kind, text: t, line: node.loc?.start.line ?? 0 })
  }
  traverse(ast, {
    JSXText(path) {
      add('jsx', path.node.value, path.node)
    },
    StringLiteral(path) {
      // импорти/експорти от файлове не са текст
      if (path.parent.type === 'ImportDeclaration' || path.parent.type === 'ExportAllDeclaration' || path.parent.type === 'ExportNamedDeclaration') return
      // ключове на обекти ({ 'Име': 1 }) са данни, не текст за показване — но тук няма такива; все пак взимаме само стойности
      if (path.parent.type === 'ObjectProperty' && path.parent.key === path.node && !path.parent.computed) return
      add(path.parent.type === 'JSXAttribute' ? 'attr:' + path.parent.name.name : 'str', path.node.value, path.node)
    },
    TemplateLiteral(path) {
      const { quasis, expressions } = path.node
      if (!quasis.some((q) => CYR.test(q.value.cooked ?? q.value.raw))) return
      let text = ''
      quasis.forEach((q, i) => {
        text += q.value.cooked ?? q.value.raw
        if (i < expressions.length) text += `{${i}}`
      })
      add('tpl', text, path.node)
    },
  })
  return found
}

export function extractAll() {
  const files = walk(SRC).filter((f) => !EXCLUDE.some((e) => relative(SRC, f).includes(e)))
  const byText = new Map()
  for (const f of files) {
    for (const hit of extractFile(f)) {
      const entry = byText.get(hit.text) ?? { text: hit.text, kinds: new Set(), where: [] }
      entry.kinds.add(hit.kind)
      entry.where.push(`${relative(ROOT, f).replace(/\\/g, '/')}:${hit.line}`)
      byText.set(hit.text, entry)
    }
  }
  return [...byText.values()].map((e) => ({ text: e.text, kinds: [...e.kinds], where: e.where }))
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('extract-app-strings.mjs')) {
  const all = extractAll()
  const kinds = {}
  for (const e of all) for (const k of e.kinds) kinds[k.split(':')[0]] = (kinds[k.split(':')[0]] ?? 0) + 1
  const words = all.reduce((s, e) => s + e.text.split(' ').length, 0)
  console.log(`уникални български текстове: ${all.length}  (≈ ${words} думи)`, kinds)
  const perFile = {}
  for (const e of all) for (const w of e.where) perFile[w.split(':')[0]] = (perFile[w.split(':')[0]] ?? 0) + 1
  console.log(Object.entries(perFile).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([f, n]) => `${String(n).padStart(4)} ${f}`).join('\n'))
  if (process.argv.includes('--json')) {
    const out = join(ROOT, 'scripts', 'i18n', 'out')
    mkdirSync(out, { recursive: true })
    writeFileSync(join(out, 'app-strings.json'), JSON.stringify(all, null, 1))
    console.log('записано: scripts/i18n/out/app-strings.json')
  }
}
