import type { SubtitleHttp } from './http.ts'
import type { RawSubtitle, SubtitleQuery, SubtitleSearchProvider } from './types.ts'

// bAnime (banime.dedyn.io) — English anime subtitles, keyless.
//   GET /api/os/sub?title={title}&ep={n}&lang=en  (primary, instant VTT)
//   GET /api/ank/sub?title={title}&ep={n}&lang=en (fallback, async queue)
// Both return raw VTT (validated here by cue count, re-validated by the
// engine on download); ACAO:* on OS. Title variants are tried like the
// first-party client (full, pre-colon, pre-dash).

const BASE = 'https://banime.dedyn.io'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function variants(title: string): string[] {
  const out = [title.trim()]
  const preColon = title.split(':')[0]?.trim() ?? ''
  if (preColon && preColon !== title.trim()) out.push(preColon)
  const preDash = title.split(' - ')[0]?.trim() ?? ''
  if (preDash && preDash !== title.trim() && preDash !== preColon) out.push(preDash)
  return out.filter(Boolean).slice(0, 3)
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export function createBanimeProvider(http: SubtitleHttp): SubtitleSearchProvider {
  return {
    id: 'banimesubs',
    name: 'bAnimeSubs',
    // The VTT bytes come from the same API endpoint the search called; the
    // scope pins both legs to the service host.
    fileHosts: ['banime.dedyn.io'],
    supports(query: SubtitleQuery) {
      return query.type === 'anime' && !!query.title
    },
    async search(query: SubtitleQuery, signal: AbortSignal): Promise<RawSubtitle[]> {
      const ep = Number(query.absoluteEpisode ?? query.episode ?? 1)
      if (!Number.isFinite(ep) || ep <= 0) return []
      const out: RawSubtitle[] = []
      for (const title of variants(String(query.title ?? ''))) {
        const settled = await Promise.allSettled([
          tryBackend(http, 'os', title, ep, signal, false),
          tryBackend(http, 'ank', title, ep, signal, true),
        ])
        for (const result of settled) {
          if (result.status === 'fulfilled' && result.value) out.push(result.value)
        }
        if (out.length >= 2) break
      }
      return out.slice(0, 2)
    },
  }
}

async function tryBackend(
  http: SubtitleHttp,
  backend: 'os' | 'ank',
  title: string,
  ep: number,
  signal: AbortSignal,
  retryQueued: boolean,
): Promise<RawSubtitle | null> {
  const url = `${BASE}/api/${backend}/sub?title=${encodeURIComponent(title)}&ep=${ep}&lang=en`
  // ank queues in the background (404 queued:true) — poll briefly for the cache to fill
  const attempts = retryQueued ? 3 : 1
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) {
      if (signal.aborted) return null
      await sleep(3000)
    }
    try {
      const { text } = await http.get(url, { 'User-Agent': UA, Accept: '*/*', Referer: `${BASE}/` }, signal)
      if ((text.match(/-->/g) ?? []).length < 10) continue
      return {
        url,
        lang: 'en',
        label: backend === 'os' ? 'English (OS)' : 'English (alt)',
        format: 'vtt',
        provider: 'banimesubs',
        headers: { Referer: `${BASE}/` },
      }
    } catch {
      if (signal.aborted) return null // aborted: no retry
    }
  }
  return null
}
