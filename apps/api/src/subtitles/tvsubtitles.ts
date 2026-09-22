import type { SubtitleHttp } from './http.ts'
import type { RawSubtitle, SubtitleQuery, SubtitleSearchProvider } from './types.ts'

// TVSubtitles.net — keyless TV subs in many languages.
// Chain: /tvshows.html (cached 24h) -> tvshow-{id}-{season}.html rows "SxEE"
// with per-language flag links -> subtitle page -> download page -> JS string
// parts forming the zip URL (Referer required). The engine unzips + converts.

const BASE = 'https://www.tvsubtitles.net'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const INDEX_TTL_MS = 24 * 3600 * 1000

const norm = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()

function titleScore(a: string, b: string): number {
  const x = norm(a)
  const y = norm(b)
  if (!x || !y) return 0
  if (x === y) return 1
  const xw = new Set(x.split(' '))
  const yw = new Set(y.split(' '))
  let inter = 0
  for (const word of xw) if (yw.has(word)) inter++
  return inter / Math.max(xw.size, yw.size)
}

export function createTvSubtitlesProvider(http: SubtitleHttp): SubtitleSearchProvider {
  let indexCache: { at: number; rows: { id: string; title: string }[] } | null = null

  async function showIndex(signal: AbortSignal): Promise<{ id: string; title: string }[]> {
    if (indexCache && Date.now() - indexCache.at < INDEX_TTL_MS) return indexCache.rows
    const { text } = await http.get(`${BASE}/tvshows.html`, { 'User-Agent': UA, Accept: 'text/html' }, signal, 2_097_152)
    const rows: { id: string; title: string }[] = []
    for (const match of text.matchAll(/<a href="tvshow-(\d+)-\d+\.html"><b>([^<]+)<\/b><\/a>/g)) {
      if (match[1]) rows.push({ id: match[1], title: (match[2] ?? '').trim() })
    }
    indexCache = { at: Date.now(), rows }
    return rows
  }

  async function resolveZip(subPage: string, signal: AbortSignal): Promise<string> {
    const page = await http.get(subPage, { 'User-Agent': UA, Accept: 'text/html', Referer: `${BASE}/` }, signal)
    const dl = page.text.match(/href="(download-\d+\.html)"/)?.[1]
    if (!dl) throw new Error('TVSubtitles download page missing.')
    const waiting = await http.get(`${BASE}/${dl}`, { 'User-Agent': UA, Accept: 'text/html', Referer: subPage }, signal)
    const parts = [...waiting.text.matchAll(/var s\d+=\s*'([^']*)'/g)].map((match) => match[1] ?? '')
    if (!parts.length) throw new Error('TVSubtitles zip parts missing.')
    const final = parts.join('')
    return final.startsWith('http') ? final : `${BASE}/${final.replace(/^\//, '')}`
  }

  return {
    id: 'tvsubtitles',
    name: 'TVSubtitles',
    supports(query: SubtitleQuery) {
      // TV + anime series (the index lists anime like Naruto/One Piece;
      // best-effort mapping with season 1 and the absolute episode number).
      return (query.type === 'tv' || query.type === 'anime') && !!query.title
    },
    async search(query: SubtitleQuery, signal: AbortSignal): Promise<RawSubtitle[]> {
      const shows = await showIndex(signal)
      let best = ''
      let bestScore = 0
      for (const show of shows) {
        const score = titleScore(show.title, query.title!)
        if (score > bestScore) {
          bestScore = score
          best = show.id
        }
      }
      if (!best || bestScore < 0.5) throw new Error(`TVSubtitles has no show matching "${query.title}".`)
      const season = query.type === 'anime' ? 1 : (query.season ?? 1)
      const episode = query.episode ?? 1
      const { text } = await http.get(`${BASE}/tvshow-${best}-${season}.html`, { 'User-Agent': UA, Accept: 'text/html' }, signal)
      const wantLangs = (query.langs?.length ? query.langs : []).map((lang) => lang.toLowerCase())
      const out: RawSubtitle[] = []
      for (const match of text.matchAll(/<td>(\d+)x(\d+)<\/td>([\s\S]{0,4000}?)<\/tr>/g)) {
        if (Number(match[1]) !== season || Number(match[2]) !== episode) continue
        const row = match[3] ?? ''
        const flags = [...row.matchAll(/<a href="(subtitle-\d+\.html)"><img[^>]+alt="([a-z]+)"/g)].map((flag) => ({
          url: `${BASE}/${flag[1]}`,
          lang: (flag[2] ?? 'en').toLowerCase(),
        }))
        const picked = wantLangs.length ? flags.filter((flag) => wantLangs.includes(flag.lang)) : flags
        for (const flag of (picked.length ? picked : flags).slice(0, 24)) {
          out.push({ url: flag.url, lang: flag.lang, label: `S${season}E${episode}`, format: 'other', provider: 'tvsubtitles' })
        }
        break // Only the requested episode row.
      }
      const settled = await Promise.allSettled(out.map((entry) => resolveZip(entry.url, signal)))
      const resolved: RawSubtitle[] = []
      settled.forEach((result, index) => {
        if (result.status !== 'fulfilled' || !result.value) return
        const entry = out[index]!
        resolved.push({
          url: result.value,
          lang: entry.lang,
          label: entry.label,
          format: 'zip',
          provider: 'tvsubtitles',
          needsExtract: true,
          headers: { Referer: `${BASE}/` },
        })
      })
      return resolved
    },
  }
}
