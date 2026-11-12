/**
 * /robots.txt и /sitemap.xml с адрес от самата заявка — работят без промяна и на нов домейн.
 * Без този файл Netlify връща index.html (200) и за двата адреса, а търсачките го четат като „счупен“ robots.
 *
 * В картата на сайта са само публичните страници, които не зависят от потребител. Страниците /stay/<имот> на
 * клиентите не са вписани (списъкът им е в базата) — те се откриват през връзките, които собствениците споделят.
 */
export const SITEMAP_PATHS = ['/', '/signup'] // /demo е същото като / (canonical)

export function robotsTxt(origin) {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n')
}

export function sitemapXml(origin) {
  const urls = SITEMAP_PATHS.map((p) => `  <url><loc>${origin}${p}</loc></url>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}

export default async (request) => {
  const url = new URL(request.url)
  const headers = { 'cache-control': 'public, max-age=3600' }
  if (url.pathname === '/robots.txt') {
    return new Response(robotsTxt(url.origin), { headers: { ...headers, 'content-type': 'text/plain; charset=utf-8' } })
  }
  return new Response(sitemapXml(url.origin), { headers: { ...headers, 'content-type': 'application/xml; charset=utf-8' } })
}

export const config = { path: ['/robots.txt', '/sitemap.xml'] }
