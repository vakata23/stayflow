// Тестова среда: статичен билд + имитация на Supabase (auth, REST/PostgREST, RPC) с български данни.
//   node harness/server.mjs <dist> [port]
// Приложението се билдва с VITE_SUPABASE_URL=http://localhost:<port> — така ProtectedRoute остава НЕДОКОСНАТ,
// а „влизането“ е само фалшива сесия в localStorage, която ползва настоящия код както си е.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { TABLES, RPC, USER } from './seed.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const [, , distArg, port = '4174'] = process.argv
const root = path.resolve(distArg)
const origin = `http://localhost:${port}`

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.ico': 'image/x-icon' }
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.webmanifest', '.svg'])
const cache = new Map()
const unmatched = new Set()

function send(res, status, body, headers = {}) {
  const buf = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers })
  res.end(buf)
}
const readBody = (req) => new Promise((resolve) => { let s = ''; req.on('data', (c) => (s += c)); req.on('end', () => resolve(s)) })

// Банерът за бисквитки би закрил екрани и би пречил на всички по-стари проверки, затова тестовата среда
// предварително „приема“ — освен когато заявката има заглавие x-consent-fresh (scripts/visual/legal.mjs).
const CONSENT_SCRIPT = `<script>try{if(!localStorage.getItem('stayflow.consent'))localStorage.setItem('stayflow.consent',JSON.stringify({v:1,choice:'all',at:'2026-01-01T00:00:00.000Z'}))}catch(e){}</script>`

function serveFile(req, res, file, immutable) {
  const ext = path.extname(file)
  const enc = COMPRESSIBLE.has(ext) && /\bbr\b/.test(req.headers['accept-encoding'] || '') ? 'br' : null
  const key = `${file}|${enc}`
  let body = immutable ? cache.get(key) : null
  if (!body) {
    body = fs.readFileSync(file)
    if (ext === '.html' && !req.headers['x-consent-fresh']) body = Buffer.from(body.toString('utf8').replace('</head>', `${CONSENT_SCRIPT}</head>`))
    if (enc) body = zlib.brotliCompressSync(body, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } })
    if (immutable) cache.set(key, body)
  }
  const headers = { 'content-type': MIME[ext] || 'application/octet-stream', 'content-length': body.length, 'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate' }
  if (enc) headers['content-encoding'] = enc
  res.writeHead(200, headers)
  res.end(body)
}

// ---- PostgREST (подмножество): филтри, order, limit, вграждане, count
const cmp = (a, b) => {
  if (a == null || b == null) return 0
  const na = Number(a), nb = Number(b)
  if (!Number.isNaN(na) && !Number.isNaN(nb) && String(a).trim() !== '' && /^-?\d+(\.\d+)?$/.test(String(a)) && /^-?\d+(\.\d+)?$/.test(String(b))) return na - nb
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0
}
function applyFilter(rows, col, spec) {
  const dot = spec.indexOf('.')
  const op = spec.slice(0, dot)
  const val = spec.slice(dot + 1)
  switch (op) {
    case 'eq': return rows.filter((r) => String(r[col]) === val)
    case 'neq': return rows.filter((r) => String(r[col]) !== val)
    case 'gt': return rows.filter((r) => cmp(r[col], val) > 0)
    case 'gte': return rows.filter((r) => cmp(r[col], val) >= 0)
    case 'lt': return rows.filter((r) => cmp(r[col], val) < 0)
    case 'lte': return rows.filter((r) => cmp(r[col], val) <= 0)
    case 'in': { const set = val.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '')); return rows.filter((r) => set.includes(String(r[col]))) }
    case 'is': return rows.filter((r) => (val === 'null' ? r[col] == null : String(r[col]) === val))
    default: return rows
  }
}
const FK = { properties: 'property_id', bookings: 'booking_id', profiles: 'profile_id' }
function embed(rows, select) {
  const parts = []
  let depth = 0, cur = ''
  for (const ch of select) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = '' } else cur += ch
  }
  parts.push(cur.trim())
  const embeds = parts.map((p) => p.match(/^(\w+)\(/)).filter(Boolean).map((m) => m[1])
  if (!embeds.length) return rows
  return rows.map((r) => {
    const out = { ...r }
    for (const name of embeds) {
      const fk = FK[name]
      out[name] = fk && TABLES[name] ? TABLES[name].find((t) => t.id === r[fk]) ?? null : null
    }
    return out
  })
}

