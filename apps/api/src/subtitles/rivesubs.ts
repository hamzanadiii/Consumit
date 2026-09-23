import type { SubtitleHttp } from './http.ts'
import { normTrackLang } from './lang.ts'
import type { RawSubtitle, SubtitleQuery, SubtitleSearchProvider } from './types.ts'

// RiveSubs — captions from RiveStream sub-providers (keyless, TMDB-keyed).
// FlowCast returns up to ~15 subtitle tracks per title (direct SRTs);
// Citadel/Apex queried as backup. Labels arrive in native script
// ("اَلْعَرَبِيَّةُ - FlowCast") so language is detected by script when
// the name is not parseable — never defaulting blindly to English.
const API = 'https://scrapper.rivestream.app/api'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const SUBS = ['flowcast', 'citadel', 'apex'] as const

export function createRiveSubsProvider(http: SubtitleHttp): SubtitleSearchProvider {
  return {
    id: 'rivesubs',
    name: 'RiveSubs',
    supports(query: SubtitleQuery) {
      return (query.type === 'movie' || query.type === 'tv') && !!query.tmdbId
    },
    async search(query: SubtitleQuery, signal: AbortSignal): Promise<RawSubtitle[]> {
      const tmdbId = String(query.tmdbId)
      const settled = await Promise.allSettled(
        SUBS.map(async (sub) => {
          let url = `${API}/provider?provider=${sub}&id=${encodeURIComponent(tmdbId)}`
          if (query.type === 'tv') url += `&season=${Number(query.season ?? 1)}&episode=${Number(query.episode ?? 1)}`
          const { text } = await http.get(url, { 'User-Agent': UA, Accept: 'application/json' }, signal)
          let parsed: unknown
          try {
            parsed = JSON.parse(text)
          } catch {
            return []
          }
          const data = parsed as { data?: { captions?: unknown } }
          const caps = Array.isArray(data?.data?.captions) ? data.data.captions : []
          return caps.flatMap((entry) => {
            const record = entry as Record<string, unknown>
            const file = String(record.file || '')
            if (!file) return []
            return [{ label: String(record.label || 'Unknown'), file }]
          })
        }),
      )
      const seen = new Set<string>()
      const out: RawSubtitle[] = []
      for (const result of settled) {
        if (result.status !== 'fulfilled') continue
        for (const caption of result.value) {
          if (seen.has(caption.file) || out.length >= 30) continue
          seen.add(caption.file)
          const label = caption.label.replace(/\s*-\s*(FlowCast|Citadel|Apex)\s*$/i, '').trim() || caption.label
          out.push({
            url: caption.file,
            lang: normTrackLang(caption.label),
            label,
            format: /\.srt/i.test(caption.file) ? 'srt' : 'vtt',
            provider: 'rivesubs',
          })
        }
        if (out.length >= 30) break
      }
      return out
    },
  }
}
