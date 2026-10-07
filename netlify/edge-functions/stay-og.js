/**
 * Преглед на линка (OG тагове) за /stay/:slug. Viber/Facebook/WhatsApp не
 * изпълняват JavaScript, затова таговете от useListingSeo.js не им стигат —
 * тук ги вмъкваме в HTML-а на сървъра, преди страницата да тръгне.
 *
 * Чете само публичната public_property() с anon ключа (същия като в
 * браузъра) — никакъв service ключ, никакви непубликувани данни.
 * При каквато и да е грешка връща страницата непроменена.
 */
const SLUG_RE = /^[a-z0-9-]{2,40}$/

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function injectOg(html, property, url) {
  const title = `${property.name}${property.city ? ` — ${property.city}` : ''} | StayFlow`
  const description = (property.public_description || property.public_description_en || '').slice(0, 160)
  const image = property.cover_image_url || property.photos?.[0] || ''

  const tags = [
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    description && `<meta property="og:description" content="${esc(description)}" />`,
    image && `<meta property="og:image" content="${esc(image)}" />`,
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />`,
  ]
    .filter(Boolean)
    .join('\n    ')

  let out = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
  if (description) {
    out = out.replace(
      /<meta name="description" content="[^"]*"\s*\/?>/,
      `<meta name="description" content="${esc(description)}" />`
    )
  }
  return out.replace('</head>', `    ${tags}\n  </head>`)
}

export default async (request, context) => {
  const response = await context.next()

  const url = new URL(request.url)
  const slug = url.pathname.split('/')[2]
  if (!slug || !SLUG_RE.test(slug)) return response
  if (!(response.headers.get('content-type') || '').includes('text/html')) return response

  const supabaseUrl = Netlify.env.get('VITE_SUPABASE_URL')
  const anonKey = Netlify.env.get('VITE_SUPABASE_ANON_KEY')
  if (!supabaseUrl || !anonKey) return response

  let property
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/public_property`, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_slug: slug }),
    })
    if (!res.ok) return response
    property = (await res.json())[0]
  } catch {
    return response
  }
  if (!property) return response

  const html = injectOg(await response.text(), property, url.origin + url.pathname)
  const headers = new Headers(response.headers)
  headers.delete('content-length')
  return new Response(html, { status: response.status, headers })
}

export const config = { path: '/stay/*' }
