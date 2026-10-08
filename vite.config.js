import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Обслужва /api/ical по време на локална разработка със същата логика,
 * която Netlify функцията ползва в production.
 */
function icalDevPlugin(env) {
  return {
    name: 'stayflow-ical-dev',
    configureServer(server) {
      server.middlewares.use('/api/ical', async (req, res) => {
        const { handleIcalRequest } = await server.ssrLoadModule('/src/lib/icalServer.js')
        const query = new URL(req.url, 'http://localhost').searchParams

        const result = await handleIcalRequest({
          token: query.get('token'),
          url: query.get('url'),
          supabaseUrl: env.VITE_SUPABASE_URL,
          supabaseKey: env.VITE_SUPABASE_ANON_KEY,
        })

        res.statusCode = result.status
        res.setHeader('Content-Type', result.contentType)
        res.end(result.body)
      })
    },
  }
}

/**
 * Обслужва /api/booking-request локално — изисква SUPABASE_SERVICE_ROLE_KEY
 * в .env (БЕЗ VITE_ префикс, затова никога не се пакетира в клиентския код).
 * Без него връща 500 — иначе логиката е идентична с production.
 */
function bookingRequestDevPlugin(env) {
  return {
    name: 'stayflow-booking-request-dev',
    configureServer(server) {
      server.middlewares.use('/api/booking-request', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method not allowed')
          return
        }

        const chunks = []
        for await (const chunk of req) chunks.push(chunk)
        let payload
        try {
          payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
        } catch {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: false, error: 'Невалидни данни.' }))
          return
        }

        const { handleBookingRequest } = await server.ssrLoadModule('/src/lib/bookingRequestServer.js')
        const result = await handleBookingRequest({
          payload,
          ip: req.socket?.remoteAddress,
          supabaseUrl: env.VITE_SUPABASE_URL,
          serviceKey: env.SUPABASE_SERVICE_ROLE_KEY,
          telegramToken: env.TELEGRAM_BOT_TOKEN,
          resendApiKey: env.RESEND_API_KEY,
          resendFrom: env.RESEND_FROM_EMAIL,
          appUrl: env.VITE_PUBLIC_URL || 'http://localhost:5173',
        })

        res.statusCode = result.status
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(result.body))
      })
    },
  }
}

/**
 * Обслужва /api/process-outbox локално — ръчно задействане на доставката
 * (бутонът "Изпрати тестово" в /notifications), със същата JWT проверка
 * като production (netlify/functions/process-outbox.mjs). Планираната
 * доставка (process-outbox-scheduled.mjs) няма локален еквивалент — пуска
 * се само на Netlify по разписание.
 */
function processOutboxDevPlugin(env) {
  return {
    name: 'stayflow-process-outbox-dev',
    configureServer(server) {
      server.middlewares.use('/api/process-outbox', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method not allowed')
          return
        }

        const { processQueuedOutbox, verifyOwnerProfile } = await server.ssrLoadModule('/src/lib/outboxProcessor.js')
        const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
        const profileId = await verifyOwnerProfile({
          token,
          supabaseUrl: env.VITE_SUPABASE_URL,
          serviceKey: env.SUPABASE_SERVICE_ROLE_KEY,
        })
        if (!profileId) {
          res.statusCode = 401
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: false, error: 'Unauthorized' }))
          return
        }

        const result = await processQueuedOutbox({
          supabaseUrl: env.VITE_SUPABASE_URL,
          serviceKey: env.SUPABASE_SERVICE_ROLE_KEY,
          telegramToken: env.TELEGRAM_BOT_TOKEN,
          resendApiKey: env.RESEND_API_KEY,
          resendFrom: env.RESEND_FROM_EMAIL,
          appUrl: env.VITE_PUBLIC_URL || 'http://localhost:5173',
          profileId,
          limit: 20,
        })

        res.statusCode = result.error ? 500 : 200
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(result))
      })
    },
  }
}

/**
 * /api/analyze-photos локално — като Netlify background функцията: отговаря
 * веднага 202 и обработва във фона; резултатът е в ai_runs.
 */
function analyzePhotosDevPlugin(env) {
  return {
    name: 'stayflow-analyze-photos-dev',
    configureServer(server) {
      server.middlewares.use('/api/analyze-photos', async (req, res) => {
        const chunks = []
        for await (const chunk of req) chunks.push(chunk)
        let body = {}
        try {
          body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
        } catch {
          /* празно тяло — handleAnalyzePhotos ще го откаже */
        }
        res.statusCode = 202
        res.end()

        const { handleAnalyzePhotos } = await server.ssrLoadModule('/src/lib/photoAnalysisServer.js')
        const result = await handleAnalyzePhotos({
          token: (req.headers.authorization || '').replace(/^Bearer\s+/i, ''),
          runId: body.run_id,
          supabaseUrl: env.VITE_SUPABASE_URL,
          serviceKey: env.SUPABASE_SERVICE_ROLE_KEY,
          anthropicApiKey: env.ANTHROPIC_API_KEY,
        })
        console.log('[analyze-photos]', body.run_id, result.status, result.reason || result.error || '')
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      react(),
      tailwindcss(),
      icalDevPlugin(env),
      bookingRequestDevPlugin(env),
      processOutboxDevPlugin(env),
      analyzePhotosDevPlugin(env),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['apple-touch-icon.png', 'favicon-32.png'],
        manifest: {
          name: 'StayFlow — Управление на имоти',
          short_name: 'StayFlow',
          description:
            'Управление на краткосрочни наеми — резервации, календар, почистване, фактури.',
          lang: 'bg',
          theme_color: '#1b787c',
          background_color: '#f6f9f9',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          scope: '/',
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // Прекешираме app shell-а (JS/CSS/HTML/икони) и шрифта на интерфейса
          // Onest (~78 KB, за да не мига текстът офлайн). Шрифтът за фактурите
          // (Roboto, 515KB) се тегли при нужда — не бива да тежи в SW.
          globPatterns: ['**/*.{js,css,html,png,svg,ico}', 'fonts/onest-*.woff2'],
          globIgnores: ['**/fonts/Roboto*'],
          // API заявките към Supabase и /api/ical никога не се кешират.
          navigateFallbackDenylist: [/^\/api\//],
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        },
      }),
    ],
  }
})
