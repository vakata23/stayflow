/**
 * Акцентен цвят на публичната страница, изведен от корицата — в браузъра,
 * без AI. Бутоните са с бял текст върху акцента, а линковете/цената са в
 * акцента върху бяло, затова единственото условие е контраст ≥ 4.5:1 спрямо
 * бяло (WCAG AA за нормален текст). Ако цветът е твърде светъл, го
 * затъмняваме, докато мине.
 */

const MIN_CONTRAST = 4.5

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
}

function luminance([r, g, b]) {
  const lin = [r, g, b].map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
}

export function contrastWithWhite(hex) {
  return 1.05 / (luminance(hexToRgb(hex)) + 0.05)
}

function rgbToHsl([r, g, b]) {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h / 6, s, l]
}

function hslToRgb([h, s, l]) {
  if (s === 0) return [l * 255, l * 255, l * 255]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hue = (t) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return [hue(h + 1 / 3) * 255, hue(h) * 255, hue(h - 1 / 3) * 255]
}

/** Затъмнява (по HSL светлина), докато белият текст върху цвета стане четим. */
export function ensureContrast(hex) {
  const [h, s, l0] = rgbToHsl(hexToRgb(hex))
  let l = l0
  let out = hex
  while (contrastWithWhite(out) < MIN_CONTRAST && l > 0) {
    l = Math.max(0, l - 0.02)
    out = rgbToHex(hslToRgb([h, s, l]))
  }
  return out
}

function mix(hex, withRgb, amount) {
  const a = hexToRgb(hex)
  return rgbToHex(a.map((v, i) => v + (withRgb[i] - v) * amount))
}

/** Съотношение на контраст между два цвята (WCAG), 1…21. */
export function contrastRatio(hexA, hexB) {
  const a = luminance(hexToRgb(hexA))
  const b = luminance(hexToRgb(hexB))
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

const hslHex = (h, s, l) => rgbToHex(hslToRgb([h, s, l]))
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

/** Затъмнява цвета, докато стане четим (≥ min) върху даден светъл фон. */
export function ensureContrastOn(hex, bgHex, min = MIN_CONTRAST) {
  const [h, s, l0] = rgbToHsl(hexToRgb(hex))
  let l = l0
  let out = hex
  while (contrastRatio(out, bgHex) < min && l > 0) {
    l = Math.max(0, l - 0.02)
    out = hslHex(h, s, l)
  }
  return out
}

/**
 * Палитра „Златен час“ за публичната страница, изведена от един акцентен цвят:
 * хартия (светла, леко оцветена), мастило, приглушен текст и акцент. Всяка
 * комбинация текст/фон е с контраст ≥ 4.5:1:
 *   • accent — бял текст върху акцента (бутони);
 *   • accentText — акцентът като текст върху хартията и върху картите;
 *   • ink, muted — основен и второстепенен текст върху хартията и картите.
 * Без акцент се ползва основният тюркоаз на StayFlow.
 */
export function stayThemeVars(hex) {
  const base = hex || '#1b787c'
  const [h, s] = rgbToHsl(hexToRgb(base))
  const paper = hslHex(h, clamp(s * 0.45, 0.06, 0.26), 0.955)
  const paperDeep = hslHex(h, clamp(s * 0.5, 0.08, 0.3), 0.915)
  const ink = hslHex(h, clamp(s * 0.35, 0.08, 0.3), 0.09)
  const muted = ensureContrastOn(hslHex(h, clamp(s * 0.25, 0.06, 0.2), 0.42), paperDeep)
  const accent = ensureContrast(base)
  const accentText = ensureContrastOn(accent, paperDeep)
  const shade = hslToRgb([h, clamp(s * 0.55, 0.2, 0.5), 0.06]).map(Math.round).join(',')
  const glow = hslHex(h, clamp(s, 0.35, 0.7), 0.3)
  return {
    '--stay-accent': accent,
    '--stay-accent-text': accentText,
    '--stay-paper': paper,
    '--stay-paper-deep': paperDeep,
    '--stay-ink': ink,
    '--stay-muted': muted,
    '--stay-shade': shade,
    '--stay-glow': glow,
  }
}

/** CSS променливи за обвивка — пренасочват bg-brand-*, text-brand-* и т.н. */
export function accentCssVars(hex) {
  if (!hex) return undefined
  const white = [255, 255, 255]
  const black = [0, 0, 0]
  return {
    '--color-brand-50': mix(hex, white, 0.93),
    '--color-brand-100': mix(hex, white, 0.85),
    '--color-brand-200': mix(hex, white, 0.7),
    '--color-brand-300': mix(hex, white, 0.5),
    '--color-brand-400': mix(hex, white, 0.25),
    '--color-brand-500': mix(hex, white, 0.1),
    '--color-brand-600': hex,
    '--color-brand-700': mix(hex, black, 0.18),
    '--color-brand-800': mix(hex, black, 0.32),
  }
}

/**
 * Доминантен „цветен“ тон от пиксели [r,g,b,a,...]: групира в кофи по 5 бита
 * на канал, пропуска почти бели/черни/сиви пиксели (стени, таван, сенки) и
 * взема най-честата кофа. Ако снимката е почти безцветна — null.
 */
export function dominantColorFromPixels(data) {
  const buckets = new Map()
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue
    const rgb = [data[i], data[i + 1], data[i + 2]]
    const [, s, l] = rgbToHsl(rgb)
    if (s < 0.22 || l < 0.12 || l > 0.88) continue
    const key = ((rgb[0] >> 3) << 10) | ((rgb[1] >> 3) << 5) | (rgb[2] >> 3)
    const b = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
    b.n++
    b.r += rgb[0]
    b.g += rgb[1]
    b.b += rgb[2]
    buckets.set(key, b)
  }
  let best = null
  for (const b of buckets.values()) if (!best || b.n > best.n) best = b
  if (!best || best.n < 20) return null
  return rgbToHex([best.r / best.n, best.g / best.n, best.b / best.n])
}

/** Браузър: URL на снимка → акцент (с контраст) или null. Изисква CORS (Supabase Storage го дава). */
export async function accentFromImage(url) {
  const res = await fetch(url)
  const bitmap = await createImageBitmap(await res.blob())
  const size = 96
  const scale = Math.min(1, size / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close?.()
  const color = dominantColorFromPixels(ctx.getImageData(0, 0, canvas.width, canvas.height).data)
  return color ? ensureContrast(color) : null
}
