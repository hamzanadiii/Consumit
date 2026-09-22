import { decodeNxshaPayload, encodeNxshaPayload } from '@consumit/provider-sdk'
import type { SubtitleHttp } from './http.ts'
import { normLang } from './lang.ts'
import type { RawSubtitle, SubtitleQuery, SubtitleSearchProvider } from './types.ts'

// NxshaSubs harvester ported from PROVE — the dedicated subtitle endpoint
// (no video needed): GET /api/subtitles?q={envelope} decodes to subtitle
// URIs. Keyless, no quotas. Movies + TV, TMDB-keyed. The envelope crypto is
// shared with the Nxsha stream adapter in @consumit/provider-sdk.

const BASE = 'https://nxsha.space'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

export function createNxshaSubsProvider(http: SubtitleHttp): SubtitleSearchProvider {
  return {
    id: 'nxshasubs',
    name: 'NxshaSubs',
    supports(query: SubtitleQuery) {
      return (query.type === 'movie' || query.type === 'tv') && !!query.tmdbId
    },
    async search(query: SubtitleQuery, signal: AbortSignal): Promise<RawSubtitle[]> {
      const isTv = query.type === 'tv'
      const payload = encodeNxshaPayload({
        tmdbId: String(query.tmdbId),
        type: isTv ? 'tv' : 'movie',
        season: Number(query.season ?? 1),
        episode: Number(query.episode ?? 1),
      })
      const { text } = await http.get(
        `${BASE}/api/subtitles?q=${encodeURIComponent(payload)}`,
        { 'User-Agent': UA, Accept: 'application/json', Referer: `${BASE}/` },
        signal,
      )
      let list: unknown[]
      try {
        const decoded = decodeNxshaPayload((JSON.parse(text) as { _hash: string })._hash) as { subtitles?: unknown }
        list = Array.isArray(decoded?.subtitles) ? decoded.subtitles : []
      } catch {
        throw new Error('NxshaSubs response malformed.')
      }
      const out: RawSubtitle[] = []
      for (const entry of list.slice(0, 30)) {
        const record = entry as Record<string, unknown>
        const url = String(record.uri || '')
        if (!/^https?:\/\//.test(url)) continue
        out.push({
          url,
          lang: normLang(String(record.language || record.title || 'en')),
          label: String(record.title || record.language || 'subtitle').slice(0, 64),
          format: /ass/i.test(String(record.type || '')) ? 'ass' : 'srt',
          provider: 'nxshasubs',
          headers: { 'User-Agent': UA, Referer: `${BASE}/` },
        })
      }
      return out
    },
  }
}
