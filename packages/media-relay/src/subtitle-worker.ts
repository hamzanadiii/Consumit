import { subtitlePlaybackContextSchema, type SubtitlePlaybackContext } from '../../../apps/api/src/subtitles/playback-context.ts'
import { allowedMediaUrl } from '@consumit/provider-sdk'
import { downloadStreamingSubtitle } from '../../../apps/api/src/subtitles/hls.ts'
import type { SubtitleSearchProvider, RawSubtitle } from '../../../apps/api/src/subtitles/types.ts'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { playbackRefSchema, SUBTITLE_POLICY_VERSION } from '@consumit/contracts'
import { createSubtitleDiscovery } from '../../../apps/api/src/subtitles/discovery.ts'
import { fetchSubtitleBytes } from '../../../apps/api/src/subtitles/http.ts'
import { createSubtitleProviders } from '../../../apps/api/src/subtitles/providers.ts'
import { shiftVtt } from '../../../apps/api/src/subtitles/sync.ts'
import type { SubtitleQuery } from '../../../apps/api/src/subtitles/types.ts'
import { createEdgeTransport } from './edge-transport.ts'
import { createR2SubtitleFiles, createExpiringSqliteStore, type EdgeBucket, type ExpiringSqlStorage } from './edge-storage.ts'

const querySchema = z.object({
  type: z.enum(['movie', 'tv', 'anime']), tmdbId: z.int().positive().optional(), anilistId: z.int().positive().optional(),
  imdbId: z.string().regex(/^tt\d{5,12}$/).optional(), title: z.string().max(300).optional(), year: z.int().min(1888).max(2200).optional(),
  season: z.int().positive().max(100).optional(), episode: z.int().positive().max(10000).optional(), absoluteEpisode: z.int().positive().max(10000).optional(),
  anidbEid: z.int().positive().optional(), langs: z.array(z.string().regex(/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/)).max(3).default([]),
}).strict()
const operationSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('discover'), ref: playbackRefSchema, query: querySchema, context: subtitlePlaybackContextSchema.optional(), cursor: z.string().max(80).optional() }).strict(),
  z.object({ operation: z.literal('page'), searchId: z.uuid(), language: z.string().regex(/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/), cursor: z.int().min(0).max(300).default(0) }).strict(),
  z.object({ operation: z.literal('search'), searchId: z.uuid(), term: z.string().min(1).max(80), cursor: z.int().min(0).max(300).default(0) }).strict(),
  z.object({ operation: z.literal('prepare'), searchId: z.uuid(), candidateId: z.string().min(1).max(128) }).strict(),
])
type Namespace = { idFromName(name: string): unknown; get(id: unknown): { fetch(request: Request): Promise<Response> } }
export type SubtitleWorkerEnv = {
  SUBTITLES_ENABLED: string; SUBTITLE_SECRET: string; APP_ORIGIN: string; R2_VERIFIED?: string
  SUBTITLE_SEARCHES: Namespace; SUBTITLE_PROVIDERS?: Namespace; SUBTITLE_FILES: EdgeBucket
  SUBDL_API_KEY?: string; JIMAKU_API_KEY?: string; OPENSUBTITLES_API_KEY?: string; OPENSUBTITLES_USER?: string; OPENSUBTITLES_PASS?: string
}
const reply = (status: number, value: unknown) => Response.json(value, { status, headers: { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } })
function authorized(request: Request, secret: string) {
  const actual = request.headers.get('authorization') ?? '', expected = `Bearer ${secret}`
  let diff = actual.length ^ expected.length
  for (let i = 0; i < Math.max(actual.length, expected.length); i++) diff |= (actual.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0)
  return secret.length >= 32 && diff === 0
}
async function boundedJson(request: Request) {
  const reader = request.body?.getReader()
  if (!reader) throw new Error('Missing body.')
  const decoder = new TextDecoder(); let text = '', bytes = 0
  try { for (;;) { const part = await reader.read(); if (part.done) break; bytes += part.value.length; if (bytes > 262_144) throw new Error('Request too large.'); text += decoder.decode(part.value, { stream: true }) }; return JSON.parse(text + decoder.decode()) as unknown }
  finally { await reader.cancel().catch(() => undefined); reader.releaseLock() }
}

