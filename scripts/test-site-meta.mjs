// Проверки без браузър за: истинска 404 (всеки адрес от src/App.jsx е в netlify.toml), защитни заглавия, robots.txt,
// sitemap.xml и преглед на линка (заглавие/OG) за публичните страници. Пускане: node scripts/test-site-meta.mjs
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { injectMeta, PAGES, normalizePath, OG_IMAGE_PATH } from '../netlify/edge-functions/page-meta.js'
import { robotsTxt, sitemapXml, SITEMAP_PATHS } from '../netlify/edge-functions/site-files.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(path.join(root, p), 'utf8')

let pass = 0
let fail = 0
function ok(cond, name) {
  if (cond) pass++
  else {
    fail++
    console.log('FAIL ', name)
  }
}

// ---- netlify.toml: пренасочвания и заглавия ----------------------------------------------------------------
const toml = read('netlify.toml').replace(/\r/g, '')
const redirects = [...toml.matchAll(/\[\[redirects\]\]\s+from = "([^"]+)"\s+to = "([^"]+)"\s+status = (\d+)/g)].map((m) => ({
  from: m[1],
  to: m[2],
  status: Number(m[3]),
}))
const headerRules = [...toml.matchAll(/\[\[headers\]\]\s+for = "([^"]+)"\s+\[headers\.values\]([\s\S]*?)(?=\n\[\[|\n*$)/g)].map((m) => ({
  for: m[1],
  values: Object.fromEntries([...m[2].matchAll(/^\s*([\w-]+) = "([^"]*)"/gm)].map((v) => [v[1], v[2]])),
}))

const matches = (pattern, p) => {
  const norm = p.length > 1 ? p.replace(/\/+$/, '') : p
  if (pattern.endsWith('/*')) return norm === pattern.slice(0, -2) || norm.startsWith(pattern.slice(0, -1))
  if (pattern === '/*') return true
  return norm === pattern
}
const resolve = (p) => redirects.find((r) => matches(r.from, p))
const exists = (p) => p !== '/' && existsSync(path.join(root, 'public', p.slice(1))) // статичен файл печели (без force)

ok(redirects.length > 10, 'netlify.toml: има пренасочвания')
ok(redirects.at(-1)?.from === '/*' && redirects.at(-1).status === 404 && redirects.at(-1).to === '/404.html', 'последното правило е /* → /404.html със статус 404')
ok(existsSync(path.join(root, 'public', '404.html')), 'public/404.html съществува')

// Всеки <Route path> от App.jsx → примерен адрес → трябва да стига до index.html със статус 200.
const app = read('src/App.jsx')
const routePaths = [...app.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]).filter((p) => p !== '*')
ok(routePaths.length > 15, `App.jsx: намерени адреси (${routePaths.length})`)
for (const rp of ['/', ...routePaths]) {
  const sample = rp.replace(/:\w+/g, 'primer-1')
  const r = resolve(sample)
  ok(r && r.status === 200 && r.to === '/index.html', `адрес ${rp} (${sample}) → index.html 200 (получи: ${r ? r.from + ' ' + r.status : 'нищо'})`)
}
// API правилата са преди SPA правилата
for (const api of ['/api/ical', '/api/booking-request', '/api/process-outbox', '/api/analyze-photos', '/api/telegram-webhook']) {
  const r = resolve(api)
  ok(r && r.to.startsWith('/.netlify/functions/'), `${api} стига до функция`)
}
// Непознати адреси → 404
for (const bad of ['/nqma-takava', '/wp-admin', '/admin/login', '/robots.txt.bak', '/assets/stara-versiq.js']) {
  if (exists(bad)) continue
  const r = resolve(bad)
  ok(r && r.status === 404, `${bad} → 404 (получи: ${r ? r.from + ' ' + r.status : 'нищо'})`)
}

// Защитни заглавия за всички адреси
const all = headerRules.find((h) => h.for === '/*')?.values ?? {}
ok(all['X-Content-Type-Options'] === 'nosniff', 'заглавие X-Content-Type-Options: nosniff')
ok(/strict-origin/.test(all['Referrer-Policy'] ?? ''), 'заглавие Referrer-Policy')
ok(all['X-Frame-Options'] === 'DENY', 'заглавие X-Frame-Options: DENY')
ok(all['Content-Security-Policy'] === "frame-ancestors 'none'", "заглавие CSP frame-ancestors 'none'")
ok(/geolocation=\(self\)/.test(all['Permissions-Policy'] ?? ''), 'Permissions-Policy оставя геолокацията (ползва я формата на имота)')
ok(!/camera=\(self\)|microphone=\(self\)/.test(all['Permissions-Policy'] ?? ''), 'камера/микрофон забранени')
// Личните/вътрешни адреси са noindex; публичните — не
const noindexed = (p) => headerRules.some((h) => h.values['X-Robots-Tag'] === 'noindex' && matches(h.for, p))
for (const p of ['/guest/abc', '/design', '/reset-password', '/update-password', '/bookings', '/calendar', '/properties/12', '/earnings/rules', '/login']) {
  ok(noindexed(p), `${p}: X-Robots-Tag noindex`)
}
for (const p of ['/', '/demo', '/signup', '/stay/tihi-bryag']) ok(!noindexed(p), `${p}: НЕ е noindex (публична)`)
ok(!/'self'|unsafe-inline/.test(all['Content-Security-Policy'] ?? ''), 'няма твърда CSP, която да счупи външните ресурси')

