// Автоматично обновяване на приложението: посетител със старата версия в кеша на service worker-а получава новата сама
// (проверка при зареждане + skipWaiting/clientsClaim + презареждане), а не след 24 часа. Нужни са два билда на едно и също
// приложение, различаващи се по видим текст (маркер „[V2]“ в долния ред на /demo), и сървър върху папка, която подменяме:
//   билд v1 и v2 със VITE_SUPABASE_URL=http://localhost:<порт>, след това:
//   mkdir swap && cp -r v1/. swap && node scripts/visual/server.mjs swap <порт> &
//   node scripts/visual/pwa-update.mjs <swap> <v1> <v2> <порт>
import { chromium } from 'playwright'
import { cpSync, rmSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const [swap, v1, v2, port = '4175'] = process.argv.slice(2)
if (!swap || !v1 || !v2) throw new Error('използване: pwa-update.mjs <swap> <v1> <v2> [порт]')
const url = `http://localhost:${port}/demo`
let fail = 0
const ok = (name, cond, extra = '') => {
  if (!cond) fail++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`)
}
for (const f of readdirSync(swap)) rmSync(join(swap, f), { recursive: true, force: true })
cpSync(v1, swap, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome' })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'bg-BG' })
const page = await ctx.newPage()
const foot = () => page.locator('footer.stay-foot').innerText().catch(() => '')
await page.goto(url, { waitUntil: 'load' })
await page.waitForTimeout(3500)
ok('v1: заредена, service worker е активен', !/V2/.test(await foot()) && (await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state)) === 'activated')
cpSync(v2, swap, { recursive: true, force: true }) // „деплой“ на v2
await page.goto(url, { waitUntil: 'load' })
ok('веднага след деплоя кешираната v1 още се показва (офлайн първо)', !/V2/.test(await foot()))
let updated = false
for (let i = 0; i < 12 && !updated; i++) {
  await page.waitForTimeout(1000)
  updated = /V2/.test(await foot())
}
ok('в рамките на 12 секунди страницата сама се обновява до v2', updated)
await browser.close()
process.exit(fail ? 1 : 0)
