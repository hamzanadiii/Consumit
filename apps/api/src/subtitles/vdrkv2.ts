import type { SubtitleHttp } from './http.ts'
import type { RawSubtitle, SubtitleQuery, SubtitleSearchProvider } from './types.ts'
import { parseVdrkEntry } from './vdrk.ts'

// VDRK v2 (sub.vdrk.site) — keyless TMDB-keyed subtitle API, movies + TV.
// GET /v2/movie/{tmdbId} | /v2/tv/{tmdbId}/{season}/{episode} returns
// [{label, file}]. Complements v1 (different label and file sets), same
// entry shape, so parsing is shared. Files are direct VTT/SRT.
const API = 'https://sub.vdrk.site/v2'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

export function createVdrkV2Provider(http: SubtitleHttp): SubtitleSearchProvider {
  return {
    id: 'vdrkv2',
    name: 'VDRK v2',
    supports(query: SubtitleQuery) {
      return (query.type === 'movie' || query.type === 'tv') && !!query.tmdbId
    },
    async search(query: SubtitleQuery, signal: AbortSignal): Promise<RawSubtitle[]> {
      const tmdb = String(query.tmdbId)
      const url =
        query.type === 'tv'
          ? `${API}/tv/${tmdb}/${Number(query.season ?? 1)}/${Number(query.episode ?? 1)}`
          : `${API}/movie/${tmdb}`
      const { text } = await http.get(url, { 'User-Agent': UA, Accept: 'application/json' }, signal)
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        throw new Error('VDRK v2 response malformed.')
      }
      if (!Array.isArray(parsed)) return []
      const out: RawSubtitle[] = []
      for (const entry of parsed) {
        const track = parseVdrkEntry(entry, 'vdrkv2')
        if (track) out.push(track)
        if (out.length >= 40) break
      }
      return out
    },
  }
}