export function subtitleSearchIdentity(value: { ref: unknown; query: unknown; context?: unknown }, credentialScope: string): string {
  const digest = createHash('sha256').update(JSON.stringify([SUBTITLE_POLICY_VERSION, value.ref, value.query, value.context ?? null, credentialScope])).digest('hex')
  // UUID-shaped opaque handle also names its globally unique Durable Object.
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`
}

export default {
  async fetch(request: Request, env: SubtitleWorkerEnv, context?: { waitUntil(work: Promise<unknown>): void }): Promise<Response> {
    if (env.SUBTITLES_ENABLED !== 'true' || env.R2_VERIFIED !== 'true' || !env.SUBTITLE_FILES || !env.SUBTITLE_SEARCHES) return reply(503, { code: 'SUBTITLES_UNAVAILABLE' })
    const url = new URL(request.url)
    const file = url.pathname.match(/^\/v1\/subtitles\/file\/([a-f0-9]{16})$/)
    if (file && request.method === 'GET') {
      const offset = Number(url.searchParams.get('offsetMs') ?? 0)
      if (!Number.isInteger(offset) || Math.abs(offset) > 120000 || [...url.searchParams.keys()].some(key => key !== 'offsetMs') || [...url.searchParams].length > 1) return reply(400, { code: 'BAD_REQUEST' })
      const edgeCache = typeof caches === 'undefined' ? undefined : (caches as CacheStorage & { default?: Cache }).default
      const cacheKey = new Request(new URL(url.pathname + url.search, env.APP_ORIGIN))
      const hit = offset ? undefined : await edgeCache?.match(cacheKey)
      if (hit) return hit
      const object = await env.SUBTITLE_FILES.get(`prepared/${file[1]!}.vtt`)
      const remaining = Math.floor((Number(object?.customMetadata?.expires ?? 0) - Date.now()) / 1000)
      if (!object || remaining <= 0) return reply(404, { code: 'SUBTITLES_NOT_FOUND' })
      const vtt = await object.text(), publicFile = !offset && object.customMetadata?.visibility === 'public'
      const response = new Response(offset ? shiftVtt(vtt, offset) : vtt, { headers: { 'content-type': 'text/vtt; charset=utf-8', 'cache-control': `${publicFile ? 'public' : 'private'}, max-age=${Math.min(86400, remaining)}, immutable`, 'access-control-allow-origin': env.APP_ORIGIN, 'x-content-type-options': 'nosniff' } })
      if (publicFile && edgeCache) {
        const write = edgeCache.put(cacheKey, response.clone())
        if (context) context.waitUntil(write); else await write
      }
      return response
    }
    if (request.method !== 'POST' || url.pathname !== '/v1/subtitle-operation') return reply(404, { code: 'NOT_FOUND' })
    if (!authorized(request, env.SUBTITLE_SECRET)) return reply(403, { code: 'FORBIDDEN' })
    try {
      const body = operationSchema.parse(await boundedJson(request))
      const credentials = createHash('sha256').update(JSON.stringify([env.SUBDL_API_KEY, env.JIMAKU_API_KEY, env.OPENSUBTITLES_API_KEY, env.OPENSUBTITLES_USER])).digest('hex')
      const searchId = body.operation === 'discover' ? subtitleSearchIdentity(body, credentials) : body.searchId
      const object = env.SUBTITLE_SEARCHES.get(env.SUBTITLE_SEARCHES.idFromName(searchId))
      return object.fetch(new Request('https://subtitle.internal/operation', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, searchId }) }))
    } catch { return reply(400, { code: 'BAD_REQUEST' }) }
  },
}

/** One search scope has one SQLite coordinator across regions. The request
 * job owns its deadline; disconnecting one viewer does not cancel other viewers. */
export class SubtitleSearch {
  private initializing: Promise<void> | undefined
  private discovery: ReturnType<typeof createSubtitleDiscovery> | undefined
  private store
  private expiry
  constructor(state: { storage: ExpiringSqlStorage }, private env: SubtitleWorkerEnv) { this.expiry = createExpiringSqliteStore(state.storage); this.store = this.expiry.store }
  async alarm() { await this.expiry.alarm() }
  async fetch(request: Request): Promise<Response> {
    try {
      const raw = await boundedJson(request) as Record<string, unknown>
      const searchId = z.uuid().parse(raw.searchId)
      const operation = { ...raw }; delete operation.searchId
      const body = operationSchema.parse(raw.operation === 'discover' ? operation : raw)
      if (!this.discovery) {
        this.initializing ??= (async () => {
        const context: SubtitlePlaybackContext | undefined = body.operation === 'discover' ? body.context : JSON.parse(await this.store.get('playback-context') ?? 'null') ?? undefined
        if (body.operation === 'discover' && context) await this.store.set('playback-context', JSON.stringify(context), 86400)
        const saved = body.operation === 'discover' ? body.query : JSON.parse(await this.store.get('canonical-query') ?? 'null') as SubtitleQuery | null
        if (!saved) throw new Error('Search subtitles again.')
        if (body.operation === 'discover') await this.store.set('canonical-query', JSON.stringify(saved), 86400)
        const keys = { subdl: this.env.SUBDL_API_KEY, jimaku: this.env.JIMAKU_API_KEY, openSubtitles: this.env.OPENSUBTITLES_API_KEY && this.env.OPENSUBTITLES_USER && this.env.OPENSUBTITLES_PASS ? { apiKey: this.env.OPENSUBTITLES_API_KEY, user: this.env.OPENSUBTITLES_USER, pass: this.env.OPENSUBTITLES_PASS } : undefined }
        const providers = createSubtitleProviders(keys, async (...args) => createEdgeTransport()(...args)).map(provider => ({
          ...provider,
          search: this.env.SUBTITLE_PROVIDERS ? async (query: SubtitleQuery) => {
            const identity = createHash('sha256').update(JSON.stringify([SUBTITLE_POLICY_VERSION, provider.id, query, keys])).digest('hex')
            const namespace = this.env.SUBTITLE_PROVIDERS!
            const response = await namespace.get(namespace.idFromName(identity)).fetch(new Request('https://subtitle.internal/provider-search', { method: 'POST', body: JSON.stringify({ providerId: provider.id, query }) }))
            if (!response.ok) throw new Error('Subtitle provider search unavailable.')
            return await response.json() as RawSubtitle[]
          } : provider.search,
        }))
        const source: SubtitleSearchProvider[] = context ? [{
          id: `stream-current-${context.providerId}`, name: context.providerId,
          supports: () => true, fileHosts: context.hosts,
          accepts: raw => raw.recordingVersion === context.videoVersion && raw.authority === context.videoVersion && Date.parse(context.expiresAt) > Date.now() + 5000 && allowedMediaUrl(raw.url, context.hosts),
          search: async () => context.captions.filter(track => allowedMediaUrl(track.url, context.hosts)).map(track => ({
            url: track.url, lang: track.language.toLowerCase(), label: track.label, format: track.format, provider: `stream-current-${context.providerId}`, providerName: context.providerId, ...(track.forced ? { forced: true } : {}), ...(track.sdh ? { sdh: true } : {}), ...(track.signs ? { signs: true } : {}), ...(track.songs ? { songs: true } : {}), ...(track.machineTranslated ? { machineTranslated: true } : {}),
            recordingVersion: context.videoVersion, authority: context.videoVersion, headers: context.headers, expiresAt: context.expiresAt, hls: /\.m3u8(?:[?#]|$)/i.test(track.url),
          })),
          download: (raw, signal) => { const transport = createEdgeTransport({ maxRequests: 32 }); return downloadStreamingSubtitle(raw, { mediaHosts: context.hosts }, signal, (url, hosts, headers, signal, maxBytes, patterns) => fetchSubtitleBytes(url, hosts, headers, signal, maxBytes, patterns, transport)) },
        }] : []
        this.discovery = createSubtitleDiscovery({
          providers: [...source, ...providers], ...(context ? { matchContext: { videoVersion: context.videoVersion, ...(context.release ? { release: context.release } : {}) } } : {}), store: this.store,
          files: createR2SubtitleFiles(this.env.SUBTITLE_FILES, Date.now, this.store), origin: this.env.APP_ORIGIN,
          createSearchId: () => searchId, query: async () => saved,
          fetchFile: (url, hosts, headers, signal, maxBytes, patterns) => fetchSubtitleBytes(url, hosts, headers, signal, maxBytes, patterns, createEdgeTransport()),
        })
        })().finally(() => { this.initializing = undefined })
        await this.initializing
      }
      if (!this.discovery) throw new Error('Search subtitles again.')
      const signal = AbortSignal.timeout(8500)
      switch (body.operation) {
        case 'discover': { const events = []; for await (const event of this.discovery.discover(body.ref, signal, body.cursor, body.query.langs)) events.push(event); return reply(200, { events }) }
        case 'page': return reply(200, await this.discovery.page(searchId, body.language, body.cursor))
        case 'search': return reply(200, await this.discovery.search(searchId, body.term, body.cursor))
        case 'prepare': { const track = await this.discovery.prepare(searchId, body.candidateId, signal); return reply(track ? 200 : 404, track ?? { code: 'SUBTITLES_NOT_FOUND' }) }
      }
    } catch { return reply(503, { code: 'SUBTITLES_UNAVAILABLE' }) }
  }
}

/** Raw generic discovery is shared independently of recording-specific captions.
 * Credentials are part of the opaque object name; private outputs stay internal. */
export class SubtitleProviderSearch {
  private store
  private expiry
  private pending: Promise<RawSubtitle[]> | undefined
  constructor(state: { storage: ExpiringSqlStorage }, private env: SubtitleWorkerEnv) { this.expiry = createExpiringSqliteStore(state.storage); this.store = this.expiry.store }
  async alarm() { await this.expiry.alarm() }
  async fetch(request: Request): Promise<Response> {
    try {
      const parsed = z.object({ providerId: z.string().regex(/^[a-z0-9-]{1,64}$/), query: querySchema }).strict().parse(await boundedJson(request))
      const cached = JSON.parse(await this.store.get('result') ?? 'null') as { at: number; tracks: RawSubtitle[] } | null
      const usable = cached?.tracks.filter(raw => !raw.expiresAt || Date.parse(raw.expiresAt) > Date.now() + 5000) ?? []
      if (cached && Date.now() - cached.at < (cached.tracks.length ? 3600_000 : 300_000) && usable.length === cached.tracks.length) return reply(200, usable)
      if (await this.store.get('failure')) return cached && usable.length ? reply(200, usable) : reply(503, { code: 'SUBTITLES_UNAVAILABLE' })
      this.pending ??= (async () => {
        const keys = { subdl: this.env.SUBDL_API_KEY, jimaku: this.env.JIMAKU_API_KEY, openSubtitles: this.env.OPENSUBTITLES_API_KEY && this.env.OPENSUBTITLES_USER && this.env.OPENSUBTITLES_PASS ? { apiKey: this.env.OPENSUBTITLES_API_KEY, user: this.env.OPENSUBTITLES_USER, pass: this.env.OPENSUBTITLES_PASS } : undefined }
        const transport = createEdgeTransport()
        const provider = createSubtitleProviders(keys, transport).find(provider => provider.id === parsed.providerId)
        if (!provider || !provider.supports(parsed.query)) return []
        try {
          const tracks = (await provider.search(parsed.query, AbortSignal.timeout(8000))).slice(0, 100)
          await this.store.set('result', JSON.stringify({ at: Date.now(), tracks }), 86400)
          return tracks
        } catch (error) { await this.store.set('failure', '1', 60); if (cached && usable.length && Date.now() - cached.at < 86400_000) return usable; throw error }
      })().finally(() => { this.pending = undefined })
      return reply(200, await this.pending)
    } catch { return reply(503, { code: 'SUBTITLES_UNAVAILABLE' }) }
  }
}
