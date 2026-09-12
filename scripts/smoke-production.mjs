const base = new URL(process.env.CONSUMIT_SMOKE_URL ?? 'http://localhost:8080')
const request = async (path, init) => {
  const response = await fetch(new URL(path, base), init)
  if (!response.ok) throw new Error(`${path} returned ${response.status}`)
  return response
}

await request('/healthz')
const catalog = await request('/v1/titles/discover?kind=movie')
if (!/public/.test(catalog.headers.get('cache-control') ?? '')) throw new Error('Catalog response is not publicly cacheable.')

const privateResponse = await fetch(new URL('/v1/member/library', base))
if (!/private|no-store/.test(privateResponse.headers.get('cache-control') ?? '')) throw new Error('Member response is not private/no-store.')

if (process.env.CONSUMIT_SMOKE_PLAYBACK_BODY) {
  const playback = await request('/v1/playback/resolve', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: base.origin },
    body: process.env.CONSUMIT_SMOKE_PLAYBACK_BODY,
  })
  const session = await playback.json()
  if (!session?.source?.src?.startsWith('https://') || session.source.src.includes('/v1/playback/')) throw new Error('Playback did not return a direct HTTPS source.')
  if (!/private|no-store/.test(playback.headers.get('cache-control') ?? '')) throw new Error('Playback response is cacheable.')
}
console.log('Consumit production smoke checks passed.')
