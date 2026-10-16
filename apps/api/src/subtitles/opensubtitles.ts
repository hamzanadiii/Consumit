import type { SubtitleHttp } from './http.ts'
import { normLang } from './lang.ts'
import type { RawSubtitle, SubtitleQuery, SubtitleSearchProvider } from './types.ts'

// OpenSubtitles.com REST v1 — TMDB/IMDb-keyed movies + TV + anime, ordered
// by download count. Anime rides the TV path on the bridged TMDB TV id +
// season (same as SubDL). Key-gated (app key plus user login for file
// downloads): without all three credentials the provider declines. The
// login token is cached per factory for 20h. Download links are resolved
// with bounded concurrency so one slow file does not serialize the whole
// result set.

const API = 'https://api.opensubtitles.com/api/v1'
const UA = 'Consumit subtitles'

export type OpenSubtitlesKeys = { apiKey: string; user: string; pass: string }

export function createOpenSubtitlesProvider(http: SubtitleHttp, keys?: OpenSubtitlesKeys | undefined): SubtitleSearchProvider {
  let tokenCache: { token: string; at: number } | null = null

  async function login(signal: AbortSignal): Promise<string | null> {
    if (!keys) return null
    if (tokenCache && Date.now() - tokenCache.at < 20 * 3600 * 1000) return tokenCache.token
    try {
      const body = await http.post(
        `${API}/login`,
        JSON.stringify({ username: keys.user, password: keys.pass }),
        { 'Api-Key': keys.apiKey, 'User-Agent': UA },
        signal,
      )
      const parsed = JSON.parse(body) as { token?: unknown }
      if (typeof parsed.token !== 'string' || !parsed.token) return null
      tokenCache = { token: parsed.token, at: Date.now() }
      return parsed.token
    } catch {
      return null
    }
  }

  async function downloadLink(fileId: number, token: string, signal: AbortSignal): Promise<string> {
    try {
      const body = await http.post(
        `${API}/download`,
        JSON.stringify({ file_id: fileId }),
        { 'Api-Key': keys!.apiKey, Authorization: `Bearer ${token}`, 'User-Agent': UA },
        signal,
      )
      const parsed = JSON.parse(body) as { link?: unknown }
      return typeof parsed.link === 'string' ? parsed.link : ''
    } catch {
      return ''
    }
  }

  return {
    id: 'opensubtitles',
    name: 'OpenSubtitles',
    supports(query: SubtitleQuery) {
      if (!keys) return false
      if (query.type === 'anime') return !!query.tmdbId
      return (query.type === 'movie' || query.type === 'tv') && !!(query.tmdbId || query.imdbId)
    },
    async search(query: SubtitleQuery, signal: AbortSignal): Promise<RawSubtitle[]> {
      // Anime queries carry the bridged TMDB TV identity; ask upstream as TV.
      const kind = query.type === 'anime' ? 'tv' : query.type
      const params = new URLSearchParams({
        order_by: 'download_count',
        order_direction: 'desc',
      })
      if (query.langs?.length) params.set('languages', query.langs.join(',').toLowerCase())
      if (query.tmdbId) params.set('tmdb_id', String(query.tmdbId).replace(/^tmdb/, ''))
      else if (query.imdbId) params.set('imdb_id', query.imdbId.replace(/^tt/, ''))
      if (kind === 'tv') {
        if (query.season) params.set('season_number', String(query.season))
        if (query.episode) params.set('episode_number', String(query.episode))
      } else if (query.year) {
        params.set('year', String(query.year))
      }
      const { text } = await http.get(`${API}/subtitles?${params}`, {
        'Api-Key': keys!.apiKey,
        'User-Agent': UA,
        Accept: 'application/json',
      }, signal)
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        throw new Error('OpenSubtitles response malformed.')
      }
      const items = (parsed as { data?: unknown }).data
      if (!Array.isArray(items)) return []
      const token = await login(signal)
      if (!token) return []
      const entries = items as Record<string, unknown>[]
      const found: (RawSubtitle | null)[] = Array.from({ length: entries.length }, () => null)
      let cursor = 0
      await Promise.all(Array.from({ length: Math.min(4, entries.length) }, async () => {
        while (cursor < entries.length && !signal.aborted) {
          const index = cursor++
          const item = entries[index]!
          if (!item || typeof item !== 'object') continue
          const attrs = (item.attributes ?? {}) as Record<string, unknown>
          const files = Array.isArray(attrs.files) ? (attrs.files as Record<string, unknown>[]) : []
          const first = files[0]
          if (!first || typeof first.file_id !== 'number') continue
          const url = await downloadLink(first.file_id, token, signal)
          if (!url) continue
          found[index] = {
            url,
            lang: normLang(String(attrs.language || 'en')),
            label: String(first.file_name || attrs.release || 'subtitle').slice(0, 80),
            format: 'srt',
            hi: !!attrs.hearing_impaired,
            release: String(attrs.release || '').slice(0, 80),
            provider: 'opensubtitles',
          }
        }
      }))
      return found.filter((entry): entry is RawSubtitle => entry !== null)
    },
  }
}
