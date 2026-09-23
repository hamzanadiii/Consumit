import { createHash } from 'node:crypto'
import { assToVtt } from './ass.ts'
import { langLabel } from './lang.ts'
import { decodeSubtitleText, srtToVtt, unzipEntries } from './srt.ts'
import { contentPath, type OriginalFile, type SubtitleFileStore } from './storage.ts'
import { fetchSubtitleBytes } from './http.ts'
import type { RawSubtitle, SubtitleQuery, SubtitleSearchProvider } from './types.ts'

/** Prefer archive entries whose filename matches the claimed language:
 *  packs often bundle several languages and the largest file is not always
 *  the right one. Bounded match only — bare `en` must not match `french`. */
export function entryMatchesLang(filename: string, lang: string): boolean {
  const name = filename.toLowerCase()
  const code = lang.toLowerCase()
  if (new RegExp(`(^|[^a-z])${code}([^a-z]|$)`).test(name)) return true
  return name.includes(langLabel(code).toLowerCase())
}

function pickArchiveEntry(entries: { name: string; data: Buffer }[], ext: RegExp, lang: string): { name: string; data: Buffer } | undefined {
  return entries
    .filter((entry) => ext.test(entry.name))
    .map((entry) => ({ entry, hit: entryMatchesLang(entry.name, lang) ? 1 : 0 }))
    .sort((a, b) => b.hit - a.hit || b.entry.data.length - a.entry.data.length)[0]?.entry
}

export type ServedSubtitle = {
  id: string
  label: string
  language: string
  url: string
  format: 'vtt'
  provider: string
  /** Quality signals for catalog scoring. Internal only — the public
   *  contract strips unknown fields, so the player never sees these. */
  hi?: boolean | undefined
  rating?: number | undefined
  release?: string | undefined
  cueCount?: number | undefined
  /** Member-facing track attributes (also carried on the public contract):
   *  foreign-parts-only, hearing-impaired, signs/songs-only, or
   *  machine-translated tracks. Detected from upstream filenames/labels. */
  forced?: boolean | undefined
  sdh?: boolean | undefined
  signs?: boolean | undefined
  songs?: boolean | undefined
  machineTranslated?: boolean | undefined
  /** Top pick for one of the member's wanted languages this search. */
  recommended?: boolean | undefined
}

/** Detect track attributes from an upstream filename/label. Conservative
 *  substring signals — a miss only means a plain full track, never a
 *  mislabeled one. */
export function detectTrackFlags(text: string): { forced: boolean; sdh: boolean; signs: boolean; songs: boolean; machineTranslated: boolean } {
  const value = text.toLowerCase()
  return {
    forced: /forced|foreign.parts|forced.foreign/.test(value),
    sdh: /sdh|\bcc\b|closed.captions?|hearing.impaired/.test(value),
    signs: /signs/.test(value),
    songs: /songs|karaoke/.test(value),
    machineTranslated: /machine.?translat|auto.?translat|auto.generated|\bmtl\b/.test(value),
  }
}

const SEARCH_TIMEOUT_MS = 12_000
const FILE_TIMEOUT_MS = 8_000
const CONVERT_CONCURRENCY = 4
const MAX_RAW_PER_PROVIDER = 40
const MAX_TRACKS = 24
const MAX_PER_LANG = 2
/** Whole-aggregation wall budget (under the 10s server connection bound).
 *  Whatever is ready in rank order is returned; conversions already cached
 *  from earlier views cost nothing, and the rest warm the cache for the
 *  next request instead of failing the whole search. */
const OVERALL_BUDGET_MS = 9_000
const MAX_FILE_BYTES = 5_242_880
const MAX_VTT_BYTES = 524_288
const FILE_TTL_SECONDS = 7 * 24 * 3600

function fileKey(provider: string, sourceUrl: string, lang: string): string {
  return createHash('sha1').update(`${provider}|${sourceUrl}|${lang}`).digest('hex').slice(0, 16)
}

function trackId(provider: string, key: string): string {
  return `sub-${provider}-${key}`.slice(0, 128)
}

