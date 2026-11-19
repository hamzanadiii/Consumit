import { validatedSources } from '@consumit/provider-sdk'
import { inspectEdgeAudio } from './audio-inspection.ts'
import { z } from 'zod'
import { configuredProviders } from '../../../apps/api/src/playback/configured-providers.ts'
import type { MediaResponse, MediaTransport } from '../../../apps/api/src/playback/transport.ts'
import { createHash } from 'node:crypto'
import { createExpiringSqliteStore, type ExpiringSqlStorage } from './edge-storage.ts'

const refSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('movie'), id: z.number().int().positive() }),
  z.object({ kind: z.literal('series'), id: z.number().int().positive(), season: z.number().int().positive(), episode: z.number().int().positive() }),
  z.object({ kind: z.literal('anime'), id: z.number().int().positive(), episode: z.number().int().positive() }),
])
const requestSchema = z.object({
  route: z.object({ version: z.string().regex(/^edge-v1-[a-f0-9]{16}$/), policy: z.string().regex(/^[a-f0-9]{64}$/), purpose: z.enum(['video', 'audio']) }).optional(),
  providerId: z.string().regex(/^[a-z0-9-]{1,40}$/),
  config: z.record(z.string(), z.unknown()).refine(row => row.id === undefined || typeof row.id === 'string'),
  input: z.object({ purpose: z.literal('audio').optional(), audioTrackKey: z.string().regex(/^[a-f0-9]{32}$/).optional(), ref: refSchema, region: z.string().regex(/^[A-Z]{2}$/), audioLanguage: z.string().min(1).max(32) }),
  metadata: z.object({
    title: z.string().max(300).optional(), year: z.number().int().min(1888).max(2200).optional(),
    imdbId: z.string().regex(/^tt\d{5,12}$/).optional(), runtimeSec: z.number().int().positive().max(86400).optional(),
    animeTitle: z.string().max(300).optional(), animeTitles: z.array(z.string().max(300)).max(8).optional(), malId: z.number().int().positive().nullable().optional(),
  }).default({}),
}).strict()
type ResolverRequest = z.infer<typeof requestSchema>
const routePolicySchema = z.array(z.object({
  version: z.string().regex(/^edge-v1-[a-f0-9]{16}$/), policy: z.string().regex(/^[a-f0-9]{64}$/),
  provider: z.string().regex(/^[a-z0-9-]{1,40}$/), kind: z.enum(['movie', 'series', 'anime']), region: z.string().regex(/^[A-Z]{2}$/),
  purpose: z.enum(['video', 'audio']), delivery: z.enum(['direct', 'relay', 'embed']), lookup: z.string().url(),
}).strict()).max(384)
export type ResolverEnv = { RESOLVER_ENABLED: string; RESOLVER_SECRET: string; RESOLVER_COMPUTE_ORIGIN?: string; RESOLVER_COMPUTE_SECRET?: string; RESOLVER_ROUTE_POLICY?: string; RESOLVER_ROUTE_POLICY_1?: string; RESOLVER_ROUTE_POLICY_2?: string; RESOLVER_ROUTE_POLICY_REQUIRED?: string; RESOLVER_COORDINATION_ENABLED?: string; PROVIDER_COORDINATORS?: { idFromName(name: string): unknown; get(id: unknown): { fetch(request: Request): Promise<Response> } } }
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

