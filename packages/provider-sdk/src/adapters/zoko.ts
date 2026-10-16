import { Buffer } from 'node:buffer'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, mediaType, parseSkipSegments, ProviderFailure, userAgent, type ProviderHttp } from './http.ts'

const siteOrigin = 'https://zokoanime.video'

// Port of the PROVE Zoko recipe: episodes addressed by MAL id.
//   /stream/mal/{malId}/{ep}/{sub|dub} -> window.__P base64 blob
//   XOR each byte with 'otaku-embed-v1', base64-decode, URI-decode
//   -> { src (master m3u8), subtitles[], skip { intro, outro } }.
// Gate: the media host checks Origin, so these sources always ride the
// Worker proxy (which forwards the declared Origin) — never direct.
const OBF_KEY = 'otaku-embed-v1'
const HOP_TIMEOUT_MS = 5000

export type ZokoMetaResolver = (anilistId: number, signal: AbortSignal) => Promise<{ title: string; malId: number | null }>

function deobfuscate(blob: string): { src?: unknown; subtitles?: unknown } {
  const raw = Buffer.from(String(blob).trim(), 'base64').toString('binary')
  let text = ''
  for (let i = 0; i < raw.length; i++) {
    text += String.fromCharCode(raw.charCodeAt(i) ^ OBF_KEY.charCodeAt(i % OBF_KEY.length))
  }
  return JSON.parse(decodeURIComponent(escape(text)))
}

function bounded(parent: AbortSignal, ms: number) {
  const controller = new AbortController()
  if (parent.aborted) controller.abort(parent.reason)
  const onAbort = () => controller.abort(parent.reason)
  parent.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('Zoko step timed out', 'TimeoutError')), ms)
  return { signal: controller.signal, cleanup: () => { clearTimeout(timer); parent.removeEventListener('abort', onAbort) } }
}

export function createZokoProvider(http: ProviderHttp, resolveMeta: ZokoMetaResolver, now = Date.now) {
  return adapter('zoko', async (input, signal) => {
    const { ref } = input
    if (ref.kind !== 'anime' || !ref.episode) throw new ProviderFailure('empty')
    const dub = input.audioLanguage === 'en'
    const audio = dub ? 'dub' : 'sub'
    const episode = ref.episode
    let malId = 0
    try {
      malId = (await resolveMeta(ref.id, signal)).malId ?? 0
    } catch {
      throw new ProviderFailure('empty')
    }
    if (!malId) throw new ProviderFailure('empty')

    const op = bounded(signal, HOP_TIMEOUT_MS)
    try {
      const pageUrl = `${siteOrigin}/stream/mal/${malId}/${episode}/${audio}`
      const page = await document(http, pageUrl, op.signal, { accept: 'text/html', referer: `${siteOrigin}/` })
      const blob = page.text.match(/window\.__P="([^"]+)"/)?.[1]
      if (!blob) throw new ProviderFailure('empty')
      let data: { src?: unknown; subtitles?: unknown }
      try {
        data = deobfuscate(blob)
      } catch {
        throw new ProviderFailure('malformed')
      }
      const src = String((data as { src?: unknown }).src ?? '')
      if (!/^https?:\/\//.test(src)) throw new ProviderFailure('empty')
      const type = /m3u8/i.test(src) ? 'hls' : mediaType(src) ?? 'hls'
      const subtitles: ProviderSource['subtitles'] = []
      const seen = new Set<string>()
      const tracks = (data as { subtitles?: unknown }).subtitles
      if (Array.isArray(tracks)) {
        for (const track of tracks) {
          const entry = track as { src?: unknown; label?: unknown; lang?: unknown }
          const url = String(entry?.src ?? '')
          if (!url.startsWith('https://') || seen.has(url) || subtitles.length >= 20) continue
          seen.add(url)
          const label = String(entry?.label ?? entry?.lang ?? 'Unknown').slice(0, 64)
          subtitles.push({ id: `zoko-sub-${subtitles.length}`, label, language: label.slice(0, 32), url, format: /\.srt/i.test(url) ? 'srt' : 'vtt' })
        }
      }
      return [{
        key: `zoko:${audio}:${episode}:0`,
        url: src,
        type,
        qualityHint: 'Auto',
        expiresAt: accessDeadline(src, now()),
        language: dub ? 'en' : 'original',
        headers: { referer: pageUrl, origin: siteOrigin, 'user-agent': userAgent },
        subtitles,
        skipSegments: parseSkipSegments((data as { skip?: unknown }).skip),
      }]
    } finally {
      op.cleanup()
    }
  })
}
