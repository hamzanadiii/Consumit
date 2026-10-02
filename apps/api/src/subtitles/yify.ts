import type { SubtitleHttp } from './http.ts'
import { normLang } from './lang.ts'
import type { RawSubtitle, SubtitleQuery, SubtitleSearchProvider } from './types.ts'

// YIFYSubtitles (yifysubtitles.ch) — keyless, movies only, IMDb-keyed.
// /movie-imdb/{imdb} rows carry rating, language, release, HI, and a subtitle
// page link; the engine downloads the zip, extracts, and converts. Zip
// downloads are Cloudflare/Referer-gated, so the session cookie and
// movie-page Referer travel on the file fetch.

const BASE = 'https://yifysubtitles.ch'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

export function createYifyProvider(http: SubtitleHttp): SubtitleSearchProvider {
  return {
    id: 'yify',
    name: 'YIFYSubs',
    supports(query: SubtitleQuery) {
      return query.type === 'movie' && !!query.imdbId
    },
    async search(query: SubtitleQuery, signal: AbortSignal): Promise<RawSubtitle[]> {
      const pageUrl = `${BASE}/movie-imdb/${query.imdbId}`
      const page = await http.get(pageUrl, { 'User-Agent': UA, Accept: 'text/html' }, signal)
      const fileHeaders: Record<string, string> = { Referer: pageUrl }
      if (page.cookies.length) fileHeaders.Cookie = page.cookies.join('; ')
      const out: RawSubtitle[] = []
      for (const match of page.text.matchAll(/<tr data-id="(\d+)">([\s\S]{0,3000}?)<\/tr>/g)) {
        const row = match[2] ?? ''
        const rating = Number(row.match(/class="label[^"]*">(-?\d+)</)?.[1] || 0)
        const lang = normLang(row.match(/<span class="sub-lang">([^<]+)</)?.[1] || 'English')
        const release = row.match(/<\/span>\s*([^<]+)<\/a>/)?.[1]?.trim() || ''
        const hi = /hi-subtitle/.test(row)
        const subPage = row.match(/href="(\/subtitles\/[^"]+)"/)?.[1]
        if (!subPage) continue
        out.push({
          url: `${BASE}${subPage.replace(/\/subtitles\//, '/subtitle/')}.zip`,
          lang,
          label: `${release || 'subtitle'}${hi ? ' [HI]' : ''}`.slice(0, 80),
          format: 'zip',
          rating,
          hi,
          provider: 'yify',
          needsExtract: true,
          headers: fileHeaders,
        })
      }
      return out
    },
  }
}
