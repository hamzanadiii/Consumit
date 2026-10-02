import type { SubtitleHttp } from './http.ts'
import type { RawSubtitle, SubtitleQuery, SubtitleSearchProvider } from './types.ts'

// Jimaku.cc — anime subtitles by AniList id, direct srt/ass files.
// Key-gated: without JIMAKU_API_KEY the provider declines. Episode files
// are preferred by number when the entry bundles several; ASS tracks are
// reported (the engine skips what browsers cannot render) so counts stay
// honest.

const API = 'https://jimaku.cc/api'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

export function createJimakuProvider(http: SubtitleHttp, apiKey?: string | undefined): SubtitleSearchProvider {
  return {
    id: 'jimaku',
    name: 'Jimaku',
    supports(query: SubtitleQuery) {
      return !!apiKey && query.type === 'anime' && !!query.anilistId
    },
    async search(query: SubtitleQuery, signal: AbortSignal): Promise<RawSubtitle[]> {
      const { text } = await http.get(`${API}/entries/search?anilist_id=${query.anilistId}`, {
        'User-Agent': UA,
        Accept: 'application/json',
        Authorization: apiKey!,
      }, signal)
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        throw new Error('Jimaku response malformed.')
      }
      const root = parsed as { entries?: unknown; data?: unknown } | unknown[]
      const entries: unknown[] = Array.isArray(root) ? root : (Array.isArray((root as { entries?: unknown }).entries) ? (root as { entries?: unknown }).entries : (root as { data?: unknown }).data) as unknown[]
      const list = Array.isArray(entries) ? entries : []
      const out: RawSubtitle[] = []
      // Canonical absolute episode first, plain episode as fallback; entry
      // bundles are disambiguated by number, single-file entries pass.
      const episode = Number(query.absoluteEpisode ?? query.episode ?? 1)
      for (const entry of list as Record<string, unknown>[]) {
        const files = Array.isArray(entry.files) ? (entry.files as Record<string, unknown>[]) : []
        for (const file of files) {
          const url = String(file.url || file.link || '')
          if (!/^https?:\/\//.test(url)) continue
          // Prefer this episode's file when the entry bundles several.
          const match = url.match(/(?:e|ep|episode)[ _.-]?(\d{1,3})/i) || String(file.name || '').match(/(?:e|ep|episode)[ _.-]?(\d{1,3})/i)
          if (match && Number(match[1]) !== episode && files.length > 1) continue
          const isAss = /\.ass(\?|#|$)/i.test(url)
          out.push({
            url,
            lang: 'en',
            label: String(file.name || entry.name || 'English').slice(0, 80),
            format: isAss ? 'ass' : /\.vtt(\?|#|$)/i.test(url) ? 'vtt' : 'srt',
            provider: 'jimaku',
          })
        }
      }
      return out
    },
  }
}
