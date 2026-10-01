import type { SubtitleHttp } from './http.ts'
import { normLang } from './lang.ts'
import type { RawSubtitle, SubtitleQuery, SubtitleSearchProvider } from './types.ts'

// SubDL (api.subdl.com) — TMDB/IMDb-keyed movies + TV + anime, unpack=1
// returns per-file raw SRT URLs (no zip handling). Anime rides the TV path:
// the ani.zip bridge maps the canonical episode to a TMDB TV id + season,
// so the upstream query is indistinguishable from TV. Key-gated: without
// SUBDL_API_KEY the provider declines and the engine covers the title
// through the others. Anonymous downloads are rate-limited upstream
// (300/day/IP); language preference narrows the request server-side.

const API = 'https://api.subdl.com/api/v1'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

export function createSubDlProvider(http: SubtitleHttp, apiKey?: string | undefined): SubtitleSearchProvider {
  return {
    id: 'subdl',
    name: 'SubDL',
    supports(query: SubtitleQuery) {
      if (!apiKey) return false
      if (query.type === 'anime') return !!query.tmdbId
      return (query.type === 'movie' || query.type === 'tv') && !!(query.tmdbId || query.imdbId)
    },
    async search(query: SubtitleQuery, signal: AbortSignal): Promise<RawSubtitle[]> {
      // Anime queries carry the bridged TMDB TV identity; ask upstream as TV.
      const kind = query.type === 'anime' ? 'tv' : query.type
      const params = new URLSearchParams({
        api_key: apiKey!,
        type: kind,
        unpack: '1',
        hi: '1',
        subs_per_page: '30',
      })
      if (query.langs?.length) params.set('languages', query.langs.join(',').toUpperCase())
      if (query.tmdbId) params.set('tmdb_id', String(query.tmdbId))
      else if (query.imdbId) params.set('imdb_id', query.imdbId)
      if (kind === 'tv') {
        if (query.season) params.set('season_number', String(query.season))
        if (query.episode) params.set('episode_number', String(query.episode))
      } else if (query.year) {
        params.set('year', String(query.year))
      }
      const { text } = await http.get(`${API}/subtitles?${params}`, { 'User-Agent': UA, Accept: 'application/json' }, signal)
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        throw new Error('SubDL response malformed.')
      }
      const body = parsed as { status?: unknown; error?: unknown; subtitles?: unknown }
      if (!body?.status) throw new Error(String(body?.error || 'SubDL request failed.'))
      const out: RawSubtitle[] = []
      for (const entry of (Array.isArray(body.subtitles) ? body.subtitles : []) as Record<string, unknown>[]) {
        const files = Array.isArray(entry.unpack_files) ? (entry.unpack_files as Record<string, unknown>[]) : []
        if (files.length) {
          for (const file of files) {
            if (kind === 'tv' && query.episode && Number(file.episode) !== Number(query.episode)) continue
            if (kind === 'tv' && query.season && Number(file.season) !== Number(query.season)) continue
            push(out, String(file.url || ''), String(file.language || 'EN'), String(file.name || entry.release_name || ''), !!file.hi, String(file.release_name || ''))
          }
        } else if (entry.url) {
          push(out, String(entry.url), String(entry.language || 'EN'), String(entry.name || entry.release_name || ''), !!entry.hi, String(entry.release_name || ''))
        }
      }
      return out
    },
  }
}

function push(out: RawSubtitle[], url: string, language: string, name: string, hi: boolean, release: string) {
  const absolute = /^https?:\/\//.test(url) ? url : `https://dl.subdl.com${url.startsWith('/') ? url : `/${url}`}`
  out.push({
    url: absolute,
    lang: normLang(language),
    label: (name || language).slice(0, 80),
    format: /\.srt(\?|#|$)/i.test(absolute) ? 'srt' : /\.vtt(\?|#|$)/i.test(absolute) ? 'vtt' : 'srt',
    hi,
    release: release.slice(0, 80),
    provider: 'subdl',
  })
}
