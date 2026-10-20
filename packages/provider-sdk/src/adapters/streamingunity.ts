import type { PlaybackRef } from '@consumit/contracts'
import { z } from 'zod'
import { allowedMediaUrl, isRelayMediaUrl, type ProviderSource } from '../index.ts'
import { adapter, document, masterVariantHeights, mediaType, ProviderFailure, sourceAccess, type ProviderHttp } from './http.ts'

// Port of PROVE/providers/streamingunity/streamingunity.ts: StreamingCommunity
// clone (Laravel Inertia SPA, vixcloud player). Flow (all bare HTTP, no
// cookies/tokens beyond a per-request version header):
//   1. GET /en -> data-page JSON -> Inertia version (cached; 409 -> refresh)
//   2. GET /en/search?q={title}  (X-Inertia:true + X-Inertia-Version) ->
//      props.titles[]
//   3. Title match via tmdb_id (props.title.tmdb_id on watch/detail pages):
//      movie -> GET /en/watch/{id} -> props { title, embedUrl }
//      tv    -> GET /en/titles/{id}-{slug} (+ /season-{n} for non-default
//               seasons) -> episodes[] { id, number, scws_id } ->
//               GET /en/watch/{id}?e={episodeId} -> props.embedUrl
//   4. GET embedUrl (/en/iframe/{tid}?episode_id=...) -> wrapper HTML ->
//      vixcloud embed URL (fresh token/expires, signed by server)
//   5. GET vixcloud embed HTML -> inline window.masterPlaylist { url, params:
//      { token, expires, asn } } -> assemble playlist url + truthy params
//      (+h=1 if canPlayFHD, lang=embed lang||'en')
//   6. GET assembled master -> #EXTM3U, RESOLUTION max -> quality label
// vixcloud playlist answers 200 + application/vnd.apple.mpegurl + ACAO:* with
// NO Referer => browser-direct; the roster row keeps deliveryMode: 'direct'.
// Episode gate: missing scws_id => site itself says "Video unavailable".
// Requires a title metadata resolver (search by title, match tmdb_id).
const origin = 'https://streamingunity.fun'
const mediaHosts = ['vixcloud.co']
const htmlHeaders = { accept: 'text/html, application/xhtml+xml' }

const titleLiteSchema = z.object({
  id: z.union([z.string(), z.number()]),
  slug: z.string().max(256),
  name: z.string().max(300),
  type: z.string().max(32),
  seasons_count: z.number().optional(),
}).passthrough()

const inertiaSchema = z.object({
  component: z.string().max(128).optional(),
  props: z.record(z.string(), z.unknown()).optional(),
}).passthrough()

function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function normalizeTitle(value: string): string {
  return String(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export type StreamingUnityMetadata = { title: string; year: number; imdbId?: string | undefined }
export type StreamingUnityMetadataResolver = (ref: PlaybackRef, signal: AbortSignal) => Promise<StreamingUnityMetadata>

function bounded(parent: AbortSignal, ms: number) {
  const controller = new AbortController()
  if (parent.aborted) controller.abort(parent.reason)
  const onAbort = () => controller.abort(parent.reason)
  parent.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('StreamingUnity step timed out', 'TimeoutError')), ms)
  return { signal: controller.signal, cleanup: () => { clearTimeout(timer); parent.removeEventListener('abort', onAbort) } }
}

