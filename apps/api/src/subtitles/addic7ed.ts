import type { SubtitleHttp } from './http.ts'
import { normLang } from './lang.ts'
import type { RawSubtitle, SubtitleQuery, SubtitleSearchProvider } from './types.ts'

// Addic7ed (addic7ed.com) — keyless, movies + TV (ajax season load), EN-first.
// Chain (verified live 2026-10-20):
//   movie search: /search.php?search={title}  -> inline subtitle table
//     rows: class="language">Name ... href="/original/{id}/{idx}"
//   tv search:    /search.php?search={title}  embeds the LATEST-season episode
//     table (500+ rows, /updated/ links) + hidden input showID={id}.
//     Result links point at /serie/... — /show/ links on the page are only
//     the "most popular" sidebar (any title -> same list, never trust them).
//     Older seasons: GET /ajax_loadShow.php?show={id}&season={n}&langs=&hd=&hi=
//     rows: <tr class="epeven|epodd ..."> <td>S</td><td>E</td>
//       <td><a href="/serie/...">Title</a></td><td>Lang</td>
//       <td class="c">Version</td> ... <a href="/updated/{langIdx}/{subId}/{fileIdx}">Download</a>
//   file movie: /original/{id}/{idx}      -> text/srt raw
//   file tv:    /updated/{langIdx}/{subId}/{fileIdx} -> text/srt raw (UTF-8
//     BOM possible; decodeSubtitleText/srtToVtt strip it)
//   throttle:   search/ajax endpoints sleep 3-21 s before the first byte
//     (raw file endpoints answer in <1 s; TCP is 45 ms — the delay is
//     server-side and a PHPSESSID session does NOT reliably avoid it, but
//     reuse occasionally lands sub-second answers, so carry it). Discovery
//     therefore treats this adapter as opportunistic: timeoutMs 11 s, then
//     the usual 'timeout' state; the 1 h snapshot cache keeps any success.
// TV order: embedded rows (if the page already carries our season) -> showID
// input or title-matched /show/ link -> ajax for that season -> [] .

const BASE = 'https://www.addic7ed.com'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

let sessionCookie: string | null = null

function adoptSession(cookies: string[], tookMs: number) {
  // Session reuse is not a guaranteed bypass of the sleep (measured
  // 2026-10-20), but keep the newest PHPSESSID and drop one that clearly
  // stopped working (slow answer, no replacement cookie).
  const fresh = cookies.find((entry) => /^PHPSESSID=/.test(entry))
  if (fresh) sessionCookie = fresh
  else if (sessionCookie && tookMs > 2000) sessionCookie = null // stale: next call mints a new one
}

export function createAddic7edProvider(http: SubtitleHttp): SubtitleSearchProvider {
  return {
    id: 'addic7ed',
    name: 'Addic7ed',
    // Search/ajax endpoints sleep 3-21 s before responding (verified
    // 2026-10-20; raw file endpoints answer in <1 s), so the default 8.5 s
    // budget rejects many valid searches. 11 s stays under the discover
    // route's 13 s abort so the outcome still reports cleanly; slow cycles
    // degrade to the usual 'timeout' state and the 1 h snapshot cache keeps
    // any success.
    timeoutMs: 11_000,
    // Search, ajax and raw-SRT downloads all stay on the site host (apex or
    // www; both admitted because upstream redirects between them).
    fileHosts: ['addic7ed.com', '*.addic7ed.com'],
    supports(query: SubtitleQuery) {
      return (query.type === 'movie' || query.type === 'tv') && !!query.title
    },
    async search(query: SubtitleQuery, signal: AbortSignal): Promise<RawSubtitle[]> {
      const title = String(query.title ?? '')
      const searchUrl = `${BASE}/search.php?search=${encodeURIComponent(title)}`
      const searchHtml = await get(http, searchUrl, `${BASE}/`, signal)
      if (!searchHtml) return []

      const wantLangs = (query.langs?.length ? query.langs : []).map((lang) => lang.toLowerCase())

      if (query.type === 'movie') {
        return parseRows(searchHtml, wantLangs, `${BASE}/`)
      }

      // TV: the search page usually embeds the latest-season table; use it
      // when it already covers the requested season, else fetch that season
      // through the ajax endpoint keyed by the hidden showID input (or a
      // title-matched /show/ link as a last resort).
      const season = Number(query.season ?? 1)
      const episode = Number(query.episode ?? 1)
      const embedded = parseTvRows(searchHtml, season, episode, searchUrl)
      if (embedded.length) return embedded.filter((sub) => !wantLangs.length || wantLangs.includes(sub.lang))
      const showId = searchHtml.match(/name="showID"\s+value="(\d+)"/i)?.[1] ?? findShowId(searchHtml, title)
      if (!showId) return []
      const ajaxUrl = `${BASE}/ajax_loadShow.php?show=${showId}&season=${season}&langs=&hd=&hi=`
      const epHtml = await get(http, ajaxUrl, `${BASE}/show/${showId}`, signal)
      if (!epHtml) return []
      return parseTvRows(epHtml, season, episode, `${BASE}/show/${showId}`).filter(
        (sub) => !wantLangs.length || wantLangs.includes(sub.lang),
      )
    },
  }
}

