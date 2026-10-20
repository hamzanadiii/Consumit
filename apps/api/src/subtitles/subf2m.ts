import type { SubtitleHttp } from './http.ts'
import { normLang } from './lang.ts'
import type { RawSubtitle, SubtitleQuery, SubtitleSearchProvider } from './types.ts'

// Subf2m (subf2m.co) — keyless, movies + TV (per-season slugs), multi-language.
// Chain (verified live 2026-10-20):
//   movie: /subtitles/{slug}
//   tv:    /subtitles/{slug}-season-{n}  (digit form, e.g. mobland-season-2)
//          /subtitles/{slug}-{ordinal}-season (word form, e.g. ...-fourth-season)
//          /subtitles/{slug}              (bare: complete-series packs)
//   page:  <li class='item'> blocks — <span class='language X'>Name</span>
//          + release <li>SxxExx ...</li> + <a class='download' href='/subtitles/{slug}/{lang}/{id}'>
//   file:  {href}/download  -> 302 isubcdn.com/...zip (engine scope admits both).
// Slug = lowercase title, non-alnum -> dash. No year in slug for movies.
// Missing season slugs 404 quickly (no per-attempt retry on 404).

const BASE = 'https://subf2m.co'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const ORDINALS = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth',
  'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth']

const slugify = (title: string) =>
  title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export function createSubf2mProvider(http: SubtitleHttp): SubtitleSearchProvider {
  return {
    id: 'subf2m',
    name: 'Subf2m',
    // Search pages and zips share the site host until /download redirects
    // to the isubcdn.com CDN that serves the actual bytes.
    fileHosts: ['subf2m.co', '*.subf2m.co', 'isubcdn.com', '*.isubcdn.com'],
    supports(query: SubtitleQuery) {
      return (query.type === 'movie' || query.type === 'tv' || query.type === 'anime') && !!query.title
    },
    async search(query: SubtitleQuery, signal: AbortSignal): Promise<RawSubtitle[]> {
      const base = slugify(String(query.title ?? ''))
      if (!base) return []
      const season = Number(query.season ?? 1)
      const paths =
        query.type === 'tv'
          ? [
              `/subtitles/${base}-season-${season}`,
              `/subtitles/${base}-${ORDINALS[season] ?? ''}-season`.replace(/--+/g, '-'),
              `/subtitles/${base}`,
            ]
          : [`/subtitles/${base}`]
      let html: string | null = null
      for (const path of paths) {
        html = await get(http, `${BASE}${path}`, `${BASE}/`, signal)
        if (html) break
      }
      if (!html) return []

      const wantLangs = (query.langs?.length ? query.langs : []).map((lang) => lang.toLowerCase())
      const epTag =
        query.type === 'tv'
          ? new RegExp(`s0*${Number(query.season ?? 1)}e0*${Number(query.episode ?? 1)}`, 'i')
          : null

      const out: RawSubtitle[] = []
      // item blocks: language span ... download href (order can vary; capture window)
      const re =
        /<li class='item[\s\S]{0,4000}?<span class='language[^']*'>([^<]+)<\/span>([\s\S]{0,3000}?)<a class='download[^']*' href='([^']+)'[\s\S]{0,200}?<\/li>/gi
      let match: RegExpExecArray | null
      while ((match = re.exec(html)) !== null) {
        const lang = normLang(match[1] ?? '')
        const block = match[2] ?? ''
        const href = match[3] ?? ''
        if (!href) continue
        if (wantLangs.length && !wantLangs.includes(lang)) continue
        // TV episode filter from release-name <li> tags inside the block.
        // Entries without any episode tag are season-wide packs — kept.
        if (epTag) {
          const releases = [...block.matchAll(/<li>([^<]+)<\/li>/gi)].map((entry) => entry[1] ?? '')
          const hay = releases.join(' ')
          if (hay && !epTag.test(hay) && /s\d{1,2}e\d{1,2}/i.test(hay)) continue
        }
        const release =
          block.match(/<li>([^<]*S\d{1,2}E\d{1,2}[^<]*)<\/li>/i)?.[1]?.trim() ||
          block.match(/<li>([^<]{8,90})<\/li>/i)?.[1]?.trim() ||
          ''
        out.push({
          url: `${BASE}${href.replace(/\/$/, '')}/download`,
          lang,
          label: release || lang,
          format: 'zip',
          provider: 'subf2m',
          needsExtract: true,
          headers: { Referer: `${BASE}${href}` },
        })
      }
      return out
    },
  }
}

async function get(http: SubtitleHttp, url: string, referer: string, signal: AbortSignal): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (attempt > 0) await sleep(1000)
      const { text } = await http.get(url, { 'User-Agent': UA, Accept: 'text/html,*/*', Referer: referer }, signal)
      if (text.length > 500) return text
      return null // a short body is a stable miss: a retry would re-read the same page
    } catch (error) {
      if (signal.aborted) return null // aborted: no retry
      if (error instanceof Error && /\bHTTP 404\b/.test(error.message)) return null // missing slug: next path
    }
  }
  return null
}