function isZip(raw: RawSubtitle): boolean {
  return raw.needsExtract === true || raw.format === 'zip' || /\.zip(\?|#|$)/i.test(raw.url)
}

function validVtt(text: string): boolean {
  return text.startsWith('WEBVTT') && text.includes('-->') && text.length > 20 && text.length <= MAX_VTT_BYTES
}

/** Normalize one candidate to WebVTT text plus its original source bytes.
 *  Direct upstream VTT passes through untouched; zips are extracted
 *  (largest .srt wins, .vtt entry reused); SRT text is converted; ASS/SSA
 *  converts with styling dropped for `<track>` playback while the original
 *  bytes are kept for future styled rendering. Anything unparseable is
 *  skipped. */
type FetchFile = typeof fetchSubtitleBytes

type NormalizedSubtitle = {
  vtt: string
  original: OriginalFile | null
}

function originalExt(name: string, fallback: OriginalFile['ext']): OriginalFile['ext'] {
  if (/\.ass$/i.test(name)) return 'ass'
  if (/\.ssa$/i.test(name)) return 'ssa'
  if (/\.vtt$/i.test(name)) return 'vtt'
  return fallback
}

async function toVtt(raw: RawSubtitle, signal: AbortSignal, fetchFile: FetchFile): Promise<NormalizedSubtitle | null> {
  // Upstream file URLs sometimes carry raw spaces (notably TVSubtitles);
  // encode them like browsers do instead of rejecting the candidate.
  const href = raw.url.replace(/ /g, '%20')
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null
  const fileUrl = url.href
  const headers = raw.headers ?? {}
  if (isZip(raw)) {
    const buf = await fetchFile(fileUrl, [url.hostname], headers, signal, MAX_FILE_BYTES)
    let entries: { name: string; data: Buffer }[]
    try {
      entries = unzipEntries(buf)
    } catch {
      return null
    }
    const srt = pickArchiveEntry(entries, /\.srt$/i, raw.lang)
    if (srt && srt.data.length <= MAX_VTT_BYTES) {
      const vtt = srtToVtt(decodeSubtitleText(srt.data))
      if (!validVtt(vtt)) return null
      return { vtt, original: { bytes: srt.data, ext: 'srt' } }
    }
    const vttEntry = pickArchiveEntry(entries, /\.vtt$/i, raw.lang)
    if (vttEntry && vttEntry.data.length <= MAX_VTT_BYTES) {
      const text = decodeSubtitleText(vttEntry.data)
      const vtt = text.startsWith('WEBVTT') ? text : `WEBVTT\n\n${text}`
      if (!validVtt(vtt)) return null
      return { vtt, original: { bytes: vttEntry.data, ext: 'vtt' } }
    }
    const assEntry = pickArchiveEntry(entries, /\.ass|\.ssa$/i, raw.lang)
    if (assEntry && assEntry.data.length <= MAX_VTT_BYTES) {
      const vtt = assToVtt(decodeSubtitleText(assEntry.data))
      if (!vtt || !validVtt(vtt)) return null
      return { vtt, original: { bytes: assEntry.data, ext: originalExt(assEntry.name, 'ass') } }
    }
    return null
  }
  if (raw.format === 'ass' || (raw.format === 'other' && /\.ass|\.ssa$/i.test(fileUrl))) {
    const buf = await fetchFile(fileUrl, [url.hostname], headers, signal, MAX_FILE_BYTES)
    const vtt = assToVtt(decodeSubtitleText(buf))
    if (!vtt || !validVtt(vtt)) return null
    return { vtt, original: { bytes: buf, ext: originalExt(fileUrl, 'ass') } }
  }
  const buf = await fetchFile(fileUrl, [url.hostname], headers, signal, MAX_FILE_BYTES)
  const text = decodeSubtitleText(buf)
  if (raw.format === 'vtt' || /\.vtt(\?|#|$)/i.test(fileUrl) || text.startsWith('WEBVTT')) {
    const vtt = text.startsWith('WEBVTT') ? text : `WEBVTT\n\n${text}`
    if (!validVtt(vtt)) return null
    return { vtt, original: { bytes: buf, ext: originalExt(fileUrl, 'vtt') } }
  }
  const vtt = srtToVtt(text)
  if (!validVtt(vtt)) return null
  return { vtt, original: { bytes: buf, ext: 'srt' } }
}

function isDirectVtt(raw: RawSubtitle): boolean {
  return !isZip(raw) && (raw.format === 'vtt' || /\.vtt(\?|#|$)/i.test(raw.url))
}

/**
 * Aggregate caption tracks across subtitle providers for one title/episode.
 * Served entries are first-party VTT converted and cached by this module
 * (same-origin, no expiry, no CORS risk); direct entries are upstream https
 * WebVTT handed to the browser untouched. Ranked wanted-languages first,
 * full human tracks before forced/adjunct/machine variants, non-HI before
 * HI, then provider rating; best two per language, twenty-four max (the
 * watch menu caps at thirty-two; sessions carry a smaller subset). The top
 * full track per wanted language is marked Recommended.
 */
export async function resolveSubtitles(
  query: SubtitleQuery,
  providers: readonly SubtitleSearchProvider[],
  files: SubtitleFileStore,
  origin: string,
  signal: AbortSignal,
  fetchFile: FetchFile = fetchSubtitleBytes,
): Promise<ServedSubtitle[]> {
  const wantLangs = (query.langs?.length ? query.langs : ['en']).map((lang) => lang.toLowerCase())
  const usable = providers.filter((provider) => {
    try {
      return provider.supports(query)
    } catch {
      return false
    }
  })
  const startedAt = Date.now()
  const remainingMs = () => OVERALL_BUDGET_MS - (Date.now() - startedAt)
  const settled = await Promise.allSettled(
    usable.map((provider) =>
      Promise.race([
        provider.search(query, signal),
        new Promise<RawSubtitle[]>((_, reject) => setTimeout(
          () => reject(new Error('Subtitle search timed out.')),
          Math.max(1000, Math.min(SEARCH_TIMEOUT_MS, remainingMs())),
        )),
      ]),
    ),
  )
  const raw: RawSubtitle[] = []
  settled.forEach((result) => {
    if (result.status !== 'fulfilled') return
    raw.push(...result.value.slice(0, MAX_RAW_PER_PROVIDER))
  })
  const langRank = (lang: string) => {
    const index = wantLangs.indexOf(lang.toLowerCase())
    return index === -1 ? 100 + lang.toLowerCase().charCodeAt(0) : index
  }
  // Scoring v2 (within each language): full human tracks first, then
  // forced foreign-parts, signs/songs adjuncts, and machine translations
  // last; hearing-impaired sorts after same-kind full tracks; provider
  // rating and converted cue counts break remaining ties. Rank order
  // drives conversion priority too, so better tracks win the time budget.
  const flagsOf = new Map<RawSubtitle, ReturnType<typeof detectTrackFlags>>()
  const flags = (entry: RawSubtitle) => {
    let found = flagsOf.get(entry)
    if (!found) {
      found = detectTrackFlags(`${entry.url} ${entry.label}`)
      flagsOf.set(entry, found)
    }
    return found
  }
  const kindRank = (entry: RawSubtitle) => {
    const track = flags(entry)
    if (track.signs || track.songs) return 3
    if (track.forced) return 1
    if (track.machineTranslated) return 4
    return 0
  }
  raw.sort(
    (a, b) =>
      langRank(a.lang) - langRank(b.lang) ||
      kindRank(a) - kindRank(b) ||
      Number(a.hi ?? false) - Number(b.hi ?? false) ||
      (b.rating || 0) - (a.rating || 0),
  )
  // Rank order drives everything: take candidates in order, convert each
  // small group concurrently (sequential downloads would push cold searches
  // past the route deadline), then apply caps in group order so limits stay
  // exact. Direct upstream VTT needs no I/O; archives convert and cache.
  const perLang = new Map<string, number>()
  const picked = new Map<string, number>()
  const tracks: ServedSubtitle[] = []
  const direct: ServedSubtitle[] = []
  let cursor = 0
  const take = (): RawSubtitle | null => {
    while (cursor < raw.length) {
      const entry = raw[cursor++]!
      const lang = entry.lang.toLowerCase()
      if ((perLang.get(lang) || 0) + (picked.get(lang) || 0) >= MAX_PER_LANG) continue
      picked.set(lang, (picked.get(lang) || 0) + 1)
      return entry
    }
    return null
  }
  const release = (lang: string) => {
    picked.set(lang, Math.max(0, (picked.get(lang) || 0) - 1))
  }
  const labelFor = (entry: RawSubtitle) =>
    `${langLabel(entry.lang.toLowerCase())}${entry.hi ? ' [HI]' : ''} (${entry.provider})`
  const flagFields = (entry: RawSubtitle): Partial<Pick<ServedSubtitle, 'forced' | 'sdh' | 'signs' | 'songs' | 'machineTranslated'>> => {
    const flags = detectTrackFlags(`${entry.url} ${entry.label}`)
    return {
      ...(flags.forced ? { forced: true } : {}),
      ...(flags.sdh ? { sdh: true } : {}),
      ...(flags.signs ? { signs: true } : {}),
      ...(flags.songs ? { songs: true } : {}),
      ...(flags.machineTranslated ? { machineTranslated: true } : {}),
    }
  }
  for (;;) {
    // Stop with a partial rank-ordered list when the budget runs out: the
    // menu shows what is ready, and warmed file caches complete the rest
    // on the next request instead of failing the whole search.
    if (tracks.length + direct.length >= MAX_TRACKS || remainingMs() < 750) break
    const group: RawSubtitle[] = []
    for (let i = 0; i < CONVERT_CONCURRENCY; i++) {
      const entry = take()
      if (!entry) break
      group.push(entry)
    }
    if (!group.length) break
    const fileTimeout = Math.max(500, Math.min(FILE_TIMEOUT_MS, remainingMs()))
    const settled = await Promise.allSettled(
      group.map(async (entry): Promise<{ kind: 'direct' | 'served'; track: ServedSubtitle } | null> => {
        if (isDirectVtt(entry)) {
          try {
            const url = new URL(entry.url)
            if (url.protocol !== 'https:' || url.username || url.password) return null
          } catch {
            return null
          }
          const lang = entry.lang.toLowerCase()
          return {
            kind: 'direct',
            track: {
              id: trackId(entry.provider, `d-${createHash('sha1').update(entry.url).digest('hex').slice(0, 8)}`),
              label: labelFor(entry),
              language: lang,
              url: entry.url,
              format: 'vtt',
              provider: entry.provider,
              ...(entry.hi ? { hi: true } : {}),
              ...(typeof entry.rating === 'number' ? { rating: entry.rating } : {}),
              ...(entry.release ? { release: entry.release } : {}),
              ...flagFields(entry),
            },
          }
        }
        const lang = entry.lang.toLowerCase()
        const key = fileKey(entry.provider, entry.url, lang)
        const content = contentPath(query, lang)
        // Converted files cached by earlier views cost no I/O at all.
        try {
          const cached = await files.getVtt(key)
          if (cached && cached.startsWith('WEBVTT') && cached.includes('-->')) {
            return {
              kind: 'served',
              track: {
                id: trackId(entry.provider, key.slice(0, 8)),
                label: labelFor(entry),
                language: lang,
                url: `${origin.replace(/\/$/, '')}/v1/subtitles/file/${key}`,
                format: 'vtt',
                provider: entry.provider,
                ...(entry.hi ? { hi: true } : {}),
                ...(typeof entry.rating === 'number' ? { rating: entry.rating } : {}),
                ...(entry.release ? { release: entry.release } : {}),
                ...flagFields(entry),
              },
            }
          }
        } catch {
          // Cache failure falls through to a fresh conversion.
        }
        // Each file fetch is independently bounded: one slow zip must not
        // hold the whole aggregation past the route deadline.
        const normalized = await Promise.race([
          toVtt(entry, signal, fetchFile),
          new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Subtitle file timed out.')), fileTimeout)),
        ])
        if (!normalized) return null
        try {
          await files.putVtt(key, normalized.vtt, { content, ttlSeconds: FILE_TTL_SECONDS })
          if (normalized.original) {
            await files.putOriginal(key, normalized.original, { content, ttlSeconds: FILE_TTL_SECONDS })
          }
        } catch {
          // File persistence failure never fails the search.
        }
        const cueCount = (normalized.vtt.match(/-->/g) || []).length
        return {
          kind: 'served',
          track: {
            id: trackId(entry.provider, key.slice(0, 8)),
            label: labelFor(entry),
            language: lang,
            url: `${origin.replace(/\/$/, '')}/v1/subtitles/file/${key}`,
            format: 'vtt',
            provider: entry.provider,
            ...(entry.hi ? { hi: true } : {}),
            ...(typeof entry.rating === 'number' ? { rating: entry.rating } : {}),
            ...(entry.release ? { release: entry.release } : {}),
            ...(cueCount > 0 ? { cueCount } : {}),
            ...flagFields(entry),
          },
        }
      }),
    )
    for (let gi = 0; gi < group.length; gi++) {
      if (tracks.length + direct.length >= MAX_TRACKS) break
      const entry = group[gi]!
      const lang = entry.lang.toLowerCase()
      const result = settled[gi]!
      if (result.status !== 'fulfilled' || !result.value) {
        release(lang)
        continue
      }
      if ((perLang.get(lang) || 0) >= MAX_PER_LANG) {
        release(lang)
        continue
      }
      perLang.set(lang, (perLang.get(lang) || 0) + 1)
      release(lang)
      if (result.value.kind === 'served') tracks.push(result.value.track)
      else direct.push(result.value.track)
    }
  }
  // Served first-party files before remote direct tracks: same-origin VTT
  // cannot expire, hit CORS walls, or vanish mid-watch.
  const ordered = [...tracks, ...direct].slice(0, MAX_TRACKS)
  // Mark the top pick per wanted language: first full (non-forced,
  // non-adjunct, human) track. The menu surfaces it as Recommended.
  const recommendedLangs = new Set<string>()
  for (const track of ordered) {
    const lang = track.language.toLowerCase()
    if (!wantLangs.includes(lang) || recommendedLangs.has(lang)) continue
    if (track.forced || track.signs || track.songs || track.machineTranslated) continue
    recommendedLangs.add(lang)
    track.recommended = true
    track.label = `${track.label} · Recommended`
  }
  return ordered
}
