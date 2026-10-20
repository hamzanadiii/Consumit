import type { SubtitleHttp } from './http.ts'
import { normLang } from './lang.ts'
import type { RawSubtitle, SubtitleQuery, SubtitleSearchProvider } from './types.ts'

// CineSrc (cinesrc.st) — keyless subtitle search API, TMDB-keyed.
// Chain (verified live 2026-10-20):
//   POST {SITE}/api/subtitles/search
//   body  { tmdbId, season?, episode?, builtInSubtitles: [] }
//   head  Content-Type json + UA + Referer/Origin SITE
//   ->    { subtitles: [{ id, url, language, display, format, ... }] }
//   file  https://subs.bright67.online/c/... ?format=srt&encoding=...&m=<b64>
//         -> 200 text/plain SRT, direct fetch (Referer/Origin kept).
// 100 subs per movie AND per TV episode. format: keep srt/vtt/ass/ssa (the
// engine converts); skip 'sub' (SubViewer layout, would mangle through
// srtToVtt) and 'txt' (no reliable cue syntax).

const SITE = 'https://cinesrc.st'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const OK_FMT = new Set(['srt', 'vtt', 'ass', 'ssa'])

export function createCineSrcProvider(http: SubtitleHttp): SubtitleSearchProvider {
  return {
    id: 'cinesrc',
    name: 'CineSrc',
    // File URLs are pinned to subs.bright67.online by upstream; the search
    // host never serves files, so an injected destination stays rejected.
    fileHosts: ['subs.bright67.online'],
    supports(query: SubtitleQuery) {
      return !!query.tmdbId
    },
    async search(query: SubtitleQuery, signal: AbortSignal): Promise<RawSubtitle[]> {
      const wantLangs = (query.langs?.length ? query.langs : []).map((lang) => lang.toLowerCase())
      const body: Record<string, unknown> = { tmdbId: String(query.tmdbId), builtInSubtitles: [] }
      if (query.type !== 'movie') {
        body.season = String(Number(query.season ?? 1))
        body.episode = String(Number(query.episode ?? 1))
      }
      let list: unknown[]
      try {
        const text = await http.post(
          `${SITE}/api/subtitles/search`,
          JSON.stringify(body),
          { 'Content-Type': 'application/json', 'User-Agent': UA, Referer: `${SITE}/`, Origin: SITE },
          signal,
        )
        const parsed = JSON.parse(text) as { subtitles?: unknown }
        list = Array.isArray(parsed?.subtitles) ? parsed.subtitles : []
      } catch {
        return []
      }
      const out: RawSubtitle[] = []
      const seen = new Set<string>()
      for (const item of list) {
        const record = item as Record<string, unknown>
        const url = String(record?.url || '')
        const fmt = String(record?.format || 'srt').toLowerCase()
        if (!/^https?:\/\//i.test(url) || seen.has(url)) continue
        if (!OK_FMT.has(fmt)) continue
        const lang = normLang(String(record?.language || ''))
        if (wantLangs.length && !wantLangs.includes(lang)) continue
        seen.add(url)
        out.push({
          url,
          lang,
          label: String(record?.display || record?.language || lang).trim() || lang,
          format: fmt === 'ssa' ? 'ass' : (fmt as 'srt' | 'vtt' | 'ass'),
          provider: 'cinesrc',
          headers: { Referer: `${SITE}/`, Origin: SITE },
        })
      }
      return out
    },
  }
}
