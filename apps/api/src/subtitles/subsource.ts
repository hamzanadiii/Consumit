import type { SubtitleHttp } from './http.ts'
import { normLang } from './lang.ts'
import type { RawSubtitle, SubtitleQuery, SubtitleSearchProvider } from './types.ts'

// SubSource (subsource.net) — keyless, movies (+TV/anime best-effort).
// /subtitles/{slug}-{year} lists entries /subtitle/{slug}/{lang}/{id}; each
// entry page holds a fresh api.subsource.net download hash for the real zip.
// Slug misses 404, in which case the provider yields nothing and the engine
// covers the title through the other providers. Entry fetches stay sequential
// in small batches — bursts get rate-limited upstream.

const SITE = 'https://subsource.net'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const slugify = (title: string) =>
  title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

const ORDINALS = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth',
  'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth']

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export function createSubSourceProvider(http: SubtitleHttp): SubtitleSearchProvider {
  return {
    id: 'subsource',
    name: 'SubSource',
    supports(query: SubtitleQuery) {
      // Movies/TV need title + year for the slug; anime answers by title
      // alone (year is absent on anime queries) on the TV slug path with
      // the mapped season and the absolute episode.
      return !!query.title && (query.type === 'anime' || !!query.year)
    },
    async search(query: SubtitleQuery, signal: AbortSignal): Promise<RawSubtitle[]> {
      const base = slugify(query.title!)
      const jar = new Map<string, string>()
      const isSeries = query.type !== 'movie'
      const slugs =
        isSeries
          ? [`${base}-${ORDINALS[Number(query.season ?? 1)] || ''}-season`.replace(/--+/g, '-'), base]
          : query.year
            ? [`${base}-${query.year}`, base]
            : [base]
      let page: string | null = null
      for (const slug of slugs) {
        if (!slug.replace(/-/g, '')) continue
        try {
          const response = await http.get(`${SITE}/subtitles/${slug}`, { 'User-Agent': UA, Accept: 'text/html,*/*', Referer: `${SITE}/` }, signal)
          for (const cookie of response.cookies) {
            const [k, v] = cookie.split('=')
            if (k) jar.set(k, v ?? '')
          }
          page = response.text
          break
        } catch {
          continue
        }
      }
      if (!page) return []
      const out: RawSubtitle[] = []
      const wantLangs = (query.langs?.length ? query.langs : []).map((lang) => lang.toLowerCase())
      const epTag = isSeries ? new RegExp(`s0*${Number(query.season ?? 1)}e0*${Number(query.episode ?? 1)}`, 'i') : null
      for (const match of page.matchAll(/<a[^>]+href="(\/subtitle\/[^"]+\/([a-z]+)\/(\d+))"[^>]*>([\s\S]{0,300}?)<\/a>/g)) {
        const lang = normLang(match[2] ?? '')
        if (wantLangs.length && !wantLangs.includes(lang)) continue
        const release = (match[4] ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
        if (epTag && !epTag.test(release)) continue
        out.push({ url: `${SITE}${match[1]}`, lang, label: release || lang, format: 'other', provider: 'subsource' })
      }
      // Resolve every returned match in bounded batches. Discovery pages the
      // resulting candidates; no language is silently trimmed here.
      const targets = out
      const resolved: RawSubtitle[] = []
      for (let i = 0; i < targets.length; i += 4) {
        const batch = targets.slice(i, i + 4)
        const settled = await Promise.allSettled(batch.map(async (entry) => {
          const cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
          const html = await http.get(entry.url, { 'User-Agent': UA, Accept: 'text/html,*/*', Referer: `${SITE}/`, ...(cookie ? { Cookie: cookie } : {}) }, signal)
          for (const c of html.cookies) {
            const [k, v] = c.split('=')
            if (k) jar.set(k, v ?? '')
          }
          const dl = html.text.match(/https:\/\/api\.subsource\.net\/v1\/subtitle\/download\/([a-f0-9]+)/)?.[0]
          if (!dl) throw new Error('SubSource download hash missing.')
          return dl
        }))
        settled.forEach((result, j) => {
          if (result.status !== 'fulfilled' || !result.value) return
          const entry = batch[j]!
          const cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
          resolved.push({
            url: result.value,
            lang: entry.lang,
            label: entry.label,
            format: 'zip',
            provider: 'subsource',
            needsExtract: true,
            headers: { Referer: entry.url, ...(cookie ? { Cookie: cookie } : {}) },
          })
        })
        if (i + 4 < targets.length) await sleep(800)
      }
      return resolved
    },
  }
}
