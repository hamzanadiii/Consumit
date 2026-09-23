import type { SubtitleHttp } from './http.ts'
import { normLang } from './lang.ts'
import type { RawSubtitle, SubtitleQuery, SubtitleSearchProvider } from './types.ts'

// VDRK (sub.vdrk.site) — keyless TMDB-keyed subtitle API, movies + TV.
// GET /v1/movie/{tmdbId} | /v1/tv/{tmdbId}/{season}/{episode} returns
// [{file, label}]. Files are direct VTT on cache.vdrk.site (CORS-open,
// text/vtt), so tracks pass straight through to the player untouched.
// Labels carry language names with HI suffixes and numeric dupes
// (Czech2..5), normalized here.

const API = 'https://sub.vdrk.site/v1'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

/** Normalize one VDRK [{file, label}] entry. Labels carry language names
 *  with HI suffixes and numeric dupes (Czech2..5). Returns null when the
 *  entry is unusable. Shared by the v1 and v2 endpoints (different label
 *  and file sets, same shape). */
export function parseVdrkEntry(entry: unknown, provider: string): RawSubtitle | null {
  const record = entry as Record<string, unknown>
  const file = String(record.file || '')
  const label = String(record.label || '')
  if (!/^https?:\/\//.test(file) || !label) return null
  const hi = /\bhi\d*$/i.test(label) || /\shi$/i.test(label)
  const name = label.replace(/\s*hi\d*$/i, '').replace(/\s*hi$/i, '').replace(/\d+$/, '').trim()
  if (!name) return null
  return {
    url: file,
    lang: normLang(name),
    label: hi ? `${name} [HI]` : name,
    format: /\.srt/i.test(file) ? 'srt' : 'vtt',
    hi,
    provider,
  }
}

export function createVdrkProvider(http: SubtitleHttp): SubtitleSearchProvider {
  return {
    id: 'vdrk',
    name: 'VDRK',
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
        throw new Error('VDRK response malformed.')
      }
      if (!Array.isArray(parsed)) return []
      const out: RawSubtitle[] = []
      for (const entry of parsed) {
        const track = parseVdrkEntry(entry, 'vdrk')
        if (track) out.push(track)
        if (out.length >= 40) break
      }
      return out
    },
  }
}
