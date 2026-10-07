import { handleAnalyzePhotos } from '../../src/lib/photoAnalysisServer.js'

/**
 * Background функция (до 15 мин) — клиентът веднага получава 202, а
 * резултатът се записва в ai_runs и браузърът го следи оттам. Тялото е само
 * { run_id } (лимитът за background е 256 KB); снимките Claude чете по URL.
 * ANTHROPIC_API_KEY е само в Netlify env, без VITE_ префикс.
 */
export default async (request) => {
  if (request.method !== 'POST') return
  let body = {}
  try {
    body = await request.json()
  } catch {
    return
  }

  const result = await handleAnalyzePhotos({
    token: (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''),
    runId: body.run_id,
    supabaseUrl: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  })
  console.log('analyze-photos', body.run_id, result.status, result.reason || result.error || '')
}

export const config = { path: '/api/analyze-photos', background: true }