async function rest(req, res, url, table) {
  const rows0 = TABLES[table]
  if (!rows0) { unmatched.add('table:' + table); return send(res, 200, []) }
  if (req.method === 'POST' || req.method === 'PATCH' || req.method === 'DELETE') {
    const body = await readBody(req)
    const echo = /return=representation/.test(req.headers.prefer || '')
    if (req.method === 'DELETE') return send(res, 204, '')
    const data = body ? JSON.parse(body) : {}
    return echo ? send(res, 201, Array.isArray(data) ? data : [data]) : send(res, 201, '')
  }
  let rows = rows0.slice()
  const p = url.searchParams
  for (const [k, v] of p) {
    if (['select', 'order', 'limit', 'offset', 'or', 'and', 'not'].includes(k)) continue
    rows = applyFilter(rows, k, v)
  }
  const order = p.get('order')
  if (order) {
    const keys = order.split(',').map((o) => { const [c, d] = o.split('.'); return [c, d === 'desc' ? -1 : 1] })
    rows.sort((a, b) => { for (const [c, d] of keys) { const x = cmp(a[c], b[c]); if (x) return x * d } return 0 })
  }
  const total = rows.length
  if (p.get('limit')) rows = rows.slice(0, Number(p.get('limit')))
  rows = embed(rows, p.get('select') || '*')
  const headers = {}
  if (/count=/.test(req.headers.prefer || '')) headers['content-range'] = `0-${Math.max(0, total - 1)}/${total}`
  if (req.method === 'HEAD') { res.writeHead(200, { ...headers, 'content-type': 'application/json' }); return res.end() }
  if (/vnd\.pgrst\.object/.test(req.headers.accept || '')) {
    if (rows.length !== 1) return send(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }, headers)
    return send(res, 200, rows[0], headers)
  }
  return send(res, 200, rows, headers)
}

