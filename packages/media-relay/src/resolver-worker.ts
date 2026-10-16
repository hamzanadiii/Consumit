import { z } from 'zod'
import { configuredProviders } from '../../../apps/api/src/playback/configured-providers.ts'
import type { MediaResponse, MediaTransport } from '../../../apps/api/src/playback/transport.ts'

const refSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('movie'), id: z.number().int().positive() }),
  z.object({ kind: z.literal('series'), id: z.number().int().positive(), season: z.number().int().positive(), episode: z.number().int().positive() }),
  z.object({ kind: z.literal('anime'), id: z.number().int().positive(), episode: z.number().int().positive() }),
])
const requestSchema = z.object({
  providerId: z.string().regex(/^[a-z0-9-]{1,40}$/),
  config: z.record(z.string(), z.unknown()).refine(row => row.id === undefined || typeof row.id === 'string'),
  input: z.object({ ref: refSchema, region: z.string().regex(/^[A-Z]{2}$/), audioLanguage: z.string().min(1).max(32) }),
  metadata: z.object({
    title: z.string().max(300).optional(), year: z.number().int().min(1888).max(2200).optional(),
    imdbId: z.string().regex(/^tt\d{5,12}$/).optional(), runtimeSec: z.number().int().positive().max(86400).optional(),
    animeTitle: z.string().max(300).optional(), animeTitles: z.array(z.string().max(300)).max(8).optional(), malId: z.number().int().positive().nullable().optional(),
  }).default({}),
}).strict()
export type ResolverEnv = { RESOLVER_ENABLED: string; RESOLVER_SECRET: string; RESOLVER_COMPUTE_ORIGIN?: string; RESOLVER_COMPUTE_SECRET?: string }
type ResolverFetch = (input: string | URL, init?: RequestInit) => Promise<Response>
type ResolverDeps = { fetch?: ResolverFetch; maxSubrequests?: number; report?: (entry: { provider: string; subrequests: number; durationMs: number; outcome: string; sources: number }) => void }
const MAX_REQUEST = 64 * 1024
const MAX_RESPONSE = 256 * 1024
const MAX_SUBREQUESTS = 50
const MAX_SCOPE_HOSTS = 100

async function boundedText(request: Pick<Request, 'body'>, limit: number) {
  const reader = request.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      if (size > limit) { await reader.cancel(); return null }
      chunks.push(part.value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return new TextDecoder().decode(bytes)
  } finally { reader.releaseLock() }
}

