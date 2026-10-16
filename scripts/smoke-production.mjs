import { pathToFileURL } from 'node:url'
import { apiErrorResponseSchema, catalogPageSchema, playbackSessionSchema } from '../packages/contracts/src/index.ts'

export async function smokeProduction(baseUrl, playbackBody, fetcher = fetch) {
  const base = new URL(baseUrl)
  const request = async (path, init) => {
    const response = await fetcher(new URL(path, base), { ...init, cache: 'no-store', signal: AbortSignal.timeout(path.startsWith('/v1/playback/') ? 70_000 : 15_000) })
    if (!response.ok) throw new Error(`${path} returned ${response.status}`)
    return response
  }

  await request('/healthz')
  const ready = await request('/health/ready')
  if (!/no-store/.test(ready.headers.get('cache-control') ?? '') || /^(HIT|STALE|UPDATING|REVALIDATED)$/i.test(ready.headers.get('cf-cache-status') ?? '') || ready.headers.has('age')) throw new Error('API readiness was cached at the gateway or edge.')
  const web = await request('/')
  if (web.headers.get('x-content-type-options') !== 'nosniff') throw new Error('Web security headers are missing.')
  const catalog = await request('/v1/titles/discover?kind=movie')
  if (!/public/.test(catalog.headers.get('cache-control') ?? '')) throw new Error('Catalog response is not publicly cacheable.')
  catalogPageSchema.parse(await catalog.json())

  const privateResponse = await fetcher(new URL('/v1/me/library', base), { cache: 'no-store', signal: AbortSignal.timeout(15_000) })
  const privateBody = apiErrorResponseSchema.parse(await privateResponse.json())
  if (privateResponse.status !== 401 || privateBody.error.code !== 'UNAUTHENTICATED') throw new Error('Anonymous member access was not rejected correctly.')
  if (!/private|no-store/.test(privateResponse.headers.get('cache-control') ?? '')) throw new Error('Member response is not private/no-store.')

  if (playbackBody) {
    const playback = await request('/v1/playback/resolve', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: base.origin },
      body: playbackBody,
    })
    const session = playbackSessionSchema.parse(await playback.json())
    const source = new URL(session.source.src)
    if (source.protocol !== 'https:' || source.username || source.password) throw new Error('Playback did not return a validated HTTPS source.')
    if (!/private|no-store/.test(playback.headers.get('cache-control') ?? '')) throw new Error('Playback response is cacheable.')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await smokeProduction(process.env.CONSUMIT_SMOKE_URL ?? 'http://localhost:8080', process.env.CONSUMIT_SMOKE_PLAYBACK_BODY)
  console.log('Consumit production smoke checks passed.')
}