// ---- Платен достъп (миграция 016): състоянието на влезлия потребител се сменя от теста през /__mock/access?state=…
const sofiaPlus = (n) => {
  const d = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Sofia' }).format(new Date()) + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const ACCESS_STATES = {
  active: { status: 'active', plan: 'plus', active_until: null, is_admin: false },
  pending: { status: 'pending', plan: 'start', active_until: null, is_admin: false },
  suspended: { status: 'suspended', plan: 'plus', active_until: '2099-01-01', is_admin: false },
  expired: { status: 'active', plan: 'plus', active_until: '2020-01-01', is_admin: false },
  soon: { status: 'active', plan: 'plus', active_until: sofiaPlus(3), is_admin: false },
  admin: { status: 'active', plan: 'pro', active_until: null, is_admin: true },
  trial: { status: 'active', plan: 'start', active_until: sofiaPlus(3), is_admin: false, is_trial: true },
  trialend: { status: 'active', plan: 'start', active_until: '2020-01-01', is_admin: false, is_trial: true },
}
let accessState = 'active'
let accessMissing = false // true → функцията my_access „не съществува“ (миграция 016 непусната)
const requestsSent = []
const grantWrites = []
const adminClients = () => [
  { profile_id: 'p1', full_name: 'Мария Петрова', company_name: null, phone: '+359 888 100 200', email: 'maria@example.bg', created_at: '2026-11-01T10:00:00Z', property_count: 2, plan: 'start', status: 'active', active_until: sofiaPlus(40), is_trial: false, note: null },
  { profile_id: 'p2', full_name: 'Георги Димитров', company_name: 'Морски къщи ЕООД', phone: null, email: 'georgi@example.bg', created_at: '2026-11-10T10:00:00Z', property_count: 5, plan: 'plus', status: 'active', active_until: sofiaPlus(3), is_trial: false, note: null },
  { profile_id: 'p3', full_name: 'Елена Стоянова', company_name: null, phone: '+359 899 555 444', email: 'elena@example.bg', created_at: '2026-11-14T10:00:00Z', property_count: 0, plan: 'start', status: 'pending', active_until: null, is_trial: false, note: null },
  { profile_id: 'p4', full_name: 'Николай Иванов', company_name: null, phone: null, email: 'nikolay@example.bg', created_at: '2026-09-01T10:00:00Z', property_count: 1, plan: 'start', status: 'suspended', active_until: '2026-10-01', is_trial: false, note: 'Не е платил' },
  { profile_id: 'p5', full_name: 'Петя Колева', company_name: null, phone: '+359 877 000 111', email: 'petya@example.bg', created_at: '2026-11-13T10:00:00Z', property_count: 1, plan: 'start', status: 'active', active_until: sofiaPlus(5), is_trial: true, note: null },
]
const accessRequests = [
  { id: 'r1', created_at: '2026-11-14T09:00:00Z', name: 'Стефан Маринов', phone: '+359 877 123 456', email: null, property_band: '4-10', plan_interest: 'plus', note: 'Имам 6 апартамента във Варна', consent_at: '2026-11-14T09:00:00Z', wants_trial: true, status: 'new', admin_note: null },
  { id: 'r2', created_at: '2026-11-12T09:00:00Z', name: 'Anna Schmidt', phone: null, email: 'anna@example.de', property_band: '1-3', plan_interest: null, note: null, consent_at: '2026-11-12T09:00:00Z', wants_trial: false, status: 'contacted', admin_note: null },
]

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, origin)
  const p = url.pathname
  try {
    if (p === '/__unmatched') return send(res, 200, [...unmatched])
    if (p === '/__mock/access') {
      const st = url.searchParams.get('state')
      if (st === 'missing') accessMissing = true
      else if (ACCESS_STATES[st]) { accessState = st; accessMissing = false }
      return send(res, 200, { state: accessState, missing: accessMissing })
    }
    if (p === '/__mock/requests') { if (url.searchParams.get('clear')) requestsSent.length = 0; return send(res, 200, requestsSent) }
    if (p === '/__mock/grants') return send(res, 200, grantWrites)
    if (p.startsWith('/auth/v1/')) {
      if (p.endsWith('/user')) return send(res, 200, USER)
      if (p.endsWith('/logout')) return send(res, 204, '')
      return send(res, 200, { access_token: 'x.y.z', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: USER })
    }
    if (p.startsWith('/rest/v1/rpc/')) {
      const fn = p.split('/').pop()
      const body = req.method === 'POST' ? JSON.parse((await readBody(req)) || '{}') : {}
      if (fn === 'my_access') {
        if (accessMissing) return send(res, 404, { code: 'PGRST202', message: 'Could not find the function public.my_access' })
        return send(res, 200, [ACCESS_STATES[accessState]])
      }
      if (fn === 'admin_clients') return send(res, ACCESS_STATES[accessState].is_admin ? 200 : 403, ACCESS_STATES[accessState].is_admin ? adminClients() : { message: 'forbidden' })
      if (fn === 'request_access') {
        if (body.p_name === 'Fail') return send(res, 400, { code: 'P0001', message: 'too_many' })
        requestsSent.push(body)
        return send(res, 200, null)
      }
      if (!RPC[fn]) { unmatched.add('rpc:' + fn); return send(res, 200, null) }
      return send(res, 200, RPC[fn](body))
    }
    if (p === '/rest/v1/access_requests' && req.method === 'GET') return send(res, 200, accessRequests)
    if (p === '/rest/v1/access_grants' && req.method !== 'GET') { grantWrites.push({ method: req.method, body: JSON.parse((await readBody(req)) || 'null') }); return send(res, 201, '') }
    if (p === '/rest/v1/access_requests' && req.method === 'PATCH') { grantWrites.push({ method: 'PATCH-request', url: req.url, body: JSON.parse((await readBody(req)) || 'null') }); return send(res, 204, '') }
    if (p.startsWith('/rest/v1/')) return await rest(req, res, url, p.slice('/rest/v1/'.length))
    if (p.startsWith('/storage/v1/')) return send(res, 200, { signedURL: '/photos/full-116.webp' })
    if (p.startsWith('/photos/')) {
      // Самодостатъчен заместител на снимка: градиент от името (детерминиран), без външни файлове.
      const name = path.basename(p)
      let h = 0
      for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1067"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h} 38% 62%)"/><stop offset="1" stop-color="hsl(${(h + 40) % 360} 42% 28%)"/></linearGradient></defs><rect width="1600" height="1067" fill="url(#g)"/></svg>`
      res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=3600' })
      return res.end(svg)
    }
    if (p === '/api/booking-request') { await readBody(req); return send(res, 200, { ok: true }) }
    if (p.startsWith('/api/')) { await readBody(req); return send(res, 200, { ok: true }) }
    const file = path.join(root, path.normalize(p))
    if (file.startsWith(root) && fs.existsSync(file) && fs.statSync(file).isFile()) return serveFile(req, res, file, p.startsWith('/assets/'))
    return serveFile(req, res, path.join(root, 'index.html'), false)
  } catch (e) {
    console.error('harness error', req.method, req.url, e.message)
    send(res, 500, { message: e.message })
  }
})
server.listen(Number(port), () => console.log(`harness on ${origin} → ${root}`))
