import { createAnizipClient } from './anizip.ts'
import type { SubtitleHttp } from './http.ts'
import type { RawSubtitle, SubtitleQuery, SubtitleSearchProvider } from './types.ts'

// AnimeTosho.xyz — keyless anime subtitles, AniDB-episode-precise.
// Chain (verified live against PROVE 2026-09-30; same flow as Bazarr's
// animetosho_xyz provider):
//   1. ani.zip bridge: anilist id -> episodes[canonical].anidbEid
//   2. feed.animetosho.xyz/feed/json?eid={anidbEid} -> newest `complete`
//      releases first (keyless, no auth)
//   3. feed.animetosho.xyz/json?show=torrent&id={id} -> attachments[]
//      [{type:'subtitle', url:'https://storage.animetosho.net/...eng.ass[.xz]',
//        info:{format:'ASS', language:'English', language_code:'eng'}}]
// Direct HTTPS downloads in ~17 languages. Plain .ass/.srt sort before
// .ass.xz singles (the engine decompresses XZ when the binary exists and
// skips gracefully where it does not).

const FEED = 'https://feed.animetosho.net'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// ISO 639-2/B (what AnimeTosho reports) to the 639-1 codes the engine ranks.
const ALPHA3_TO_ALPHA2: Record<string, string> = {
  eng: 'en', spa: 'es', fre: 'fr', fra: 'fr', ger: 'de', deu: 'de',
  ita: 'it', por: 'pt', pol: 'pl', rus: 'ru', ara: 'ar', hin: 'hi',
  jpn: 'ja', kor: 'ko', chi: 'zh', zho: 'zh', dut: 'nl', nld: 'nl',
  cze: 'cs', ces: 'cs', hun: 'hu', rum: 'ro', ron: 'ro', gre: 'el',
  ell: 'el', ukr: 'uk', hrv: 'hr', srp: 'sr', slv: 'sl', slk: 'sk',
  slo: 'sk', dan: 'da', nor: 'no', swe: 'sv', fin: 'fi', heb: 'he',
  ind: 'id', tha: 'th', tur: 'tr', vie: 'vi', tam: 'ta', tel: 'te',
  mal: 'ml', ben: 'bn', urd: 'ur', fas: 'fa',
}

async function getJson(http: SubtitleHttp, url: string, signal: AbortSignal): Promise<unknown> {
  const { text } = await http.get(url, { 'User-Agent': UA, Accept: 'application/json' }, signal)
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('AnimeTosho response malformed.')
  }
}

export function createAnimeToshoProvider(http: SubtitleHttp): SubtitleSearchProvider {
  // The http client must allowlist api.ani.zip (mapping) and the
  // feed.animetosho.* hosts (the .xyz domain 308-redirects to .net, and the
  // transport re-validates every redirect); file downloads ride the engine's
  // hostname-scoped fetch.
  const anizip = createAnizipClient(http)
  return {
    id: 'animetosho',
    name: 'AnimeTosho',
    // Attachment URLs come from the feed JSON but are AnimeTosho storage
    // (storage.animetosho.net); an injected entry cannot aim the fetch.
    fileHosts: [
      'animetosho.net', '*.animetosho.net',
      'animetosho.org', '*.animetosho.org',
      'animetosho.xyz', '*.animetosho.xyz',
    ],
    supports(query: SubtitleQuery) {
      // The precise path needs an AniList id (ani.zip -> AniDB episode id).
      // Title-only anime queries stay with TVSubtitles.
      return query.type === 'anime' && !!query.anilistId
    },
    async search(query: SubtitleQuery, signal: AbortSignal): Promise<RawSubtitle[]> {
      // Canonical absolute episode first, plain episode as fallback; the
      // AniList entry owns numbering, provider quirks stay here.
      const episode = Number(query.absoluteEpisode ?? query.episode ?? 1)
      const mapped = await anizip.episodeFor(Number(query.anilistId), episode, signal)
      if (!mapped?.anidbEid) return []
      const wantLangs = (query.langs?.length ? query.langs : ['en']).map((lang) => lang.toLowerCase())
      const feed = await getJson(http, `${FEED}/feed/json?eid=${mapped.anidbEid}`, signal)
      const entries = (Array.isArray(feed) ? feed : [])
        .filter((entry) => (entry as Record<string, unknown>)?.status === 'complete' && (entry as Record<string, unknown>)?.id)
        .sort((a, b) => Number((b as Record<string, unknown>).timestamp || 0) - Number((a as Record<string, unknown>).timestamp || 0))
        .slice(0, 2) // Newest two releases keep the search inside budget.
      if (!entries.length) return []
      const settled = await Promise.allSettled(
        entries.map(async (entry) => {
          const record = entry as Record<string, unknown>
          const detail = await getJson(http, `${FEED}/json?show=torrent&id=${record.id}`, signal)
          return { detail, title: String(record.title || '') }
        }),
      )
      const out: RawSubtitle[] = []
      const seen = new Set<string>()
      for (const result of settled) {
        if (result.status !== 'fulfilled') continue
        const attachments = Array.isArray((result.value.detail as Record<string, unknown>)?.attachments)
          ? (result.value.detail as { attachments: Record<string, unknown>[] }).attachments
          : []
        // Plain files first so XZ decompression is the fallback, not the norm.
        attachments.sort((a, b) => {
          const xz = (entry: Record<string, unknown>) => /\.xz(\?|#|$)/i.test(String(entry.url || '')) ? 1 : 0
          return xz(a) - xz(b)
        })
        for (const attachment of attachments) {
          if (attachment.type !== 'subtitle') continue
          const url = String(attachment.url || '')
          if (!/^https:\/\//.test(url) || seen.has(url)) continue
          const info = (attachment.info ?? {}) as Record<string, unknown>
          const lang = (ALPHA3_TO_ALPHA2[String(info.language_code || '').toLowerCase()] ?? 'en').toLowerCase()
          if (!wantLangs.includes(lang)) continue
          seen.add(url)
          const format = String(info.format || '').toUpperCase()
          const isAss = format === 'ASS' || format === 'SSA' || /\.ass(\.xz)?(\?|#|$)/i.test(url)
          out.push({
            url,
            lang,
            label: `${String(info.language || lang)}${info.default ? ' ★' : ''} (AnimeTosho)`.slice(0, 80),
            format: isAss ? 'ass' : 'srt',
            ...(info.default ? { rating: 2 } : {}),
            ...(result.value.title ? { release: result.value.title.slice(0, 80) } : {}),
            provider: 'animetosho',
          })
          if (out.length >= 12) return out
        }
      }
      return out
    },
  }
}
