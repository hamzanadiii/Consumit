import { subtitleDiscoveryResponseSchema, subtitleDiscoveryPageSchema, subtitleTrackSchema } from '@consumit/contracts'
import type { SubtitleService, SubtitleRef } from './subtitles.ts'
import type { SubtitleQuery } from './types.ts'
import type { ServedSubtitle } from './engine.ts'

/** The API contributes canonical metadata and dispatches typed operations.
 * It never downloads, prepares or serves a provider caption in edge mode. */
export function createCloudflareSubtitleService(options: {
  origin: string; secret: string
  query(ref: SubtitleRef, signal: AbortSignal, languages?: readonly string[]): Promise<SubtitleQuery>
  fetch?: (input: URL, init?: RequestInit) => Promise<Response>
}): SubtitleService {
  async function call(body: unknown, signal = AbortSignal.timeout(10_000)): Promise<unknown> {
    const response = await (options.fetch ?? fetch)(new URL('/v1/subtitle-operation', options.origin), {
      method: 'POST', redirect: 'error', signal, headers: { authorization: `Bearer ${options.secret}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
    })
    if (!response.ok) { await response.body?.cancel(); throw new Error('Cloudflare subtitles unavailable.') }
    const reader = response.body?.getReader(); let text = '', size = 0
    if (!reader) throw new Error('Missing subtitle response.')
    const decoder = new TextDecoder()
    try { for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 262144) throw new Error('Subtitle response exceeds its limit.'); text += decoder.decode(part.value, { stream: true }) }; return JSON.parse(text + decoder.decode()) as unknown }
    finally { await reader.cancel().catch(() => undefined); reader.releaseLock() }
  }
  return {
    async search() { return [] }, // Compatibility: discovery never prepares unselected files.
    async file() { throw new Error('Subtitle file delivery requires the Cloudflare route.') },
    async original() { return null },
    discovery: {
      async *discover(ref, signal, cursor, languages = [], context) {
        const query = await options.query(ref, signal, languages)
        const canonicalRef = ref.kind === 'movie' ? { kind: ref.kind, id: ref.id }
          : ref.kind === 'anime' ? { kind: ref.kind, id: ref.id, episode: ref.episode ?? 1 }
            : { kind: ref.kind, id: ref.id, season: ref.season ?? 1, episode: ref.episode ?? 1 }
        const { events } = subtitleDiscoveryResponseSchema.parse(await call({ operation: 'discover', ref: canonicalRef, query: { ...query, langs: [...languages] }, ...(context ? { context } : {}), ...(cursor ? { cursor } : {}) }, signal))
        for (const event of events) yield event
      },
      async page(searchId, language, cursor = 0) { return { ...subtitleDiscoveryPageSchema.parse(await call({ operation: 'page', searchId, language, cursor })), nextCursor: null } },
      async search(searchId, term, cursor = 0) { return subtitleDiscoveryPageSchema.parse(await call({ operation: 'search', searchId, term, cursor })) },
      async prepare(searchId, candidateId, signal) { const value = await call({ operation: 'prepare', searchId, candidateId }, signal); const track = subtitleTrackSchema.parse(value); return { ...track, format: 'vtt', provider: (value as ServedSubtitle).provider ?? 'cloudflare' } },
      async testCandidates() { return [] },
      diagnostics() { return [] },
    },
  }
}
