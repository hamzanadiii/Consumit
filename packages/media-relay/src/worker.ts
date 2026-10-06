import { createGrantCodec, exactMediaHost, relayDestination, type GrantCodec, type RelayGrant } from './grants.ts'
import { bingeFetchUrl, decodeRelayManifest } from './bingebang.ts'
import { mediaHeaders } from './provider-headers.ts'
import { createPublicHostCheck } from './public-host.ts'
import { rewriteRelayManifest } from './manifest.ts'

export type RelayEnv = { RELAY_ENABLED: string; RELAY_SECRET: string; APP_ORIGIN: string; RELAY_PROVIDERS: string; RELAY_DISCOVERY_PROVIDERS?: string }
type Dependencies = { fetch?: typeof fetch; now?: () => number; verifyPublicHost?: (host: string, signal: AbortSignal) => Promise<void>; report?: (entry: { provider: string; kind: string; status: number; bytes: number; bytesKnown: boolean; durationMs: number }) => void }
const MAX_MANIFEST_BYTES = 512 * 1024
function policies(raw: string): Record<string, string[]> {
  const value: unknown = JSON.parse(raw)
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid relay policy.')
  const entries = Object.entries(value)
  if (entries.length > 64 || entries.some(([id, hosts]) => !/^[a-z0-9-]{1,40}$/.test(id) || !Array.isArray(hosts)
      || !hosts.length || hosts.length > 100 || hosts.some(host => typeof host !== 'string' || !exactMediaHost(host)))) throw new Error('Invalid relay policy.')
  return Object.fromEntries(entries)
}
async function boundedManifest(response: Response, limit = MAX_MANIFEST_BYTES) {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Missing manifest.')
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.length
      if (length > limit) throw new Error('Manifest exceeds limit.')
      chunks.push(value)
    }
  } finally { await reader.cancel().catch(() => undefined) }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return bytes
}
// These two reviewed origins mislabel TS segments as HTML. Verify three
// transport sync bytes before streaming; genuine HTML still fails closed.
async function verifiedTsPrefix(response: Response) {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Missing media.')
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (length < 377) {
      const chunk = await reader.read()
      if (chunk.done) break
      chunks.push(chunk.value); length += chunk.value.length
    }
    const prefix = new Uint8Array(377)
    let offset = 0
    for (const chunk of chunks) { const part = chunk.subarray(0, 377 - offset); prefix.set(part, offset); offset += part.length }
    if (length < 377 || prefix[0] !== 0x47 || prefix[188] !== 0x47 || prefix[376] !== 0x47) throw new Error('Invalid TS media.')
  } catch (error) { await reader.cancel().catch(() => undefined); throw error }
  reader.releaseLock()
  return chunks
}
/** Separate from Fastify: media is streamed at the edge, never through API. */
export function createRelayWorker(deps: Dependencies = {}) {
  const upstreamFetch = deps.fetch ?? fetch
  const now = deps.now ?? Date.now
  const verifyPublicHost = deps.verifyPublicHost ?? createPublicHostCheck()
  let cached: { secret: string; codec: Promise<GrantCodec> } | undefined
  return {
    async fetch(request: Request, env: RelayEnv): Promise<Response> {
      const headers = new Headers({ 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', vary: 'Origin' })
      const fail = (status: number) => new Response('Media unavailable.', { status, headers })
      if (env.RELAY_ENABLED !== 'true') return fail(503)
      if (request.headers.get('origin') && request.headers.get('origin') !== env.APP_ORIGIN) return fail(403)
      headers.set('access-control-allow-origin', env.APP_ORIGIN)
      headers.set('access-control-allow-methods', 'GET, HEAD, OPTIONS')
      headers.set('access-control-allow-headers', 'Range')
      headers.set('access-control-expose-headers', 'Content-Length, Content-Range, Accept-Ranges')
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
      if (!['GET', 'HEAD'].includes(request.method)) return fail(405)
      const path = new URL(request.url)
      if (!path.pathname.startsWith('/media/') || path.search) return fail(404)
      let grant: RelayGrant, hosts: string[], staticHosts: string[], codec: GrantCodec
      try {
        if (!cached || cached.secret !== env.RELAY_SECRET) cached = { secret: env.RELAY_SECRET, codec: createGrantCodec(env.RELAY_SECRET) }
        codec = await cached.codec
        grant = await codec.open(path.pathname.slice(7), now())
        staticHosts = policies(env.RELAY_PROVIDERS)[grant.provider] ?? []
        hosts = staticHosts
        if (grant.recipe) {
          const discovery = JSON.parse(env.RELAY_DISCOVERY_PROVIDERS ?? '{}') as Record<string, string>
          const reviewed = grant.provider === 'stormboron' && grant.recipe === 'storm-boron-v1'
            || ['wecollege-miami', 'wecollege-boise'].includes(grant.provider) && grant.recipe === 'wecollege-city-v1'
          if (!staticHosts.length || !reviewed || discovery[grant.provider] !== grant.recipe || !grant.hosts?.length) return fail(403)
          hosts = grant.hosts
        }
        if (grant.origin !== env.APP_ORIGIN || !relayDestination(grant.url, hosts)) return fail(403)
      } catch { return fail(403) }
      const range = request.headers.get('range')
      if (range && !/^bytes=(?:\d+-\d*|-\d+)$/.test(range)) return fail(416)
      const abort = new AbortController()
      const signal = AbortSignal.any([request.signal, abort.signal])
      let timer = setTimeout(() => abort.abort(), 10_000)
      const started = now()
      let bytes = 0, status = 502, kind = 'media'
      let bytesKnown = true
      const report = () => { try { deps.report?.({ provider: grant.provider, kind, status, bytes, bytesKnown, durationMs: Math.max(0, now() - started) }) } catch { /* Telemetry cannot interrupt playback. */ } }
      try {
        let url = bingeFetchUrl(grant.provider, grant.url, grant.kind === 'hls')
        let response: Response | undefined
        for (let redirects = 0; redirects <= 3; redirects++) {
          if (!relayDestination(url, hosts)) throw new Error('Blocked redirect.')
          if (grant.recipe && !staticHosts.includes(new URL(url).hostname)) await verifyPublicHost(new URL(url).hostname, signal)
          const outgoing = new Headers(mediaHeaders(grant.provider, new URL(url).hostname, grant.headerHost, grant.headers, grant.recipe))
          outgoing.set('accept-encoding', 'identity')
          if (!outgoing.has('user-agent')) outgoing.set('user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36')
          if (range) outgoing.set('range', range)
          response = await upstreamFetch(url, { method: request.method, headers: outgoing, redirect: 'manual', signal, cache: 'no-store' })
          if (![301, 302, 303, 307, 308].includes(response.status)) break
          await response.body?.cancel()
          const location = response.headers.get('location')
          if (!location || redirects === 3) throw new Error('Invalid redirect.')
          url = new URL(location, url).href
        }
        status = response!.status
        if (![200, 206, 416].includes(status)) { await response!.body?.cancel(); clearTimeout(timer); report(); return fail(status === 403 ? 403 : 502) }
        const mislabelledTs = grant.kind !== 'hls' && /text\/html/i.test(response!.headers.get('content-type') ?? '')
          && ((grant.provider === 'stormboron' && (grant.recipe === 'storm-boron-v1' || ['celestialdreamer.lol', 'moonfirekeeper.lol', 'emberwindkeeper.lol'].includes(new URL(url).hostname)))
            || (['zeta', 'vidnest', 'vaplayer'].includes(grant.provider) && new URL(url).hostname === 'remoteconsultinggroup.site'))
        const prefix = mislabelledTs ? await verifiedTsPrefix(response!) : []
        const contentType = mislabelledTs ? 'video/mp2t' : response!.headers.get('content-type') ?? ''
        if (/text\/html|application\/(?:json|javascript)/i.test(contentType)) throw new Error('Invalid media.')
        const manifest = grant.kind === 'hls' || grant.kind === 'auto' && (/mpegurl/i.test(contentType) || new URL(url).pathname.endsWith('.m3u8'))
        kind = manifest ? 'manifest' : 'media'
        if (manifest && range) { await response!.body?.cancel(); clearTimeout(timer); status = 416; report(); return fail(416) }
        if (manifest && request.method !== 'HEAD' && status === 200) {
          const text = decodeRelayManifest(await boundedManifest(response!, grant.provider === 'bingebangymovies' ? 1024 * 1024 : MAX_MANIFEST_BYTES), grant.provider, url)
          const rewritten = await rewriteRelayManifest(text, url, grant, hosts, codec, path.origin, now())
          clearTimeout(timer)
          headers.set('content-type', 'application/vnd.apple.mpegurl')
          bytes = new TextEncoder().encode(rewritten).length
          report()
          return new Response(rewritten, { status: 200, headers })
        }
        for (const name of ['content-length', 'content-range', 'accept-ranges']) {
          if (name === 'content-length' && response!.headers.get('content-encoding') && response!.headers.get('content-encoding') !== 'identity') continue
          const value = response!.headers.get(name)
          if (value) headers.set(name, value)
        }
        headers.set('content-type', /^(?:video|audio)\//i.test(contentType) ? contentType : 'application/octet-stream')
        clearTimeout(timer)
        if (request.method === 'HEAD' || !response!.body || status === 416) { await response!.body?.cancel(); report(); return new Response(null, { status, headers }) }
        // HLS assets can be large. Keep their byte transfer in workerd rather
        // than allocating a JS promise/timer for every network chunk. Native
        // video keeps the idle-bounded path below because a whole movie can
        // legitimately stream longer than the asset transfer deadline.
        const NativeIdentity = (globalThis as typeof globalThis & {
          IdentityTransformStream?: new () => { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> }
        }).IdentityTransformStream
        if (grant.kind === 'auto' && NativeIdentity) {
          const lengthHeader = headers.get('content-length')
          const length = lengthHeader === null ? undefined : Number(lengthHeader)
          const NativeFixed = (globalThis as typeof globalThis & {
            FixedLengthStream?: new (length: number) => { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> }
          }).FixedLengthStream
          const knownLength = length !== undefined && Number.isSafeInteger(length) && length >= 0 ? length : undefined
          const fixed = knownLength !== undefined && NativeFixed
          const pipe = fixed ? new NativeFixed(knownLength) : new NativeIdentity()
          bytesKnown = false
          timer = setTimeout(() => abort.abort(new Error('Media transfer deadline exceeded.')), 60_000)
          // Verification consumes only the prefix. Put it back once, then
          // let workerd carry the untouched remainder without JS per chunk.
          const transfer = async () => {
            if (prefix.length) {
              const writer = pipe.writable.getWriter()
              try { for (const chunk of prefix) { signal.throwIfAborted(); await writer.write(chunk) } }
              finally { writer.releaseLock() }
            }
            await response!.body!.pipeTo(pipe.writable, { signal })
          }
          void transfer().then(() => {
            if (fixed) { bytes = knownLength!; bytesKnown = true }
          }, async error => {
            status = request.signal.aborted ? 499 : 504
            await response!.body?.cancel(error).catch(() => undefined)
            await pipe.writable.abort(error).catch(() => undefined)
          }).finally(() => { clearTimeout(timer); report() })
          return new Response(pipe.readable, { status, headers })
        }
        const reader = response!.body.getReader()
        let finished = false
        const finish = () => { if (!finished) { finished = true; clearTimeout(timer); report() } }
        const body = new ReadableStream<Uint8Array>({
          async pull(controller) {
            try {
              const chunk = await Promise.race([
                prefix.length ? Promise.resolve({ value: prefix.shift()!, done: false }) : reader.read(),
                new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { abort.abort(); reject(new Error('Media transfer stalled.')) }, 15_000) }),
              ])
              clearTimeout(timer)
              if (chunk.done) { controller.close(); finish() }
              else { bytes += chunk.value.length; controller.enqueue(chunk.value) }
            } catch { void reader.cancel().catch(() => undefined); status = 504; controller.error(new Error('Media transfer failed.')); finish() }
          },
          async cancel(reason) { abort.abort(); await reader.cancel(reason).catch(() => undefined); finish() },
        })
        return new Response(body, { status, headers })
      } catch { abort.abort(); clearTimeout(timer); status = 502; report(); return fail(502) }
    },
  }
}
export default createRelayWorker({ report: entry => console.log(JSON.stringify({ event: 'relay.request', ...entry })) })
