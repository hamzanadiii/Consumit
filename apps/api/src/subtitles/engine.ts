import { subtitleContentChecksum } from './selection-policy.ts'
import { createHash } from 'node:crypto'
import { allowedMediaUrl } from '@consumit/provider-sdk'
import { assToVtt } from './ass.ts'
import { langLabel, normLang } from './lang.ts'
import { isSubtitleCandidateEligible, isSubtitleProviderEligible, matchesSubtitleEpisode, requiresExactEpisodeArchiveMatch, subtitleLanguageRank } from './selection-policy.ts'
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
  const literal = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (new RegExp(`(^|[^a-z])${literal}([^a-z]|$)`).test(name)) return true
  return name.includes(langLabel(code).toLowerCase())
}

function pickArchiveEntry(entries: { name: string; data: Buffer }[], ext: RegExp, lang: string, accept: (name: string) => boolean = () => true): { name: string; data: Buffer } | undefined {
  return entries
    .filter((entry) => ext.test(entry.name) && accept(entry.name))
    .map((entry) => ({ entry, hit: entryMatchesLang(entry.name, lang) ? 1 : 0 }))
    .sort((a, b) => b.hit - a.hit || b.entry.data.length - a.entry.data.length)[0]?.entry
}

export type ServedSubtitle = {
  contentChecksum?: string | undefined
  match?: 'source' | 'release' | 'unverified' | undefined
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
/** Whole-aggregation wall budget (under the 10s server connection bound).
 *  Whatever is ready in rank order is returned; conversions already cached
 *  from earlier views cost nothing, and the rest warm the cache for the
 *  next request instead of failing the whole search. */
const OVERALL_BUDGET_MS = 9_000
const MAX_FILE_BYTES = 5_242_880
const MAX_VTT_BYTES = 524_288
const FILE_TTL_SECONDS = 7 * 24 * 3600

export function subtitleFileKey(raw: Pick<RawSubtitle, 'provider' | 'url' | 'identityUrl' | 'lang'>): string {
  return createHash('sha1').update(`${raw.provider}|${raw.identityUrl ?? raw.url}|${raw.lang.toLowerCase()}`).digest('hex').slice(0, 16)
}

function trackId(provider: string, key: string): string {
  return `sub-${provider}-${key}`.slice(0, 128)
}

function isZip(raw: RawSubtitle): boolean {
  return raw.needsExtract === true || raw.format === 'zip' || /\.zip(\?|#|$)/i.test(raw.url)
}

const XZ_MAGIC = Buffer.from([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00])

/** XZ stays unavailable until a bounded edge decoder is accepted. Never
 * shell out or redirect conversion to a VPS. */
export function isXz(buf: Buffer): boolean {
  return buf.length > 6 && buf.subarray(0, 6).equals(XZ_MAGIC)
}

function validVtt(text: string): boolean {
  return text.startsWith('WEBVTT') && text.includes('-->') && text.length > 20 && text.length <= MAX_VTT_BYTES
}

/** Provider-declared destination scope for file downloads. A null scope
 *  keeps the historical rule: the URL's own hostname only. */
export type FileScope = { hosts: readonly string[]; patterns: readonly RegExp[] }

export function declaredScope(provider: Pick<SubtitleSearchProvider, 'fileHosts' | 'fileHostPatterns'>): FileScope | null {
  const hosts = provider.fileHosts ?? []
  const patterns = provider.fileHostPatterns ?? []
  return hosts.length || patterns.length ? { hosts, patterns } : null
}

/** Framing/routing headers never ride a provider-chosen file fetch: a
 *  hostile candidate must not override Host or smuggle hop-by-hop state.
 *  Credentials (cookie/authorization) travel only inside the provider's
 *  declared file scope — adapter cookies are issued by the adapter's own
 *  infrastructure — or, for undeclared providers, when a Referer/Origin
 *  binds them to the exact destination host. */
const ROUTING_HEADER = /^(host|connection|keep-alive|proxy-[a-z0-9-]+|transfer-encoding|upgrade|te|trailer|expect|content-length)$/i

export function safeFileHeaders(headers: Record<string, string>, url: URL, scope: FileScope | null): Record<string, string> {
  const safe: Record<string, string> = {}
  for (const [name, value] of Object.entries(headers)) {
    if (ROUTING_HEADER.test(name)) continue
    if (/^(cookie|authorization)$/i.test(name) && !scope) {
      const binding = headers.Referer ?? headers.referer ?? headers.Origin ?? headers.origin
      let host: string | null = null
      try {
        host = binding ? new URL(binding).hostname : null
      } catch {
        host = null
      }
      if (host !== url.hostname) continue
    }
    safe[name] = value
  }
  return safe
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

async function toVtt(raw: RawSubtitle, query: SubtitleQuery, signal: AbortSignal, fetchFile: FetchFile, scope: FileScope | null): Promise<NormalizedSubtitle | null> {
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
  if (scope && !allowedMediaUrl(url, scope.hosts, scope.patterns)) return null
  const fileUrl = url.href
  const headers = safeFileHeaders(raw.headers ?? {}, url, scope)
  const hosts = scope?.hosts ?? [url.hostname]
  const patterns = scope?.patterns ?? []
  if (isZip(raw)) {
    const buf = await fetchFile(fileUrl, hosts, headers, signal, MAX_FILE_BYTES, patterns)
    let entries: { name: string; data: Buffer }[]
    try {
      entries = unzipEntries(buf)
    } catch {
      return null
    }
    const episodeScoped = requiresExactEpisodeArchiveMatch(raw.provider) && query.type !== 'movie'
    const acceptsEntry = episodeScoped ? (name: string) => matchesSubtitleEpisode(name, query) : undefined
    const srt = pickArchiveEntry(entries, /\.srt$/i, raw.lang, acceptsEntry)
    if (srt && srt.data.length <= MAX_VTT_BYTES) {
      const vtt = srtToVtt(decodeSubtitleText(srt.data))
      if (!validVtt(vtt)) return null
      return { vtt, original: { bytes: srt.data, ext: 'srt' } }
    }
    const vttEntry = pickArchiveEntry(entries, /\.vtt$/i, raw.lang, acceptsEntry)
    if (vttEntry && vttEntry.data.length <= MAX_VTT_BYTES) {
      const text = decodeSubtitleText(vttEntry.data)
      const vtt = text.startsWith('WEBVTT') ? text : `WEBVTT\n\n${text}`
      if (!validVtt(vtt)) return null
      return { vtt, original: { bytes: vttEntry.data, ext: 'vtt' } }
    }
    const assEntry = pickArchiveEntry(entries, /\.ass|\.ssa$/i, raw.lang, acceptsEntry)
    if (assEntry && assEntry.data.length <= MAX_VTT_BYTES) {
      const vtt = assToVtt(decodeSubtitleText(assEntry.data))
      if (!vtt || !validVtt(vtt)) return null
      return { vtt, original: { bytes: assEntry.data, ext: originalExt(assEntry.name, 'ass') } }
    }
    return null
  }
  if (raw.format === 'ass' || /\.(?:ass|ssa)(?:[?#]|$)/i.test(fileUrl)) {
    const buf = await fetchFile(fileUrl, hosts, headers, signal, MAX_FILE_BYTES, patterns)
    const source = isXz(buf) ? null : buf
    if (!source) return null
    const vtt = assToVtt(decodeSubtitleText(source))
    if (!vtt || !validVtt(vtt)) return null
    return { vtt, original: { bytes: source, ext: originalExt(fileUrl, 'ass') } }
  }
  const buf = await fetchFile(fileUrl, hosts, headers, signal, MAX_FILE_BYTES, patterns)
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

/**
 * Aggregate caption tracks across subtitle providers for one title/episode.
 * Served entries are first-party VTT converted and cached by this module
 * (same-origin, no expiry, no CORS risk); direct entries are upstream https
 * WebVTT handed to the browser untouched. Ranked wanted-languages first,
 * full human tracks before forced/adjunct/machine variants, non-HI before
 * HI, then provider rating. The compatibility endpoint is bounded by a
 * wall clock; the discovery interface pages every returned candidate. The
 * top full track per wanted language is marked Recommended.
 */
export async function resolveSubtitles(
  query: SubtitleQuery,
  providers: readonly SubtitleSearchProvider[],
  files: SubtitleFileStore,
  origin: string,
  signal: AbortSignal,
  fetchFile: FetchFile = fetchSubtitleBytes,
  forceFirstParty = false,
): Promise<ServedSubtitle[]> {
  const wantLangs = (query.langs?.length ? query.langs : ['en']).map((lang) => lang.toLowerCase())
  const usable = providers.filter((provider) => {
    try {
      return isSubtitleProviderEligible(provider.id) && provider.supports(query)
    } catch {
      return false
    }
  })
  // One declared scope per producing provider. A candidate attributed to a
  // provider that did not produce it (mismatched raw.provider) is dropped:
  // scope lookup must never be steerable by the candidate itself.
  const scopes = new Map<string, FileScope | null>()
  for (const provider of usable) scopes.set(provider.id, declaredScope(provider))
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
  let raw: RawSubtitle[] = []
  settled.forEach((result) => {
    if (result.status !== 'fulfilled' || !Array.isArray(result.value)) return
    raw.push(...result.value)
  })
  raw = raw.filter(entry => isSubtitleProviderEligible(entry.provider) && isSubtitleCandidateEligible(entry, query))
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
      subtitleLanguageRank(a.lang, wantLangs) - subtitleLanguageRank(b.lang, wantLangs) ||
      kindRank(a) - kindRank(b) ||
      Number(a.hi ?? false) - Number(b.hi ?? false) ||
      Number(b.provider === 'rivesubs') - Number(a.provider === 'rivesubs') ||
      (b.rating || 0) - (a.rating || 0),
  )
  // Rank order drives everything: take candidates in order, convert each
  // small group concurrently (sequential downloads would push cold searches
  // past the route deadline). Discovery pages the full candidate set; this
  // compatibility endpoint remains wall-time bounded.
  const seen = new Set<string>()
  const tracks: ServedSubtitle[] = []
  const direct: ServedSubtitle[] = []
  let cursor = 0
  const take = (): RawSubtitle | null => {
    while (cursor < raw.length) {
      const entry = raw[cursor++]!
      const key = `${entry.provider}|${entry.lang.toLowerCase()}|${entry.url}`
      if (seen.has(key)) continue
      seen.add(key)
      return entry
    }
    return null
  }
  const labelFor = (entry: RawSubtitle) =>
    `${langLabel(entry.lang.toLowerCase())}${entry.hi ? ' [HI]' : ''} (${entry.providerName ?? entry.provider})`
  const directTrackFor = (entry: RawSubtitle, scope: FileScope | null | undefined): ServedSubtitle | null => {
    if (scope === undefined) return null
    try {
      const url = new URL(entry.url)
      if (url.protocol !== 'https:' || url.username || url.password || (scope && !allowedMediaUrl(url, scope.hosts, scope.patterns))) return null
    } catch { return null }
    const lang = entry.lang.toLowerCase()
    return {
      id: trackId(entry.provider, `d-${createHash('sha1').update(entry.url).digest('hex').slice(0, 8)}`),
      label: labelFor(entry), language: lang, url: entry.url, format: 'vtt', provider: entry.provider,
      ...(entry.hi ? { hi: true } : {}), ...(typeof entry.rating === 'number' ? { rating: entry.rating } : {}),
      ...(entry.release ? { release: entry.release } : {}), ...flagFields(entry),
    }
  }
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
    if (remainingMs() < 750) break
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
        const scope = scopes.get(entry.provider)
        if (scope === undefined) return null
        // Arabic releases commonly use Windows-1256 even when the upstream
        // calls the file WebVTT. Pass Arabic through the byte decoder and
        // first-party VTT cache instead of letting browser <track> decode it
        // as UTF-8 based on an unreliable upstream content-type.
        if (!forceFirstParty && normLang(entry.lang) !== 'ar' && !isZip(entry) && (entry.format === 'vtt' || /\.vtt(\?|#|$)/i.test(entry.url))) {
          const track = directTrackFor(entry, scope)
          return track ? { kind: 'direct', track } : null
        }
        const lang = entry.lang.toLowerCase()
        const identityKey = subtitleFileKey(entry)
        let key = await files.resolveKey?.(identityKey) ?? identityKey
        const content = contentPath(query, lang)
        // Converted files cached by earlier views cost no I/O at all.
        try {
          const cached = await files.getVtt(key)
          if (cached && cached.startsWith('WEBVTT') && cached.includes('-->')) {
            const cachedCueCount = (cached.match(/-->/g) || []).length
            return {
              kind: 'served',
              track: {
                contentChecksum: subtitleContentChecksum(cached),
                id: trackId(entry.provider, key.slice(0, 8)),
                label: labelFor(entry),
                language: lang,
                url: `${origin.replace(/\/$/, '')}/v1/subtitles/file/${key}`,
                format: 'vtt',
                provider: entry.provider,
                ...(entry.hi ? { hi: true } : {}),
                ...(typeof entry.rating === 'number' ? { rating: entry.rating } : {}),
                ...(entry.release ? { release: entry.release } : {}),
                ...(cachedCueCount > 0 ? { cueCount: cachedCueCount } : {}),
                ...flagFields(entry),
              },
            }
          }
        } catch {
          // Cache failure falls through to a fresh conversion.
        }
        // Each file fetch is independently bounded: one slow zip must not
        // hold the whole aggregation past the route deadline.
        const normalized = await (async () => {
          const controller = new AbortController()
          let timer: ReturnType<typeof setTimeout> | undefined
          try {
            return await Promise.race([
              toVtt(entry, query, AbortSignal.any([signal, controller.signal]), fetchFile, scope),
              new Promise<null>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Subtitle file timed out.')) }, fileTimeout) }),
            ])
          } finally { clearTimeout(timer); controller.abort() }
        })()
        if (!normalized) {
          // Preserve the existing usable-upstream fallback when normalization
          // cannot fetch the file; the track remains selectable and its
          // availability feedback is handled by the player.
          if (!forceFirstParty && normLang(entry.lang) === 'ar' && !isZip(entry) && (entry.format === 'vtt' || /\.vtt(\?|#|$)/i.test(entry.url))) {
            const track = directTrackFor(entry, scope)
            if (track) return { kind: 'direct', track }
          }
          return null
        }
        if (files.bindKey) key = subtitleContentChecksum(normalized.vtt).slice(0, 16)
        try {
          await files.putVtt(key, normalized.vtt, { content, ttlSeconds: FILE_TTL_SECONDS, private: Boolean(entry.authority || Object.keys(entry.headers ?? {}).some(name => /^(cookie|authorization)$/i.test(name))) })
          await files.bindKey?.(identityKey, key, FILE_TTL_SECONDS)
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
            contentChecksum: subtitleContentChecksum(normalized.vtt),
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
      const result = settled[gi]!
      if (result.status !== 'fulfilled' || !result.value) {
        const entry = group[gi]!
        if (!forceFirstParty && normLang(entry.lang) === 'ar' && !isZip(entry) && (entry.format === 'vtt' || /\.vtt(\?|#|$)/i.test(entry.url))) {
          const track = directTrackFor(entry, scopes.get(entry.provider))
          if (track) direct.push(track)
        }
        continue
      }
      if (result.value.kind === 'served') tracks.push(result.value.track)
      else direct.push(result.value.track)
    }
  }
  // Served first-party files before remote direct tracks: same-origin VTT
  // cannot expire, hit CORS walls, or vanish mid-watch. Within served
  // tracks, re-apply the scoring order now that converted cue counts are
  // known — a dense conversion outranks a sparse one that tied on kind,
  // HI, and provider rating. Stable, so raw-rank order survives full ties.
  const trackKindRank = (track: ServedSubtitle) => {
    if (track.signs || track.songs) return 3
    if (track.forced) return 1
    if (track.machineTranslated) return 4
    return 0
  }
  tracks.sort(
    (a, b) =>
      subtitleLanguageRank(a.language, wantLangs) - subtitleLanguageRank(b.language, wantLangs) ||
      trackKindRank(a) - trackKindRank(b) ||
      Number(a.hi ?? false) - Number(b.hi ?? false) ||
      Number(b.provider === 'rivesubs') - Number(a.provider === 'rivesubs') ||
      (b.rating || 0) - (a.rating || 0) ||
      (b.cueCount || 0) - (a.cueCount || 0),
  )
  const ordered = [...tracks, ...direct]
  // RiveSubs stays in sync reliably, so its first full human track wins the
  // recommendation for a wanted language whenever one is available.
  // Otherwise retain the usual first-full-track recommendation.
  const recommendedLangs = new Set<string>()
  const recommend = (track: ServedSubtitle) => {
    const lang = track.language.toLowerCase()
    if (!wantLangs.includes(lang) || recommendedLangs.has(lang)) return
    if (track.forced || track.signs || track.songs || track.machineTranslated) return
    recommendedLangs.add(lang)
    track.recommended = true
    if (!track.label.endsWith(' · Recommended')) track.label = `${track.label} · Recommended`
  }
  for (const track of ordered) {
    if (track.provider === 'rivesubs') recommend(track)
  }
  for (const track of ordered) {
    recommend(track)
  }
  return ordered
}
