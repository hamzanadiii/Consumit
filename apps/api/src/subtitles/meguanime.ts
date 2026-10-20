import type { SubtitleHttp } from './http.ts'
import { normLang } from './lang.ts'
import type { RawSubtitle, SubtitleQuery, SubtitleSearchProvider } from './types.ts'

// MeguAnimes (meguanime.com) — keyless anime subtitles, AniList-keyed.
// Chain (verified live 2026-10-20):
//   GET /api/{lane}?al={anilistId}&ep={n}&lang=sub   -> { tracks:[{file,label,kind}] }
//   lanes: miruro (8/8 eps, up to 16 langs) -> zoko (fallback).
//   aniwaves/kiwi return 0 tracks, animegg times out, anibd URLs 404 — skipped.
//   file: https://cdn[2].meguanime.com/p?u=<enc upstream>  signed relay ~24h,
//   BARE-OK (200 text/vtt, no headers).
// Labels carry extras ("English (- (Crunchyroll))", "Portuguese (- Portugues(Brasil))",
// "English 2", native names) — cleaned before normLang.

const SITE = 'https://meguanime.com'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36'

const LANES = ['miruro', 'zoko']

// label forms normLang cannot reach directly
const EXTRA: Record<string, string> = {
  'bahasa indonesia': 'id',
  'bahasa melayu': 'ms',
  'tiếng việt': 'vi',
  'tieng viet': 'vi',
  'ภาษาไทย': 'th',
  '中文': 'zh',
  '中文（简体）': 'zh',
  '中文（繁体）': 'zh',
}

function langOf(label: string): string {
  let s = String(label || '').trim()
  s = s.replace(/\s*\(-.*$/, '').trim() // "Portuguese (- Portugues(Brasil))" -> "Portuguese"
  s = s.replace(/\s+\d+$/, '').trim() // "English 2" -> "English"
  if (!s) return 'en'
  const key = s.toLowerCase()
  if (EXTRA[key]) return EXTRA[key]!
  return normLang(s)
}

export function createMeguAnimeProvider(http: SubtitleHttp): SubtitleSearchProvider {
  return {
    id: 'meguanimesubs',
    name: 'MeguAnimesSubs',
    // Files ride the signed cdn/cdn subdomain relay; the search host itself
    // never serves subtitle bytes.
    fileHosts: ['*.meguanime.com', 'meguanime.com'],
    supports(query: SubtitleQuery) {
      return query.type === 'anime' && !!query.anilistId
    },
    async search(query: SubtitleQuery, signal: AbortSignal): Promise<RawSubtitle[]> {
      const alid = Number(query.anilistId)
      const ep = Number(query.absoluteEpisode ?? query.episode ?? 1)
      if (!Number.isFinite(alid) || alid <= 0 || !Number.isFinite(ep) || ep <= 0) return []
      const wantLangs = (query.langs?.length ? query.langs : []).map((lang) => lang.toLowerCase())
      const out: RawSubtitle[] = []
      const seen = new Set<string>()
      for (const lane of LANES) {
        if (out.length) break
        let tracks: unknown[]
        try {
          const { text } = await http.get(`${SITE}/api/${lane}?al=${alid}&ep=${ep}&lang=sub`, {
            'User-Agent': UA,
            Accept: 'application/json',
            Referer: `${SITE}/`,
          }, signal)
          const parsed = JSON.parse(text) as { tracks?: unknown }
          tracks = Array.isArray(parsed?.tracks) ? parsed.tracks : []
        } catch {
          continue // next lane
        }
        for (const item of tracks) {
          const record = item as Record<string, unknown>
          if (record?.kind === 'thumbnails') continue
          const url = String(record?.file || record?.url || '')
          if (!/^https?:\/\//i.test(url) || seen.has(url)) continue
          const lang = langOf(String(record?.label || ''))
          if (wantLangs.length && !wantLangs.includes(lang)) continue
          seen.add(url)
          out.push({
            url,
            lang,
            label: String(record?.label || 'Subtitle').trim() || lang,
            format: 'vtt',
            provider: 'meguanimesubs',
          })
        }
      }
      return out
    },
  }
}
