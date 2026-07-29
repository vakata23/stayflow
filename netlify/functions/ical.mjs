import { handleIcalRequest } from '../../src/lib/icalServer.js'

export default async (request) => {
  const url = new URL(request.url)

  const result = await handleIcalRequest({
    token: url.searchParams.get('token'),
    url: url.searchParams.get('url'),
    supabaseUrl: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
    supabaseKey: process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY,
  })

  return new Response(result.body, {
    status: result.status,
    headers: {
      'Content-Type': result.contentType,
      ...(result.headers || {}),
    },
  })
}

export const config = { path: '/api/ical' }
