import type { SubtitleHttp } from './http.ts'
import { normLang } from './lang.ts'
import type { RawSubtitle, SubtitleQuery, SubtitleSearchProvider } from './types.ts'

// OpenSubtitles.com REST v1 — TMDB/IMDb-keyed movies + TV, ordered by
// download count. Key-gated (app key plus user login for file downloads):
// without all three credentials the provider declines. The login token is
// cached per factory for 20h. Download-link resolution is bounded to the
// first few files so one slow title cannot hold the aggregation.

const API = 'https://api.opensubtitles.com/api/v1'
const UA = 'Consumit subtitles'
const MAX_DOWNLOAD_LINKS = 8

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
      return !!keys && (query.type === 'movie' || query.type === 'tv') && !!(query.tmdbId || query.imdbId)
    },
    async search(query: SubtitleQuery, signal: AbortSignal): Promise<RawSubtitle[]> {
      const params = new URLSearchParams({
        languages: (query.langs?.length ? query.langs : ['en']).join(',').toLowerCase(),
        order_by: 'download_count',
        order_direction: 'desc',
      })
      if (query.tmdbId) params.set('tmdb_id', String(query.tmdbId).replace(/^tmdb/, ''))
      else if (query.imdbId) params.set('imdb_id', query.imdbId.replace(/^tt/, ''))
      if (query.type === 'tv') {
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
      const out: RawSubtitle[] = []
      for (const item of items.slice(0, 25) as Record<string, unknown>[]) {
        const attrs = (item.attributes ?? {}) as Record<string, unknown>
        const files = Array.isArray(attrs.files) ? (attrs.files as Record<string, unknown>[]) : []
        const first = files[0]
        if (!first || typeof first.file_id !== 'number') continue
        if (out.length >= MAX_DOWNLOAD_LINKS) break
        const url = await downloadLink(first.file_id, token, signal)
        if (!url) continue
        out.push({
          url,
          lang: normLang(String(attrs.language || 'en')),
          label: String(first.file_name || attrs.release || 'subtitle').slice(0, 80),
          format: 'srt',
          hi: !!attrs.hearing_impaired,
          release: String(attrs.release || '').slice(0, 80),
          provider: 'opensubtitles',
        })
      }
      return out
    },
  }
}