export function createStreamingUnityProvider(
  http: ProviderHttp,
  metadata: StreamingUnityMetadataResolver,
  now = Date.now,
) {
  let version: string | null = null

  async function fetchVersion(signal: AbortSignal): Promise<string | null> {
    const res = await document(http, `${origin}/en`, signal, htmlHeaders)
    const match = res.text.match(/data-page="([^"]+)"/)
    if (!match) return null
    try {
      const page = JSON.parse(decodeEntities(match[1]!)) as { version?: string }
      return page.version ? String(page.version) : null
    } catch {
      return null
    }
  }

  async function inertia(path: string, parent: AbortSignal, retry = true): Promise<z.infer<typeof inertiaSchema> | null> {
    if (!version) {
      const handshakeOp = bounded(parent, 8000)
      try {
        const v = await fetchVersion(handshakeOp.signal)
        if (!v) throw new ProviderFailure('unavailable')
        version = v
      } finally {
        handshakeOp.cleanup()
      }
    }
    const op = bounded(parent, 10_000)
    let response
    try {
      response = await http(`${origin}${path}`, {
        'user-agent': 'Mozilla/5.0',
        ...htmlHeaders,
        'x-inertia': 'true',
        'x-inertia-version': version,
      }, op.signal)
    } finally {
      op.cleanup()
    }
    if (response.status === 409 && retry) {
      version = null
      return inertia(path, parent, false)
    }
    if (response.status < 200 || response.status >= 300) throw new ProviderFailure(response.status === 404 ? 'empty' : 'unavailable')
    const contentType = response.headers?.get('content-type') ?? ''
    if (!contentType.includes('json')) throw new ProviderFailure('malformed')
    const parsed = inertiaSchema.safeParse(JSON.parse(response.text))
    if (!parsed.success) throw new ProviderFailure('malformed')
    if (parsed.data.component === undefined && retry) {
      version = null
      return inertia(path, parent, false)
    }
    return parsed.data
  }

  async function search(query: string, kind: 'movie' | 'tv', signal: AbortSignal): Promise<Array<z.infer<typeof titleLiteSchema>>> {
    const page = await inertia(`/en/search?q=${encodeURIComponent(query)}`, signal)
    const raw = (page?.props as { titles?: unknown } | undefined)?.titles
    if (!Array.isArray(raw)) return []
    const titles = raw.flatMap((entry) => {
      const parsed = titleLiteSchema.safeParse(entry)
      return parsed.success ? [parsed.data] : []
    })
    const wanted = titles.filter((title) => title.type === kind)
    const normalized = normalizeTitle(query)
    return wanted.sort((a, b) => Number(normalizeTitle(a.name) !== normalized) - Number(normalizeTitle(b.name) !== normalized))
  }

  async function episodesFor(detail: z.infer<typeof inertiaSchema>, season: number, signal: AbortSignal): Promise<Array<{ id: string | number; number: number; scws_id?: unknown }>> {
    const title = (detail.props as { title?: { id?: string | number; slug?: string; seasons?: Array<{ number?: number }> } } | undefined)?.title
    const loaded = (detail.props as { loadedSeason?: { number?: number; episodes?: Array<{ id: string | number; number: number; scws_id?: unknown }> } } | undefined)?.loadedSeason
    if (loaded && Number(loaded.number) === season) return loaded.episodes ?? []
    const need = (title?.seasons ?? []).find((entry) => Number(entry.number) === season)
    if (!need || !title?.id || !title.slug) return []
    const seasonPage = await inertia(`/en/titles/${title.id}-${title.slug}/season-${season}`, signal)
    const next = (seasonPage?.props as { loadedSeason?: { number?: number; episodes?: Array<{ id: string | number; number: number; scws_id?: unknown }> } } | undefined)?.loadedSeason
    if (next && Number(next.number) === season) return next.episodes ?? []
    return []
  }

  function seasonOf(episode: { season?: { number?: number }; season_number?: number } | undefined): number {
    return Number(episode?.season?.number ?? episode?.season_number ?? 0) || 0
  }

  async function resolveEmbed(embedUrl: string, parent: AbortSignal): Promise<ProviderSource[]> {
    const iframeAbs = /^https?:\/\//i.test(embedUrl) ? embedUrl : `${origin}${embedUrl}`
    const ifrOp = bounded(parent, 10_000)
    let iframeHtml: string
    try {
      const ifrRes = await document(http, iframeAbs, ifrOp.signal, { ...htmlHeaders, referer: `${origin}/` })
      iframeHtml = ifrRes.text
    } finally {
      ifrOp.cleanup()
    }
    const embedMatch = iframeHtml.match(/https?:\/\/vixcloud\.co\/embed\/[^"'\s]+/)
    if (!embedMatch) throw new ProviderFailure('empty')
    const embedAbs = embedMatch[0]!.replace(/&amp;/g, '&')
    try {
      const embedUrlObject = new URL(embedAbs)
      if (!allowedMediaUrl(embedUrlObject, mediaHosts) || isRelayMediaUrl(embedUrlObject)) throw new ProviderFailure('malformed')
    } catch (error) {
      if (error instanceof ProviderFailure) throw error
      throw new ProviderFailure('malformed')
    }

    const embOp = bounded(parent, 10_000)
    let embedHtml: string
    try {
      const embRes = await document(http, embedAbs, embOp.signal, { 'user-agent': 'Mozilla/5.0', referer: `${origin}/`, ...htmlHeaders })
      embedHtml = embRes.text
    } finally {
      embOp.cleanup()
    }

    const urlMatch = embedHtml.match(/url:\s*'([^']+)'/)
    const tokenMatch = embedHtml.match(/'token':\s*'([^']+)'/)
    const expiresMatch = embedHtml.match(/'expires':\s*'([^']+)'/)
    if (!urlMatch || !tokenMatch) throw new ProviderFailure('empty')

    // Mirror the site's own assembly: truthy params only, h=1 only when the
    // embed carries canPlayFHD, lang from the embed (default en).
    let master: URL
    try {
      master = new URL(urlMatch[1]!)
    } catch {
      throw new ProviderFailure('malformed')
    }
    if (!allowedMediaUrl(master, mediaHosts) || isRelayMediaUrl(master)) throw new ProviderFailure('malformed')
    master.searchParams.set('token', tokenMatch[1]!)
    if (expiresMatch?.[1]) master.searchParams.set('expires', expiresMatch[1]!)
    if (/canPlayFHD/.test(embedAbs)) master.searchParams.set('h', '1')
    let lang = 'en'
    try {
      lang = new URL(embedAbs).searchParams.get('lang') || 'en'
    } catch { /* default en */ }
    master.searchParams.set('lang', lang)

    // Verify the assembled master and derive the quality label from its
    // renditions: a dead or non-HLS master never becomes a session.
    const plOp = bounded(parent, 10_000)
    let text: string
    try {
      const plRes = await http(master.toString(), { 'user-agent': 'Mozilla/5.0' }, plOp.signal)
      if (plRes.status < 200 || plRes.status >= 300) throw new ProviderFailure('empty')
      text = plRes.text
      assertPlaylist(text)
    } finally {
      plOp.cleanup()
    }
    const heights = masterVariantHeights(text) ?? []
    const maxHeight = heights.length ? Math.max(...heights) : 0
    const access = sourceAccess(master.toString(), now())
    return [{
      key: 'streamingunity:auto:0',
      url: master.href,
      type: mediaType(master.href) ?? 'hls',
      qualityHint: maxHeight > 0 ? `${maxHeight}p` : 'auto',
      ...(maxHeight > 0 ? { height: maxHeight } : {}),
      ...(access.expiryEstimated ? { expiryEstimated: true } : {}),
      expiresAt: access.expiresAt,
      language: 'original',
      headers: {},
      subtitles: [],
    }]
  }

  function assertPlaylist(text: string) {
    if (!/^\s*#EXTM3U/.test(text) || !/#EXT-X-(?:STREAM-INF|TARGETDURATION|MEDIA-SEQUENCE):/.test(text)) throw new ProviderFailure('malformed')
  }

  return adapter('streamingunity', async (input, signal) => {
    const { ref } = input
    const isTv = ref.kind === 'series'
    if ((ref.kind !== 'movie' && !isTv) || (isTv && (!ref.season || !ref.episode))) throw new ProviderFailure('empty')
    const meta = await metadata(ref, signal)
    const candidates = await search(meta.title, isTv ? 'tv' : 'movie', signal)
    if (!candidates.length) throw new ProviderFailure('empty')

    let embedUrl = ''
    for (const candidate of candidates.slice(0, 5)) {
      signal.throwIfAborted()
      if (isTv) {
        const detail = await inertia(`/en/titles/${candidate.id}-${candidate.slug}`, signal)
        if (detail?.component !== 'Titles/Title') continue
        const title = (detail.props as { title?: { tmdb_id?: string | number } } | undefined)?.title
        const detailTmdb = title?.tmdb_id
        if (detailTmdb && String(detailTmdb) !== String(ref.id)) continue
        const episodes = await episodesFor(detail, ref.season!, signal)
        const episode = episodes.find((entry) => Number(entry.number) === Number(ref.episode))
        if (!episode) continue
        // The site itself says "Video unavailable" for episodes without scws_id.
        if (!episode.scws_id) throw new ProviderFailure('empty')
        const watch = await inertia(`/en/watch/${candidate.id}?e=${episode.id}`, signal)
        if (watch?.component !== 'Titles/Watch') continue
        const watchEpisode = (watch.props as { episode?: { number?: number; season?: { number?: number }; season_number?: number } } | undefined)?.episode
        if (watchEpisode && (Number(watchEpisode.number) !== Number(ref.episode) || seasonOf(watchEpisode) !== Number(ref.season))) continue
        embedUrl = String((watch.props as { embedUrl?: unknown } | undefined)?.embedUrl ?? '')
        if (embedUrl) break
      } else {
        const watch = await inertia(`/en/watch/${candidate.id}`, signal)
        if (watch?.component !== 'Titles/Watch') continue
        const watchTitle = (watch.props as { title?: { tmdb_id?: string | number; name?: string } } | undefined)?.title
        const watchTmdb = watchTitle?.tmdb_id
        if (watchTmdb && String(watchTmdb) !== String(ref.id)) continue
        embedUrl = String((watch.props as { embedUrl?: unknown } | undefined)?.embedUrl ?? '')
        if (embedUrl) break
      }
    }
    if (!embedUrl) throw new ProviderFailure('empty')
    return resolveEmbed(embedUrl, signal)
  })
}
