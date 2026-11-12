/**
 * Заглавие, описание и преглед на линка (Open Graph) за публичните страници на StayFlow — /, /login, /signup, /demo.
 * Viber/Facebook/WhatsApp/Google не винаги изпълняват JavaScript, затова ги вмъкваме в HTML-а на сървъра,
 * както stay-og.js прави за /stay/:slug. Адресът (origin) се взима от самата заявка, така че работи и на нов домейн.
 * При каквато и да е грешка страницата се връща непроменена.
 */
export const OG_IMAGE_PATH = '/og-default.png'

// Текстовете на /demo трябва да са същите като PAGE_TITLE/PAGE_DESC в src/pages/demo/DemoHome.jsx
// (scripts/test-site-meta.mjs го проверява).
export const PAGES = {
  '/': {
    title: 'StayFlow — Управление на краткосрочни наеми',
    description: 'Управление на краткосрочни наеми — резервации, календар, почистване, фактури.',
  },
  '/login': {
    title: 'Вход | StayFlow',
    description: 'Вход в StayFlow — управление на краткосрочни наеми.',
    noindex: true,
  },
  '/signup': {
    title: 'Регистрация | StayFlow',
    description: 'Създайте акаунт в StayFlow и добавете първия си имот: резервации, календар, почистване и фактури на едно място.',
  },
  '/demo': {
    title: 'Вижте какво има вътре — демо на StayFlow, без регистрация',
    description:
      'Разгледайте StayFlow преди да се регистрирате: истинските екрани — табло, календар, резервации, приходи — и примерни страници за гости със сезонни цени и оферти.',
  },
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** '/login/' → '/login'; '/' остава '/'. */
export function normalizePath(pathname) {
  const p = (pathname || '/').replace(/\/+$/, '')
  return p === '' ? '/' : p
}

export function injectMeta(html, page, origin, pathname) {
  const path = normalizePath(pathname)
  const url = origin + (path === '/' ? '/' : path)
  const image = origin + OG_IMAGE_PATH

  const tags = [
    `<link rel="canonical" href="${esc(url)}" />`,
    page.noindex && `<meta name="robots" content="noindex, follow" />`,
    `<meta property="og:site_name" content="StayFlow" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:locale" content="bg_BG" />`,
    `<meta property="og:title" content="${esc(page.title)}" />`,
    `<meta property="og:description" content="${esc(page.description)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="StayFlow — управление на краткосрочни наеми" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
  ]
    .filter(Boolean)
    .join('\n    ')

  let out = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(page.title)}</title>`)
  out = out.replace(/<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${esc(page.description)}" />`)
  return out.replace('</head>', `    ${tags}\n  </head>`)
}

export default async (request, context) => {
  const response = await context.next()
  try {
    const url = new URL(request.url)
    const page = PAGES[normalizePath(url.pathname)]
    if (!page) return response
    if (response.status !== 200) return response
    if (!(response.headers.get('content-type') || '').includes('text/html')) return response

    const html = injectMeta(await response.clone().text(), page, url.origin, url.pathname)
    const headers = new Headers(response.headers)
    headers.delete('content-length')
    return new Response(html, { status: 200, headers })
  } catch {
    return response
  }
}

export const config = { path: ['/', '/login', '/signup', '/demo'] }
