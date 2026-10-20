import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, mediaType, ProviderFailure, userAgent, type ProviderHttp, type ProviderTitleMetadataResolver } from './http.ts'

// Port of the PROVE AuroraScreen recipe (verified live 2026-10-19):
//   GET https://stream.aurorascreen.org/{venus|jupiter}?id={tmdbId}
//       &name={title}&year={year}[&s={season}&e={episode}]
//   headers: UA + Accept: application/json + Referer: https://www.aurorascreen.org/
//   -> {success:true, streams:[{source, quality, url, type?, edge?,
//       subtitles:[{language,url,name}]}]}
//   venus  1 HLS master (cflul.bx5.workers.dev, bare ACAO *), subs .srt on
//          cacdn.hakunaymatata.com (CloudFront signed)
//   jupiter HLS via own /jpl proxy (media playlist bare ACAO *) -> /jseg
//          segments Require Referer (relay leg)
//   pluto/saturn HTTP 502, mars = DASH-only — skipped.
// TMDB verification gates on title match; fake ids answer empty fast.

const siteOrigin = 'https://www.aurorascreen.org'
const streamOrigin = 'https://stream.aurorascreen.org'
const clientHeaders = { 'user-agent': userAgent, accept: 'application/json', referer: `${siteOrigin}/` }

const streamSchema = z.object({
  source: z.string().max(64).optional(),
  quality: z.string().max(32).optional(),
  url: z.string().max(4096).optional(),
  type: z.string().max(16).optional(),
  edge: z.string().max(256).optional(),
  subtitles: z.array(z.object({
    language: z.string().max(64).optional(),
    url: z.string().max(4096).optional(),
    name: z.string().max(128).optional(),
  }).passthrough()).max(32).optional(),
}).passthrough()

const responseSchema = z.object({
  success: z.boolean().optional(),
  streams: z.array(streamSchema).max(32).optional(),
}).passthrough()

export function createAuroraScreenProvider(http: ProviderHttp, resolveMetadata: ProviderTitleMetadataResolver, now = Date.now) {
  return adapter('aurorascreen', async (input, signal) => {
    const { ref } = input
    const isTv = ref.kind === 'series'
    if ((ref.kind !== 'movie' && !isTv) || (isTv && (!ref.season || !ref.episode))) throw new ProviderFailure('empty')

    const metadata = await resolveMetadata(ref, signal)
    if (!metadata.title.trim() || !Number.isInteger(metadata.year)) throw new ProviderFailure('empty')
    const query = new URLSearchParams({ id: String(ref.id), name: metadata.title.trim(), year: String(metadata.year) })
    if (isTv) {
      query.set('s', String(ref.season))
      query.set('e', String(ref.episode))
    }

    const sources: ProviderSource[] = []
    const seenUrls = new Set<string>()
    let lastError: unknown

    for (const server of ['venus', 'jupiter'] as const) {
      if (signal.aborted) break
      const op = bounded(signal, 10000)
      let parsed: z.infer<typeof responseSchema>
      try {
        const res = await document(http, `${streamOrigin}/${server}?${query}`, op.signal, clientHeaders)
        parsed = responseSchema.parse(JSON.parse(res.text))
      } catch (error) {
        if (error instanceof ProviderFailure) { lastError = error; continue }
        if (error instanceof DOMException && !signal.aborted) { lastError = new ProviderFailure('unavailable'); continue }
        throw error
      } finally {
        op.cleanup()
      }
      if (parsed.success !== true || !parsed.streams?.length) continue

      for (const stream of parsed.streams) {
        if (sources.length >= 4) break
        const url = stream.url?.trim()
        if (!url || !/^https:\/\//.test(url) || seenUrls.has(url)) continue
        seenUrls.add(url)

        let quality = stream.quality?.trim() || 'Auto'
        if (server === 'venus') {
          const label = await labelFromMaster(http, url, signal)
          if (label) quality = label
        }

        let expiresAt: string
        try { expiresAt = accessDeadline(url, now()) } catch { continue }

        const subtitles = server === 'venus' ? mapSubtitles(stream.subtitles) : []
        sources.push({
          key: `aurorascreen:${server}:${sources.length}`,
          url,
          type: mediaType(url) ?? 'hls',
          qualityHint: quality,
          language: 'original',
          headers: server === 'jupiter' ? { referer: `${siteOrigin}/` } : {},
          subtitles,
          expiresAt,
        })
      }
      if (sources.length) break
    }

    if (!sources.length) {
      if (lastError instanceof ProviderFailure && lastError.code !== 'empty') throw lastError
      throw new ProviderFailure('empty')
    }
    return sources
  })
}

function bounded(parent: AbortSignal, ms: number) {
  const controller = new AbortController()
  if (parent.aborted) controller.abort(parent.reason)
  const onAbort = () => controller.abort(parent.reason)
  parent.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('AuroraScreen request timed out', 'TimeoutError')), ms)
  return { signal: controller.signal, cleanup: () => { clearTimeout(timer); parent.removeEventListener('abort', onAbort) } }
}

/** Highest RESOLUTION rung off a (small) HLS master; null if unfetchable. */
async function labelFromMaster(http: ProviderHttp, url: string, signal: AbortSignal): Promise<string | null> {
  const op = bounded(signal, 6000)
  try {
    const res = await document(http, url, op.signal, { 'user-agent': userAgent })
    const text = res.text
    if (!text.includes('#EXTM3U')) return null
    let best = 0
    for (const match of text.matchAll(/RESOLUTION=\d+x(\d+)/g)) {
      const height = Number(match[1])
      if (height > best) best = height
    }
    return best ? `${best}p` : null
  } catch {
    return null
  } finally {
    op.cleanup()
  }
}

function mapSubtitles(tracks: z.infer<typeof streamSchema>['subtitles']): ProviderSource['subtitles'] {
  const out: ProviderSource['subtitles'] = []
  const seen = new Set<string>()
  for (const track of tracks ?? []) {
    const url = track.url
    if (!url?.startsWith('https://') || seen.has(url) || out.length >= 16) continue
    seen.add(url)
    const label = (track.name ?? track.language ?? 'Unknown').slice(0, 64) || 'Unknown'
    out.push({
      id: `aurorascreen-sub-${out.length}`,
      label,
      language: (track.language ?? label).slice(0, 32),
      url,
      format: /\.vtt(?:[?#]|$)/i.test(url) ? 'vtt' : 'srt',
    })
  }
  const en = (s: ProviderSource['subtitles'][number]) => Number(/^(en|eng|english)/i.test(`${s.language} ${s.label}`.trim()))
  return out.sort((a, b) => en(b) - en(a))
}