function parseRows(html: string, wantLangs: string[], pageUrl: string): RawSubtitle[] {
  const out: RawSubtitle[] = []
  // language cell ... download link (window covers a full table row)
  const re =
    /class="language">([^<]{2,40})[\s\S]{0,1400}?href="(\/original\/\d+\/\d+)"[\s\S]{0,800}?<\/tr>/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(html)) !== null) {
    const lang = normLang(match[1] ?? '')
    const path = match[2] ?? ''
    if (!path) continue
    if (wantLangs.length && !wantLangs.includes(lang)) continue
    // release text near the row (version cell / newsDate)
    const rowStart = Math.max(0, match.index - 600)
    const rowCtx = html.slice(rowStart, match.index + match[0].length)
    const release =
      rowCtx.match(/Version:\s*([^<]{2,80})/i)?.[1]?.trim() ||
      rowCtx.match(/class="newsDate"[^>]*>([\s\S]{0,120}?)<\/td>/i)?.[1]?.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) ||
      ''
    const hi = /Hearing Impaired|title="Hearing Impaired"/i.test(rowCtx)
    out.push({
      url: `${BASE}${path}`,
      lang,
      label: `${release || 'subtitle'}${hi ? ' [HI]' : ''}`,
      format: 'srt',
      hi,
      release,
      provider: 'addic7ed',
      headers: { Referer: pageUrl },
    })
  }
  return out
}

function parseTvRows(html: string, season: number, episode: number, pageUrl: string): RawSubtitle[] {
  const out: RawSubtitle[] = []
  // TV ajax rows: <td>S</td><td>E</td>...<td>Lang</td>...<td class="c">Version</td>...<a href="/updated/...">
  const re =
    /<tr class="(?:epeven|epodd)[^"]*"[^>]*>\s*<td>(\d+)<\/td>\s*<td>(\d+)<\/td>\s*<td><a[^>]*>([\s\S]{0,120}?)<\/a><\/td>\s*<td>([^<]{2,40})<\/td>\s*<td class="c">([^<]{0,60})<\/td>[\s\S]{0,1200}?<a href="(\/updated\/\d+\/\d+\/\d+)"/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(html)) !== null) {
    const rowSeason = Number(match[1])
    const rowEp = Number(match[2])
    const epTitle = (match[3] ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    const lang = normLang(match[4] ?? '')
    const version = (match[5] ?? '').trim()
    const path = match[6] ?? ''
    if (rowSeason !== season) continue
    if (rowEp !== episode) continue
    const tag = `S${String(rowSeason).padStart(2, '0')}E${String(rowEp).padStart(2, '0')}`
    out.push({
      url: `${BASE}${path}`,
      lang,
      label: `${tag} ${epTitle}${version ? ' ' + version : ''}`,
      format: 'srt',
      release: `${tag} ${epTitle}`,
      provider: 'addic7ed',
      headers: { Referer: pageUrl },
    })
  }
  return out
}

function findShowId(html: string, title: string): string | null {
  const needle = title.toLowerCase()
  // Title match only: the search page's /show/ links are always the sidebar
  // list, so an unmatched title must yield null rather than a wrong show.
  const re = /<a[^>]+href="(?:https?:\/\/www\.addic7ed\.com)?\/show\/(\d+)"[^>]*>([\s\S]{0,120}?)<\/a>/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(html)) !== null) {
    const text = (match[2] ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
    if (text.includes(needle) || needle.includes(text.replace(/\s*\(us\)\s*$/, ''))) return match[1] ?? null
  }
  return null
}

async function get(http: SubtitleHttp, url: string, referer: string, signal: AbortSignal): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (attempt > 0) await sleep(1500)
      const started = Date.now()
      const { text, cookies } = await http.get(
        url,
        { 'User-Agent': UA, Accept: 'text/html,*/*', Referer: referer, ...(sessionCookie ? { Cookie: sessionCookie } : {}) },
        signal,
      )
      adoptSession(cookies, Date.now() - started)
      if (text.length > 200) return text
    } catch (error) {
      if (signal.aborted) return null // aborted: no retry
      if (error instanceof Error && /\bHTTP 404\b/.test(error.message)) return null // missing page: no retry
    }
  }
  return null
}