function safeHosts(config: Record<string, unknown>) {
  const media = config.mediaHosts
  const resolution = config.resolutionHosts ?? []
  if (!Array.isArray(media) || !media.length || media.length > MAX_SCOPE_HOSTS || media.some(host => typeof host !== 'string')
    || !Array.isArray(resolution) || resolution.length > 30 || resolution.some(host => typeof host !== 'string')) throw new Error('Invalid host scope.')
  const all = [...media, ...resolution] as string[]
  if (all.some(host => !/^(?:\*\.)?[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(host)
    || host.startsWith('*.') && host.slice(2).split('.').length < 2
    || /(?:^|\.)(?:localhost|local|internal|test|invalid)$|^\d{1,3}(?:\.\d{1,3}){3}$|:/i.test(host))) throw new Error('Invalid host scope.')
  return all
}

function equalSecret(actual: string | null, expected: string) {
  const a = new TextEncoder().encode(actual ?? ''), b = new TextEncoder().encode(expected)
  let diff = a.length ^ b.length
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return diff === 0
}

function webBody(response: Response) {
  const reader = response.body?.getReader()
  let destroyed = false
  return {
    async *[Symbol.asyncIterator]() {
      if (!reader) return
      try {
        while (!destroyed) {
          const next = await reader.read()
          if (next.done) break
          yield next.value
        }
      } finally { await reader.cancel().catch(() => undefined) }
    },
    destroy(reason?: unknown) { destroyed = true; void reader?.cancel(reason).catch(() => undefined) },
  } as unknown as MediaResponse['body']
}

/** Executes exactly one compiled adapter. Provider order, health, sessions and validation stay in the API. */
export function createResolverWorker(deps: ResolverDeps = {}) {
  const fetcher = deps.fetch ?? fetch
  const maxSubrequests = deps.maxSubrequests ?? MAX_SUBREQUESTS
  return {
    async fetch(request: Request, env: ResolverEnv): Promise<Response> {
      const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
      const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers })
      if (env.RESOLVER_ENABLED !== 'true') return reply(503, { ok: false, code: 'unavailable', retryable: true })
      if (request.method !== 'POST' || new URL(request.url).pathname !== '/v1/resolve') return reply(404, { ok: false, code: 'empty', retryable: false })
      if (!equalSecret(request.headers.get('authorization')?.replace(/^Bearer /, '') ?? null, env.RESOLVER_SECRET)) return reply(403, { ok: false, code: 'unavailable', retryable: true })
      let parsed: z.infer<typeof requestSchema>
      try {
        const body = await boundedText(request, MAX_REQUEST)
        if (body === null) return reply(413, { ok: false, code: 'malformed', retryable: false })
        parsed = requestSchema.parse(JSON.parse(body))
        if (parsed.config.id !== parsed.providerId) throw new Error('Provider identity mismatch.')
        safeHosts(parsed.config)
      } catch { return reply(400, { ok: false, code: 'malformed', retryable: false }) }
      const controller = new AbortController()
      const started = Date.now()
      let outcome = 'error'
      let sourceCount = 0
      const timer = setTimeout(() => controller.abort(new DOMException('Provider resolution timed out.', 'TimeoutError')), 15_000)
      const parentSignal = request.signal
      const cancel = () => controller.abort(parentSignal.reason)
      if (parentSignal.aborted) cancel()
      else parentSignal.addEventListener('abort', cancel, { once: true })
      let subrequests = 0
      const hosts = safeHosts(parsed.config)
      const patterns = Array.isArray(parsed.config.mediaHostPatterns)
        ? parsed.config.mediaHostPatterns.map(value => { if (typeof value !== 'string' || value.length > 100) throw new Error('Invalid host pattern.'); return new RegExp(value, 'i') }) : []
      const transport: MediaTransport = async (url, scopes, requestHeaders, signal, init, configuredPatterns) => {
        const combined = [...new Set([...hosts, ...scopes])]
        const approved = (value: string) => {
          const target = new URL(value), hostname = target.hostname.toLowerCase()
          const allowed = combined.some(host => host.startsWith('*.') ? hostname.endsWith(host.slice(1)) : hostname === host)
            || [...patterns, ...(configuredPatterns ?? [])].some(pattern => pattern.test(hostname))
          if (target.protocol !== 'https:' || target.username || target.password || target.port && target.port !== '443' || !allowed) throw new Error('Blocked provider destination.')
          return target
        }
        let current = url
        let outgoing = new Headers({ ...requestHeaders, 'accept-encoding': 'identity' })
        let method: 'POST' | 'HEAD' | undefined = init?.method
        let body = typeof init?.body === 'string' ? init.body : init?.body ? new Uint8Array(init.body) : undefined
        const abort = AbortSignal.any([signal, controller.signal])
        for (let redirects = 0; redirects <= 3; redirects++) {
          approved(current)
          if (++subrequests > maxSubrequests) throw new Error('Worker subrequest limit reached.')
          const response = await fetcher(current, { method: method ?? 'GET', headers: outgoing, ...(body ? { body } : {}), redirect: 'manual', signal: abort, cache: 'no-store' })
          if (![301, 302, 303, 307, 308].includes(response.status)) {
            // createProviderHttp consumes a bounded async iterator and owns cancellation.
            return { status: response.status, headers: response.headers, url: current, body: webBody(response) } as MediaResponse
          }
          const location = response.headers.get('location')
          await response.body?.cancel()
          if (!location || redirects === 3) throw new Error('Invalid provider redirect.')
          const next = new URL(location, current)
          approved(next.href)
          if (next.hostname !== new URL(current).hostname) outgoing = new Headers([...outgoing].filter(([name]) => !/^(?:cookie|authorization)$/i.test(name)))
          method = undefined; body = undefined; current = next.href
        }
        throw new Error('Too many provider redirects.')
      }
      try {
        const metadata = parsed.metadata
        const animeTitle = async () => metadata.animeTitle ?? metadata.title ?? ''
        const provider = configuredProviders([parsed.config], {
          transport,
          ...(env.RESOLVER_COMPUTE_ORIGIN ? { animeKaiPowSolver: async (nonce: string, difficulty: number, timeoutMs: number, signal?: AbortSignal) => {
            const origin = new URL(env.RESOLVER_COMPUTE_ORIGIN!)
            if (origin.protocol !== 'https:' || origin.origin !== env.RESOLVER_COMPUTE_ORIGIN || origin.username || origin.password || !env.RESOLVER_COMPUTE_SECRET || env.RESOLVER_COMPUTE_SECRET.length < 32) throw new Error('Invalid computation service.')
            if (++subrequests > maxSubrequests) throw new Error('Worker subrequest limit reached.')
            const response = await fetcher(new URL('/v1/internal/animekai-pow', origin), {
              method: 'POST', headers: { authorization: `Bearer ${env.RESOLVER_COMPUTE_SECRET}`, 'content-type': 'application/json' },
              // Workers support manual/follow, not the browser's error mode.
              // Refuse redirects below without forwarding the secret.
              body: JSON.stringify({ nonce, difficulty }), redirect: 'manual', cache: 'no-store',
              signal: AbortSignal.any([controller.signal, AbortSignal.timeout(Math.min(timeoutMs, 9000)), ...(signal ? [signal] : [])]),
            })
            if (!response.ok) { await response.body?.cancel(); throw new Error('Computation service unavailable.') }
            const raw = await boundedText(response, 128)
            if (raw === null) throw new Error('Invalid computation result.')
            return z.strictObject({ solution: z.string().regex(/^\d{1,12}$/).nullable() }).parse(JSON.parse(raw)).solution
          } } : {}),
          tmdbMetadataResolver: async () => {
            if (!metadata.title || !metadata.year) throw new Error('Canonical title metadata missing.')
            return { title: metadata.title, year: metadata.year, ...(metadata.imdbId ? { imdbId: metadata.imdbId } : {}), ...(metadata.runtimeSec ? { runtimeSec: metadata.runtimeSec } : {}) }
          },
          tmdbIdentityResolver: async () => ({ ...(metadata.imdbId ? { imdbId: metadata.imdbId } : {}) }),
          animeTitleResolver: async () => animeTitle(),
          animeTitleVariantsResolver: async () => metadata.animeTitles ?? (metadata.animeTitle ? [metadata.animeTitle] : []),
          animeMetaResolver: async () => ({ title: await animeTitle(), malId: metadata.malId ?? null }),
        })[0]
        if (!provider || provider.adapter.id !== parsed.providerId) throw new Error('Unknown compiled provider adapter.')
        const result = await provider.adapter.resolve(parsed.input, controller.signal)
        const raw = JSON.stringify(result)
        if (new TextEncoder().encode(raw).byteLength > MAX_RESPONSE) {
          outcome = 'malformed'
          return reply(502, { ok: false, code: 'malformed', retryable: false })
        }
        outcome = result.ok ? 'success' : result.code
        sourceCount = result.ok ? result.sources.length : 0
        return reply(200, result)
      } catch {
        const timedOut = controller.signal.aborted && !parentSignal.aborted
        outcome = timedOut ? 'timeout' : 'unavailable'
        return reply(502, { ok: false, code: timedOut ? 'timeout' : 'unavailable', retryable: true })
      } finally {
        clearTimeout(timer)
        parentSignal.removeEventListener('abort', cancel)
        try { deps.report?.({ provider: parsed.providerId, subrequests, durationMs: Math.max(0, Date.now() - started), outcome, sources: sourceCount }) } catch { /* Logging cannot fail resolution. */ }
      }
    },
  }
}

export default createResolverWorker({ report: entry => console.log(JSON.stringify({ event: 'provider.resolve', ...entry })) })
