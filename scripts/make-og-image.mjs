// Прави public/og-default.png (1200×630) — картинката при споделяне на линк (Viber, Facebook, WhatsApp, Google).
// Ползва самохостваните шрифтове и логото от public/. Пускане: node scripts/make-og-image.mjs
// Нужен е playwright (npm i --no-save playwright) и инсталиран Chrome.
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pub = pathToFileURL(path.join(root, 'public')).href

const html = `<!doctype html><html lang="bg"><head><meta charset="utf-8"><style>
@font-face{font-family:Onest;font-weight:400 800;src:url("${pub}/fonts/onest-cyrillic.woff2");unicode-range:U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116}
@font-face{font-family:Onest;font-weight:400 800;src:url("${pub}/fonts/onest-latin.woff2");unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122}
*{box-sizing:border-box}html,body{margin:0}
body{width:1200px;height:630px;background:#f6efe3;color:#241a11;font-family:Onest,sans-serif;position:relative;overflow:hidden}
.band{position:absolute;left:0;top:0;bottom:0;width:24px;background:#a63e1e}
.wrap{position:absolute;left:96px;right:96px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center}
img{width:520px;height:auto;display:block;margin-bottom:56px}
h1{margin:0;font-size:58px;line-height:1.1;font-weight:700;letter-spacing:-.01em}
p{margin:24px 0 0;font-size:34px;line-height:1.35;color:#4a3b2d;font-weight:500}
</style></head><body><div class="band"></div><div class="wrap">
<img src="${pub}/brand/logo-horizontal.png" alt="">
<h1>Управление на краткосрочни наеми</h1>
<p>Резервации, календар, почистване и фактури на едно място</p>
</div></body></html>`

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
const tmp = path.join(root, 'scripts', '_og.html')
writeFileSync(tmp, html)
await page.goto(pathToFileURL(tmp).href)
await page.evaluate(() => document.fonts.ready)
await page.screenshot({ path: path.join(root, 'public', 'og-default.png') })
await browser.close()
import('node:fs').then((fs) => fs.unlinkSync(tmp))
console.log('public/og-default.png готов')