function routePolicyMatches(parsed: ResolverRequest, env: ResolverEnv, lookup: string) {
  if (!parsed.route) return env.RESOLVER_ROUTE_POLICY_REQUIRED !== 'true' && env.RESOLVER_COORDINATION_ENABLED !== 'true'
  try {
    const policy = routePolicySchema.parse([
      ...routePolicySchema.parse(JSON.parse(env.RESOLVER_ROUTE_POLICY ?? '[]')),
      ...routePolicySchema.parse(JSON.parse(env.RESOLVER_ROUTE_POLICY_1 ?? '[]')),
      ...routePolicySchema.parse(JSON.parse(env.RESOLVER_ROUTE_POLICY_2 ?? '[]')),
    ])
    const scoped = policy.find(row => row.version === parsed.route!.version && row.policy === parsed.route!.policy
      && row.provider === parsed.providerId && row.kind === parsed.input.ref.kind && row.region === parsed.input.region
      && row.purpose === (parsed.input.purpose ?? 'video') && row.delivery === (parsed.config.deliveryMode ?? 'direct') && row.lookup === lookup)
    const hash = createHash('sha256').update(JSON.stringify([
      parsed.config.mediaHosts,
      Array.isArray(parsed.config.mediaHostPatterns) && parsed.config.mediaHostPatterns.length ? parsed.config.mediaHostPatterns : undefined,
      parsed.config.relayHostDiscovery,
    ])).digest('hex')
    return Boolean(scoped && scoped.policy === hash)
  } catch { return false }
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
      if (parsed.route || env.RESOLVER_ROUTE_POLICY_REQUIRED === 'true' || env.RESOLVER_COORDINATION_ENABLED === 'true') {
        if (!routePolicyMatches(parsed, env, new URL(request.url).origin)) return reply(403, { ok: false, code: 'unavailable', retryable: false })
      }
      if (env.RESOLVER_COORDINATION_ENABLED === 'true') {
        if (!env.PROVIDER_COORDINATORS) return reply(503, { ok: false, code: 'unavailable', retryable: false })
        const group = parsed.config.upstreamGroup
        if (typeof group !== 'string' || !/^[a-z0-9-]{1,64}$/.test(group)) return reply(400, { ok: false, code: 'malformed', retryable: false })
        const object = env.PROVIDER_COORDINATORS.get(env.PROVIDER_COORDINATORS.idFromName(group))
        return object.fetch(new Request('https://resolver.internal/v1/resolve', { method: 'POST', headers: { authorization: `Bearer ${env.RESOLVER_SECRET}`, 'content-type': 'application/json' }, body: JSON.stringify(parsed), signal: request.signal }))
      }
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
        const resolved = await provider.adapter.resolve(parsed.input, controller.signal)
        const inspected = parsed.input.purpose === 'audio' ? await inspectEdgeAudio(resolved, provider, parsed.input, transport, controller.signal) : resolved
        const result = inspected.ok ? { ok: true as const, sources: validatedSources(inspected, provider) } : inspected
        const raw = JSON.stringify(result)
        if (new TextEncoder().encode(raw).byteLength > MAX_RESPONSE) {
          outcome = 'malformed'
          return reply(502, { ok: false, code: 'malformed', retryable: false })
        }
        outcome = result.ok ? 'success' : result.code
        sourceCount = result.ok ? result.sources.length : 0
        return reply(200, result)
      } catch {
        if (parentSignal.aborted) {
          outcome = 'cancelled'
          return reply(499, { ok: false, code: 'cancelled', retryable: false })
        }
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

/** Group-wide admission, circuits and cached jobs live in one global object.
 * There is no unbounded queue and a failed coordinator never falls back. */
export class ProviderCoordinator {
  private store
  private expiry
  private jobs = new Map<string, { promise: Promise<{ status: number; body: string; retryAfterMs?: number }>; controller: AbortController; subscribers: number; settled: boolean }>()
  private active = 0
  private activeByRoute = new Map<string, number>()
  private worker = createResolverWorker({ report: entry => console.log(JSON.stringify({ event: 'provider.resolve', ...entry })) })
  constructor(state: { storage: ExpiringSqlStorage }, private env: ResolverEnv, deps: ResolverDeps = {}) { this.expiry = createExpiringSqliteStore(state.storage); this.store = this.expiry.store; this.worker = createResolverWorker(deps) }
  async alarm() { await this.expiry.alarm() }
  async fetch(request: Request): Promise<Response> {
    const respond = (status: number, body: string, retryAfterMs?: number) => new Response(body, { status, headers: {
      'content-type': 'application/json', 'cache-control': 'private, no-store',
      ...(retryAfterMs !== undefined ? { 'retry-after': String(Math.max(1, Math.ceil(retryAfterMs / 1000))) } : {}),
    } })
    const denied = (retryAfterMs = 1000) => respond(429, JSON.stringify({ ok: false, code: 'rate_limited', retryable: true, retryAfterMs }), retryAfterMs)
    let parsed: z.infer<typeof requestSchema>
    try { const body = await boundedText(request, MAX_REQUEST); if (body === null) return denied(); parsed = requestSchema.parse(JSON.parse(body)) } catch { return denied() }
    const body = JSON.stringify(parsed), key = createHash('sha256').update(body).digest('hex')
    let job = this.jobs.get(key)
    if (!job) {
      const controller = new AbortController()
      const created = { controller, subscribers: 0, settled: false, promise: Promise.resolve({ status: 500, body: '' }) }
      created.promise = this.run(parsed, key, body, controller.signal).finally(() => {
        created.settled = true
        if (this.jobs.get(key) === created) this.jobs.delete(key)
      })
      this.jobs.set(key, created)
      job = created
    }
    job.subscribers++
    return new Promise<Response>(resolve => {
      let released = false
      const release = () => {
        if (released) return
        released = true
        request.signal.removeEventListener('abort', cancel)
        job!.subscribers = Math.max(0, job!.subscribers - 1)
        if (!job!.settled && job!.subscribers === 0) job!.controller.abort(request.signal.reason ?? new DOMException('All lookup callers disconnected.', 'AbortError'))
      }
      const cancel = () => {
        release()
        resolve(respond(499, JSON.stringify({ ok: false, code: 'cancelled', retryable: false })))
      }
      if (request.signal.aborted) { cancel(); return }
      request.signal.addEventListener('abort', cancel, { once: true })
      void job!.promise.then(result => {
        if (released) return
        release()
        resolve(respond(result.status, result.body, result.retryAfterMs))
      }, () => {
        if (released) return
        release()
        resolve(respond(502, JSON.stringify({ ok: false, code: 'unavailable', retryable: true })))
      })
    })
  }
  private async run(parsed: z.infer<typeof requestSchema>, key: string, body: string, signal: AbortSignal): Promise<{ status: number; body: string; retryAfterMs?: number }> {
    const denied = (retryAfterMs = 1000) => ({ status: 429, body: JSON.stringify({ ok: false, code: 'rate_limited', retryable: true, retryAfterMs }), retryAfterMs })
    const cancelled = () => ({ status: 499, body: JSON.stringify({ ok: false, code: 'cancelled', retryable: false }) })
    if (signal.aborted) return cancelled()
    const cached = await this.store.get(`lookup:${key}`)
    if (signal.aborted) return cancelled()
    if (cached) return { status: 200, body: cached }
    const routeKey = createHash('sha256').update(JSON.stringify([
      parsed.providerId, parsed.input.ref.kind, parsed.input.region, parsed.config.deliveryMode ?? 'direct', parsed.input.purpose ?? 'video',
      parsed.route?.version ?? 'unversioned',
    ])).digest('hex')
    const circuitStorageKey = `circuit:${routeKey}`
    const budgetStorageKey = `budget:${routeKey}`
    const activeForRoute = this.activeByRoute.get(routeKey) ?? 0
    const concurrency = Number(parsed.config.concurrency), rpm = Number(parsed.config.requestsPerMinute)
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32 || !Number.isInteger(rpm) || rpm < 1 || rpm > 6000 || this.active >= 32 || activeForRoute >= concurrency) return denied()
    // SQL-backed lease protects admission across interleaved storage awaits.
    if (!await this.store.claim('admission-lock', key, 2)) return denied()
    try {
      if (signal.aborted) return cancelled()
      const state = JSON.parse(await this.store.get(budgetStorageKey) ?? '{"at":0,"count":0}') as { at: number; count: number }
      const circuit = JSON.parse(await this.store.get(circuitStorageKey) ?? '{"failures":0,"until":0}') as { failures: number; until: number }
      if (circuit.until > Date.now()) return denied(circuit.until - Date.now())
      if (state.at + 60_000 <= Date.now()) { state.at = Date.now(); state.count = 0 }
      if (state.count >= rpm) return denied()
      state.count++; await this.store.set(budgetStorageKey, JSON.stringify(state), 80)
      this.active++
      this.activeByRoute.set(routeKey, activeForRoute + 1)
    } finally { await this.store.release('admission-lock', key) }
    try {
        const env = { ...this.env, RESOLVER_COORDINATION_ENABLED: 'false' }
        // The public Resolver already validated the original versioned tuple.
        // Internal dispatch uses resolver.internal and must not revalidate its
        // host against that private origin or accept an unreviewed public call.
        env.RESOLVER_ROUTE_POLICY_REQUIRED = 'false'
        const workerRequest = { ...parsed }
        delete workerRequest.route
        const response = await this.worker.fetch(new Request('https://resolver.internal/v1/resolve', { method: 'POST', headers: { authorization: `Bearer ${env.RESOLVER_SECRET}`, 'content-type': 'application/json' }, body: JSON.stringify(workerRequest), signal }), env)
        const text = await response.text(), result = JSON.parse(text) as { ok: boolean; code?: string; retryAfterMs?: number; sources?: { expiresAt: string }[] }
        if (signal.aborted || result.code === 'cancelled') return cancelled()
        const healthy = result.ok && Boolean(result.sources?.length)
        const previous = JSON.parse(await this.store.get(circuitStorageKey) ?? '{"failures":0,"until":0}') as { failures: number; until: number }
        const benign = response.ok && (result.ok || result.code === 'empty')
        const failures = benign ? 0 : previous.failures + 1
        const backoff = result.code === 'rate_limited' ? Math.max(1000, Math.min(900_000, result.retryAfterMs ?? 60_000))
          : result.code === 'blocked' ? 5 * 60_000 : Math.min(5 * 60_000, 15_000 * Math.max(1, failures))
        const until = benign ? 0 : Date.now() + backoff
        await this.store.set(circuitStorageKey, JSON.stringify({ failures, until }), 900)
        const ttl = healthy ? Math.min(30, ...result.sources!.map(source => (Date.parse(source.expiresAt) - Date.now() - 30000) / 1000)) : 3
        if (response.ok && Number.isFinite(ttl) && ttl > 0) await this.store.set(`lookup:${key}`, text, ttl)
        return { status: response.status, body: text, ...(result.code === 'rate_limited' ? { retryAfterMs: backoff } : {}) }
    } finally {
      this.active = Math.max(0, this.active - 1)
      const active = Math.max(0, (this.activeByRoute.get(routeKey) ?? 1) - 1)
      if (active) this.activeByRoute.set(routeKey, active)
      else this.activeByRoute.delete(routeKey)
    }
  }
}