// ---- robots.txt и sitemap.xml -------------------------------------------------------------------------------
const origin = 'https://primer.example'
const robots = robotsTxt(origin)
ok(/^User-agent: \*$/m.test(robots) && /^Allow: \/$/m.test(robots), 'robots.txt: User-agent + Allow /')
ok(/^Disallow: \/api\/$/m.test(robots), 'robots.txt: Disallow /api/')
ok(robots.includes(`Sitemap: ${origin}/sitemap.xml`), 'robots.txt: Sitemap с адреса от заявката')
ok(!/^Disallow: \/$/m.test(robots), 'robots.txt не блокира целия сайт')
const sm = sitemapXml(origin)
ok(sm.startsWith('<?xml') && sm.includes('<urlset'), 'sitemap.xml: валиден корен')
for (const p of SITEMAP_PATHS) ok(sm.includes(`<loc>${origin}${p}</loc>`), `sitemap.xml съдържа ${p}`)
ok(!sm.includes('/login') && !sm.includes('/guest') && !sm.includes('/stay/'), 'sitemap.xml без вътрешни/лични адреси')
// всяка страница от картата е с метаданни и не е noindex
for (const p of SITEMAP_PATHS) ok(PAGES[p] && !PAGES[p].noindex, `картата: ${p} има метаданни и е индексируема`)

// ---- Метаданни за споделяне ---------------------------------------------------------------------------------
const index = read('index.html')
for (const [p, page] of Object.entries(PAGES)) {
  const html = injectMeta(index, page, origin, p)
  const count = (re) => (html.match(re) || []).length
  ok(count(/<title>/g) === 1 && html.includes(`<title>${page.title}</title>`.replace(/&/g, '&amp;')), `${p}: един <title>, подменен`)
  ok(count(/<meta name="description"/g) === 1 && html.includes(page.description), `${p}: едно описание, подменено`)
  ok(page.title.length >= 10 && page.title.length <= 70, `${p}: заглавие 10–70 знака (${page.title.length})`)
  ok(page.description.length >= 50 && page.description.length <= 200, `${p}: описание 50–200 знака (${page.description.length})`)
  ok(count(/property="og:title"/g) === 1 && count(/property="og:image"/g) === 1 && count(/property="og:url"/g) === 1, `${p}: по един og:title/image/url`)
  ok(html.includes(`<meta property="og:image" content="${origin}${OG_IMAGE_PATH}" />`), `${p}: og:image с абсолютен адрес`)
  ok(html.includes(`<link rel="canonical" href="${origin}${page.canonical ?? p}" />`), `${p}: canonical`)
  ok(count(/name="robots"/g) === (page.noindex ? 1 : 0), `${p}: robots ${page.noindex ? 'noindex' : 'без ограничение'}`)
  ok(html.includes('</head>') && html.indexOf('og:title') < html.indexOf('</head>'), `${p}: таговете са в <head>`)
}
ok(normalizePath('/login/') === '/login' && normalizePath('') === '/' && normalizePath('/') === '/', 'normalizePath')
const evil = injectMeta(index, { title: 'a "b" <c>', description: 'x & "y" <z>' }, 'https://x.example', '/')
ok(!evil.includes('<c>') && !evil.includes('<z>') && evil.includes('&quot;b&quot;'), 'специални знаци се екранират')
// картинката за споделяне съществува и е PNG 1200×630
const png = readFileSync(path.join(root, 'public', 'og-default.png'))
ok(png.subarray(1, 4).toString() === 'PNG' && png.readUInt32BE(16) === 1200 && png.readUInt32BE(20) === 630, 'public/og-default.png е PNG 1200×630')
ok(png.length < 300_000, `og-default.png е лека (${Math.round(png.length / 1024)} KB)`)

// Текстовете на /demo в edge функцията = тези в самата страница
const demo = read('src/pages/demo/DemoHome.jsx')
const demoTitle = /const PAGE_TITLE = '([^']+)'/.exec(demo)?.[1]
const demoDesc = /const PAGE_DESC =\s*'([^']+)'/.exec(demo)?.[1]
ok(demoTitle === PAGES['/demo'].title, '/demo: заглавието в edge функцията = PAGE_TITLE в DemoHome.jsx')
ok(demoDesc === PAGES['/demo'].description, '/demo: описанието в edge функцията = PAGE_DESC в DemoHome.jsx')
ok(/const HOME_TITLE = '([^']+)'/.exec(demo)?.[1] === PAGES['/'].title, '/: заглавието в edge функцията = HOME_TITLE в DemoHome.jsx')
ok(/const HOME_DESC = '([^']+)'/.exec(demo)?.[1] === PAGES['/'].description, '/: описанието в edge функцията = HOME_DESC в DemoHome.jsx')
ok(PAGES['/demo'].canonical === '/' && !sm.includes('/demo<'), '/demo: canonical към / и не е в картата на сайта')
ok(/guest=\{<DemoHome home \/>\}/.test(app), 'App.jsx: „/“ за невлезли показва DemoHome')
// /stay/* не е в page-meta (там работи stay-og.js)
ok(!Object.keys(PAGES).some((p) => p.startsWith('/stay')), 'page-meta не пипа /stay/*')

console.log(`\nsite-meta: ${pass} успешни, ${fail} провалени`)
process.exit(fail ? 1 : 0)
