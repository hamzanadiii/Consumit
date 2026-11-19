import { createGrantCodec, exactMediaHost, relayDestination, type GrantCodec, type RelayGrant } from './grants.ts'
import { bingeFetchUrl, decodeRelayManifest } from './bingebang.ts'
import { mediaHeaders } from './provider-headers.ts'
import { createPublicHostCheck } from './public-host.ts'
import { rewriteRelayManifest } from './manifest.ts'
import { createLookmovieProvider } from '../../provider-sdk/src/adapters/lookmovie.ts'
import type { ProviderHttp, ProviderHttpResponse } from '../../provider-sdk/src/adapters/http.ts'
import { playbackRefSchema } from '@consumit/contracts'
import { z } from 'zod'

export type RelayEnv = { RELAY_ENABLED: string; RELAY_SECRET: string; APP_ORIGIN: string; RELAY_PROVIDERS: string; RELAY_DISCOVERY_PROVIDERS?: string; RELAY_ROUTE_VERSION?: string; RELAY_ROUTE_POLICY?: string; RELAY_ROUTE_POLICY_REQUIRED?: string }
type Dependencies = { fetch?: (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => ReturnType<typeof fetch>; now?: () => number; verifyPublicHost?: (host: string, signal: AbortSignal) => Promise<void>; report?: (entry: { provider: string; kind: string; status: number; bytes: number; bytesKnown: boolean; durationMs: number; stage: string; blockedHost?: string }) => void }
const MAX_MANIFEST_BYTES = 512 * 1024
// Reviewed VOD playlists are larger than the generic bound: NontonFlix and
// EmbedMaster publish multi-thousand-segment media playlists for feature
// films (measured 2.2 MB and 1.2 MB). Keep the expanded bound provider-scoped.
const LARGE_MANIFEST_PROVIDERS = new Set(['nontonflix', 'embedmaster'])
const LARGE_MANIFEST_BYTES = 4 * 1024 * 1024
// The checked Mapple 2160p child playlist is 531 KB, above the generic cap.
const MAPPLE_MANIFEST_BYTES = 2 * 1024 * 1024
const LOOKMOVIE_HOST = /^srv[0-9]+\.(?:[a-z-]+\.cyou|(?:faitioninthrey|superoled|cromning)\.site)$/
/** Constant-time bearer secret check so auth timing does not leak secret bytes. */
function authorized(request: Request, secret: string) {
  const actual = new TextEncoder().encode(request.headers.get('authorization') ?? '')
  const expected = new TextEncoder().encode(`Bearer ${secret}`)
  let diff = actual.length ^ expected.length
  for (let i = 0; i < Math.max(actual.length, expected.length); i++) diff |= (actual[i] ?? 0) ^ (expected[i] ?? 0)
  return diff === 0
}
function policies(raw: string): Record<string, string[]> {
  const value: unknown = JSON.parse(raw)
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid relay policy.')
  const entries = Object.entries(value)
  if (entries.length > 64 || entries.some(([id, hosts]) => !/^[a-z0-9-]{1,40}$/.test(id) || !Array.isArray(hosts)
      || !hosts.length || hosts.length > 100 || hosts.some(host => typeof host !== 'string' || !exactMediaHost(host)))) throw new Error('Invalid relay policy.')
  return Object.fromEntries(entries)
}
const relayRoutePolicySchema = z.array(z.object({
  version: z.string().regex(/^edge-v1-[a-f0-9]{16}$/), provider: z.string().regex(/^[a-z0-9-]{1,40}$/),
  kind: z.enum(['movie', 'series', 'anime']), region: z.string().regex(/^[A-Z]{2}$/), purpose: z.enum(['video', 'audio']),
  delivery: z.literal('relay'), media: z.string().url(), hosts: z.array(z.string().refine(exactMediaHost)).min(1).max(100),
}).strict()).max(384)
function routePolicyMatches(env: RelayEnv, grant: RelayGrant, staticHosts: readonly string[], mediaOrigin: string) {
  if (env.RELAY_ROUTE_POLICY_REQUIRED !== 'true') return true
  if (!grant.route || !grant.routeVersion || env.RELAY_ROUTE_VERSION !== grant.routeVersion) return false
  try {
    const routes = relayRoutePolicySchema.parse(JSON.parse(env.RELAY_ROUTE_POLICY ?? '[]'))
    const scoped = routes.find(route => route.version === grant.routeVersion && route.provider === grant.provider
      && route.kind === grant.route!.kind && route.region === grant.route!.region && route.purpose === grant.route!.purpose
      && route.delivery === 'relay' && route.media === mediaOrigin)
    if (!scoped) return false
    const expected = [...staticHosts].sort(), actual = [...scoped.hosts].sort()
    return expected.length === actual.length && expected.every((host, index) => host === actual[index])
  } catch { return false }
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
// Reviewed hosts mislabel media as HTML. Verify TS sync bytes or, only
// for Mapple, fragmented MP4 box structure; genuine HTML fails closed.
function fragmentedMp4Prefix(prefix: Uint8Array, length: number) {
  const view = new DataView(prefix.buffer, prefix.byteOffset, prefix.byteLength)
  const type = (at: number) => String.fromCharCode(...prefix.subarray(at + 4, at + 8))
  const size = (at: number) => view.getUint32(at)
  let at = 0
  const first = type(0)
  if (first === 'ftyp' || first === 'styp') {
    at = size(0)
    if (at < 16 || at > 256 || at % 4 || length < at + 16) return false
    const brand = String.fromCharCode(...prefix.subarray(8, 12))
    if (!['isom', 'iso5', 'iso6', 'mp41', 'mp42', 'dash', 'cmfc', 'cmfs', 'msdh', 'msix'].includes(brand)) return false
  }
  if (length < at + 32) return false
  const box = type(at), boxSize = size(at)
  if (boxSize < 32 || boxSize > 32 * 1024 * 1024) return false
  if (box === 'moof') return size(at + 8) === 16 && type(at + 8) === 'mfhd' && type(at + 24) === 'traf'
  return first === 'ftyp' && box === 'moov' && type(at + 8) === 'mvhd'
}
async function verifiedMediaPrefix(response: Response, allowFragmentedMp4 = false) {
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
    const ts = length >= 377 && prefix[0] === 0x47 && prefix[188] === 0x47 && prefix[376] === 0x47
    if (!ts && !(allowFragmentedMp4 && fragmentedMp4Prefix(prefix, length))) throw new Error('Invalid media prefix.')
    reader.releaseLock()
    return { chunks, contentType: ts ? 'video/mp2t' : 'video/mp4' }
  } catch (error) { await reader.cancel().catch(() => undefined); throw error }
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
      const path = new URL(request.url)
      if (path.pathname === '/v1/lookmovie/resolve') {
        if (request.method !== 'POST' || !authorized(request, env.RELAY_SECRET)) return fail(403)
        try {
          const raw = await request.text()
          if (raw.length > 4096) return fail(413)
          const input = JSON.parse(raw) as { title?: unknown; year?: unknown; ref?: unknown }
          if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 200
            || !Number.isInteger(input.year) || Number(input.year) < 1888 || Number(input.year) > 2200) return fail(400)
          const parsedRef = playbackRefSchema.safeParse(input.ref)
          if (!parsedRef.success) return fail(400)
          const ref = parsedRef.data
          if (ref.kind !== 'movie') return fail(400)
          const title = input.title.trim(), year = Number(input.year)
          let lastHop = 'none'
          const http = workerLookmovieHttp(upstreamFetch, verifyPublicHost, entry => { lastHop = `${entry.host}${entry.path}:${entry.status}` })
          const provider = createLookmovieProvider(http, async () => ({ title, year }), now, { id: 'lookmovie', relayHostDiscovery: true })
          const controller = new AbortController()
          const timer = setTimeout(() => controller.abort(new DOMException('LookMovie resolution timed out.', 'TimeoutError')), 24_000)
          try {
            const result = await provider.resolve({ ref, region: 'WW', audioLanguage: 'original' }, controller.signal)
            headers.set('content-type', 'application/json; charset=utf-8')
            if (!result.ok) headers.set('x-lookmovie-last-hop', lastHop)
            if (!result.ok) return new Response(JSON.stringify({ ok: false, code: result.code, retryable: result.retryable }), { status: result.code === 'empty' ? 404 : 502, headers })
            return new Response(JSON.stringify({ ok: true, sources: result.sources }), { status: 200, headers })
          } finally { clearTimeout(timer) }
        } catch { return fail(502) }
      }
      const control = path.pathname === '/v1/relay-manifest'
      let controlToken: string | undefined
      if (control) {
        if (request.method !== 'POST' || !authorized(request, env.RELAY_SECRET) || path.search) return fail(403)
        try {
          const raw = await boundedManifest(new Response(request.body), 4096)
          const input = JSON.parse(new TextDecoder().decode(raw)) as { grant?: unknown }
          if (typeof input.grant !== 'string' || input.grant.length > 3600) return fail(400)
          controlToken = input.grant
        } catch { return fail(400) }
      } else {
        if (!['GET', 'HEAD'].includes(request.method)) return fail(405)
        if (!path.pathname.startsWith('/media/') || path.search) return fail(404)
      }
      let grant: RelayGrant, hosts: string[], staticHosts: string[], codec: GrantCodec
      try {
        if (!cached || cached.secret !== env.RELAY_SECRET) cached = { secret: env.RELAY_SECRET, codec: createGrantCodec(env.RELAY_SECRET) }
        codec = await cached.codec
        grant = await codec.open(controlToken ?? path.pathname.slice(7), now())
        if ((env.RELAY_ROUTE_VERSION || grant.routeVersion) && (!env.RELAY_ROUTE_VERSION || grant.routeVersion !== env.RELAY_ROUTE_VERSION)) return fail(403)
        if (control && (grant.provider !== 'rigel' || grant.kind !== 'hls')) return fail(403)
        staticHosts = policies(env.RELAY_PROVIDERS)[grant.provider] ?? []
        if (!routePolicyMatches(env, grant, staticHosts, new URL(request.url).origin)) return fail(403)
        hosts = staticHosts
        if (grant.recipe) {
          const discovery = JSON.parse(env.RELAY_DISCOVERY_PROVIDERS ?? '{}') as Record<string, string>
          const reviewed = grant.provider === 'stormboron' && grant.recipe === 'storm-boron-v1'
            || ['wecollege-miami', 'wecollege-boise'].includes(grant.provider) && grant.recipe === 'wecollege-city-v1'
            || grant.provider === 'lookmovie' && grant.recipe === 'lookmovie-v1'
              && grant.hosts?.every(host => /^srv[0-9]+\.(?:[a-z-]+\.cyou|(?:faitioninthrey|superoled|cromning)\.site)$/.test(host))
            || grant.provider === 'aether' && grant.recipe === 'aether-v1'
              && grant.hosts?.every(host => /^(?:[a-z0-9-]+\.)+(?:cdn-)?tnmr\.org$/.test(host))
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
      let bytes = 0, status = 502, kind = 'media', stage = 'grant', blockedHost: string | undefined
      let bytesKnown = true
      const report = () => { try { deps.report?.({ provider: grant.provider, kind, status, bytes, bytesKnown, durationMs: Math.max(0, now() - started), stage, ...(blockedHost ? { blockedHost } : {}) }) } catch { /* Telemetry cannot interrupt playback. */ } }
      try {
        let url = bingeFetchUrl(grant.provider, grant.url, grant.kind === 'hls')
        let response: Response | undefined
        for (let redirects = 0; redirects <= 3; redirects++) {
          if (!relayDestination(url, hosts)) throw new Error('Blocked redirect.')
          if (grant.recipe && !staticHosts.includes(new URL(url).hostname)) { stage = 'dns-check'; await verifyPublicHost(new URL(url).hostname, signal) }
          const outgoing = new Headers(mediaHeaders(grant.provider, new URL(url).hostname, grant.headerHost, grant.headers, grant.recipe))
          outgoing.set('accept-encoding', 'identity')
          if (!outgoing.has('user-agent')) outgoing.set('user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36')
          if (range) outgoing.set('range', range)
          stage = 'upstream-fetch'
          response = await upstreamFetch(url, { method: control ? 'GET' : request.method, headers: outgoing, redirect: 'manual', signal, cache: 'no-store' })
          stage = 'upstream-response'
          if (![301, 302, 303, 307, 308].includes(response.status)) break
          await response.body?.cancel()
          const location = response.headers.get('location')
          if (!location || redirects === 3) throw new Error('Invalid redirect.')
          url = new URL(location, url).href
        }
        status = response!.status
        if (![200, 206, 416].includes(status)) { await response!.body?.cancel(); clearTimeout(timer); report(); return fail(status === 403 ? 403 : 502) }
        const mislabelledMedia = grant.kind !== 'hls' && /text\/html/i.test(response!.headers.get('content-type') ?? '')
          && ((grant.provider === 'stormboron' && (grant.recipe === 'storm-boron-v1' || ['celestialdreamer.lol', 'moonfirekeeper.lol', 'emberwindkeeper.lol'].includes(new URL(url).hostname)))
            || (grant.provider === 'embedmaster' && new URL(url).hostname === 'perfectbussines.website')
            || (['zeta', 'vidnest', 'vaplayer'].includes(grant.provider) && new URL(url).hostname === 'remoteconsultinggroup.site')
            || (grant.provider === 'mapple' && ['source.jordanblackwell.bid', 'proxy2.jordanblackwell.bid'].includes(new URL(url).hostname)))
        const verified = mislabelledMedia ? await verifiedMediaPrefix(response!, grant.provider === 'mapple') : undefined
        const prefix = verified?.chunks ?? []
        const contentType = verified?.contentType ?? response!.headers.get('content-type') ?? ''
        if (/text\/html|application\/(?:json|javascript)/i.test(contentType)) throw new Error('Invalid media.')
        const manifest = grant.kind === 'hls' || grant.kind === 'auto' && (/mpegurl/i.test(contentType) || new URL(url).pathname.endsWith('.m3u8'))
        kind = manifest ? 'manifest' : 'media'
        if (manifest && range) { await response!.body?.cancel(); clearTimeout(timer); status = 416; report(); return fail(416) }
        if (manifest && request.method !== 'HEAD' && status === 200) {
          stage = 'manifest-read'
          const text = decodeRelayManifest(await boundedManifest(response!, control ? 2 * 1024 * 1024
            : grant.provider === 'mapple' ? MAPPLE_MANIFEST_BYTES
            : LARGE_MANIFEST_PROVIDERS.has(grant.provider) ? LARGE_MANIFEST_BYTES
              : ['bingebangymovies', 'rigel'].includes(grant.provider) ? 1024 * 1024
                : MAX_MANIFEST_BYTES), grant.provider, url)
          if (control) {
            if (!text.startsWith('#EXTM3U')) throw new Error('Invalid control playlist.')
            clearTimeout(timer)
            headers.set('content-type', 'application/vnd.apple.mpegurl')
            headers.set('x-consumit-manifest-base', url)
            bytes = new TextEncoder().encode(text).length
            report()
            return new Response(text, { status: 200, headers })
          }
          stage = 'manifest-rewrite'
          let rewritten: string
          try { rewritten = await rewriteRelayManifest(text, url, grant, hosts, codec, path.origin, now()) }
          catch (error) {
            const message = error instanceof Error ? error.message : ''
            const blocked = /^Blocked manifest destination: ([a-z0-9.-]+)\.$/.exec(message)
            if (blocked) blockedHost = blocked[1]
            stage = blocked ? 'manifest-host-scope'
              : message === 'Unsupported manifest.' && /#EXT-X-DEFINE\b|\{\$/.test(text) ? 'manifest-variables'
                : message === 'Unsupported manifest.' && /#EXT-X-CONTENT-STEERING\b/.test(text) ? 'manifest-content-steering'
                  : message === 'Unsupported manifest.' ? 'manifest-unsupported'
              : message === 'Invalid manifest.' ? 'manifest-invalid'
                : message === 'Invalid grant.' ? 'manifest-grant-invalid' : 'manifest-rewrite-failed'
            throw error
          }
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

function workerLookmovieHttp(fetcher: NonNullable<Dependencies['fetch']>, verifyPublicHost: NonNullable<Dependencies['verifyPublicHost']>, report?: (entry: { host: string; path: string; status: number | string }) => void): ProviderHttp {
  const request = async (url: string, requestHeaders: Record<string, string>, signal: AbortSignal, init: { method?: 'POST'; body?: string | Uint8Array; readPrefixBytes?: number } = {}, hosts?: readonly string[]): Promise<ProviderHttpResponse> => {
    const target = new URL(url)
    const catalog = target.origin === 'https://lmscript.xyz' && (target.pathname === '/v1/movies' || target.pathname === '/v1/movies/view')
    if (!catalog && (!hosts?.includes(target.hostname) || !LOOKMOVIE_HOST.test(target.hostname))) throw new Error('Blocked LookMovie destination.')
    if (!catalog) await verifyPublicHost(target.hostname, signal)
    const body = typeof init.body === 'string' ? init.body : init.body ? new Blob([new Uint8Array(init.body).buffer as ArrayBuffer]) : undefined
    let response: Response
    try { response = await fetcher(target.href, { method: init.method ?? 'GET', headers: requestHeaders, ...(body ? { body } : {}), redirect: 'manual', signal, cache: 'no-store' }) }
    catch (error) { report?.({ host: target.hostname, path: target.pathname, status: error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network-error' }); throw error }
    report?.({ host: target.hostname, path: target.pathname, status: response.status })
    const finalUrl = response.url || target.href
    if (finalUrl !== target.href) { await response.body?.cancel(); throw new Error('Unreviewed LookMovie redirect.') }
    const limit = init.readPrefixBytes === undefined ? 1024 * 1024 : Math.max(1, Math.min(4096, init.readPrefixBytes))
    const reader = response.body?.getReader()
    let bytes = new Uint8Array()
    if (reader) {
      const chunks: Uint8Array[] = []
      let size = 0
      try {
        while (size < limit) {
          const part = await reader.read()
          if (part.done) break
          const take = part.value.subarray(0, limit - size)
          chunks.push(take); size += take.length
          if (init.readPrefixBytes !== undefined && size >= limit) break
          if (size > limit) throw new Error('Oversized LookMovie response.')
        }
        if (init.readPrefixBytes === undefined) {
          // Read one extra byte to distinguish an exactly-sized body from a truncated one.
          const extra = await reader.read()
          if (!extra.done) throw new Error('Oversized LookMovie response.')
        }
      } finally { await reader.cancel().catch(() => undefined) }
      bytes = new Uint8Array(size); let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    }
    const text = new TextDecoder().decode(bytes)
    return { status: response.status, text, url: finalUrl, headers: response.headers, ...(init.readPrefixBytes !== undefined ? { bytes } : {}) }
  }
  const http = ((url, headers, signal, init) => request(url, headers, signal, init)) as ProviderHttp
  http.mediaScope = (hosts: readonly string[]) => (url, headers, signal, init) => request(url, headers, signal, init, hosts)
  return http
}
export default createRelayWorker({ report: entry => console.log(JSON.stringify({ event: 'relay.request', ...entry })) })
