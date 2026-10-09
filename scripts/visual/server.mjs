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

function serveFile(req, res, file, immutable) {
  const ext = path.extname(file)
  const enc = COMPRESSIBLE.has(ext) && /\bbr\b/.test(req.headers['accept-encoding'] || '') ? 'br' : null
  const key = `${file}|${enc}`
  let body = immutable ? cache.get(key) : null
  if (!body) {
    body = fs.readFileSync(file)
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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, origin)
  const p = url.pathname
  try {
    if (p === '/__unmatched') return send(res, 200, [...unmatched])
    if (p.startsWith('/auth/v1/')) {
      if (p.endsWith('/user')) return send(res, 200, USER)
      if (p.endsWith('/logout')) return send(res, 204, '')
      return send(res, 200, { access_token: 'x.y.z', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user: USER })
    }
    if (p.startsWith('/rest/v1/rpc/')) {
      const fn = p.split('/').pop()
      const body = req.method === 'POST' ? JSON.parse((await readBody(req)) || '{}') : {}
      if (!RPC[fn]) { unmatched.add('rpc:' + fn); return send(res, 200, null) }
      return send(res, 200, RPC[fn](body))
    }
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
