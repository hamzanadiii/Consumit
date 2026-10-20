import { accessDeadline, adapter, ProviderFailure, userAgent, type ProviderHttp } from './http.ts'
import type { ProviderSource } from '../index.ts'

// Port of the PROVE bAnime recipe (verified 2026-10-16): no site API — the
// adapter constructs AniList-keyed master URLs directly on the sharky.systems
// CDN hosts. reanime is CORS-open; anikoto serves a fixed
// https://anime.sharky.systems ACAO (never the browser origin) and takes the
// anime.sharky.systems referer on both probe and playback. Both hosts are
// probed in parallel per audio lane; a 200 with an mpegurl content type or an
// #EXTM3U prefix is the existence gate (404 = missing episode). The requested
// lane 404s fall back to the other lane, labelled with the audio actually
// served. Operator tier: DIRECT. Subtitles: none upstream.
const HOSTS = [
  { host: 'reanime.sharky.systems', label: 'reanime', headers: {} as Record<string, string> },
  { host: 'anikoto.sharky.systems', label: 'anikoto', headers: { referer: 'https://anime.sharky.systems/' } },
] as const
const PROBE_TIMEOUT_MS = 8000

function bounded(parent: AbortSignal, ms: number) {
  const controller = new AbortController()
  if (parent.aborted) controller.abort(parent.reason)
  const onAbort = () => controller.abort(parent.reason)
  parent.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('Banime master probe timed out', 'TimeoutError')), ms)
  return { signal: controller.signal, cleanup: () => { clearTimeout(timer); parent.removeEventListener('abort', onAbort) } }
}

const masterUrl = (host: string, alid: number, ep: number, mode: 'sub' | 'dub') =>
  `https://${host}/s/ani/${alid}/${ep}/${mode}.m3u8`

/** Existence gate: the CDN answers a real playlist body or an mpegurl
 *  content type; anything else means the episode is missing on this host. */
async function masterAlive(http: ProviderHttp, url: string, headers: Record<string, string>, signal: AbortSignal): Promise<boolean> {
  const op = bounded(signal, PROBE_TIMEOUT_MS)
  try {
    const response = await http(url, { 'user-agent': userAgent, ...headers }, op.signal, { readPrefixBytes: 64 * 1024 })
    if (response.status < 200 || response.status >= 300) return false
    const contentType = String(response.headers?.get('content-type') ?? '').toLowerCase()
    if (contentType.includes('mpegurl')) return true
    return response.text.trimStart().startsWith('#EXTM3U')
  } catch {
    return false
  } finally {
    op.cleanup()
  }
}

export function createBanimeProvider(http: ProviderHttp, now = Date.now) {
  return Object.assign(adapter('banime', async (input, signal) => {
    const { ref } = input
    if (ref.kind !== 'anime' || !ref.episode) throw new ProviderFailure('empty')
    const ep = ref.episode
    const wanted: 'sub' | 'dub' = input.audioLanguage === 'en' ? 'dub' : 'sub'

    const tryMode = async (mode: 'sub' | 'dub') => {
      const settled = await Promise.allSettled(
        HOSTS.map(async (entry) => {
          const alive = await masterAlive(http, masterUrl(entry.host, ref.id, ep, mode), entry.headers, signal)
          return { entry, alive }
        }),
      )
      return settled.flatMap((result) =>
        result.status === 'fulfilled' && result.value.alive ? [result.value.entry] : [])
    }

    let usedAudio = wanted
    let hits = await tryMode(wanted)
    if (!hits.length) {
      const other = wanted === 'dub' ? 'sub' : 'dub'
      hits = await tryMode(other)
      if (hits.length) usedAudio = other
    }
    if (!hits.length) throw new ProviderFailure('empty')

    const language = usedAudio === 'dub' ? 'en' : 'original'
    const sources: ProviderSource[] = []
    for (const entry of hits.slice(0, 2)) {
      const url = masterUrl(entry.host, ref.id, ref.episode, usedAudio)
      let expiresAt: string
      try {
        expiresAt = accessDeadline(url, now())
      } catch {
        continue
      }
      sources.push({
        key: `banime:${entry.label}:${usedAudio}`, serverName: entry.label,
        url,
        type: 'hls',
        headers: { 'user-agent': userAgent, ...entry.headers },
        expiresAt,
        language,
        qualityHint: 'Auto',
        subtitles: [],
      })
    }
    if (!sources.length) throw new ProviderFailure('empty')
    return sources
  }), { audioLanguages: ['ja', 'en'] })
}
