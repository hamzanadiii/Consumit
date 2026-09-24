import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, ProviderFailure, type ProviderHttp } from './http.ts'

const siteOrigin = 'https://rozgarlelo.modiplay.xyz'
const embedUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

// Port of the PROVE Modiplay recipe (StreamHG/vibuxer backend).
//   /embed/tmdb/movie?id= (or /embed/tmdb/tv?id=&s=&e=)
//   -> iframe proxy.php?p=streamhg page
//   -> var src="/proxy.php?serve_m3u8=1&ref=&url={vibuxer master}&ebd="
//      (+ <track> subtitles, + directSrc fallback rebuild)
// The relay URL is the playable source: raw vibuxer URLs are
// hotlink-locked (403), so these always ride the Worker proxy, which
// forwards the declared Referer through the manifest rewrite chain.

function unescapeHtml(value: string): string {
  return value.replace(/&amp;/g, '&').replace(/\\\//g, '/')
}

function bounded(parent: AbortSignal, ms: number) {
  const controller = new AbortController()
  if (parent.aborted) controller.abort(parent.reason)
  const onAbort = () => controller.abort(parent.reason)
  parent.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('Modiplay step timed out', 'TimeoutError')), ms)
  return { signal: controller.signal, cleanup: () => { clearTimeout(timer); parent.removeEventListener('abort', onAbort) } }
}

export function createModiplayProvider(http: ProviderHttp, now = Date.now) {
  return adapter('modiplay', async (input, signal) => {
    const { ref } = input
    const isTv = ref.kind === 'series'
    if ((ref.kind !== 'movie' && !isTv) || (isTv && (!ref.season || !ref.episode))) throw new ProviderFailure('empty')
    const embedUrl = isTv
      ? `${siteOrigin}/embed/tmdb/tv?id=${encodeURIComponent(String(ref.id))}&s=${ref.season}&e=${ref.episode}`
      : `${siteOrigin}/embed/tmdb/movie?id=${encodeURIComponent(String(ref.id))}`
    const op = bounded(signal, 12000)
    try {
      const embed = await document(http, embedUrl, op.signal, { accept: 'text/html,*/*', referer: `${siteOrigin}/`, 'user-agent': embedUA })
      const iframeSrc = embed.text.match(/<iframe[^>]*src="([^"]*proxy\.php[^"]*)"/i)?.[1]
      if (!iframeSrc) throw new ProviderFailure('empty')
      const playerUrl = unescapeHtml(iframeSrc.startsWith('http') ? iframeSrc : `${siteOrigin}${iframeSrc}`)
      const page = await document(http, playerUrl, op.signal, { accept: 'text/html,*/*', referer: embedUrl, 'user-agent': embedUA })
      const relayPath =
        page.text.match(/var src="([^"]+)"/)?.[1] ||
        page.text.match(/relaySrc\s*=\s*src\s*\+\s*[^;]+;\s*var\s+\w+\s*=\s*"([^"]*serve_m3u8[^"]*)"/)?.[1]
      const directSrc = page.text.match(/var directSrc="([^"]+)"/)?.[1]
      const sources: ProviderSource[] = []
      const push = (url: string) => {
        const clean = unescapeHtml(url.trim())
        const absolute = /^https?:\/\//i.test(clean) ? clean : clean.startsWith('/') ? `${siteOrigin}${clean}` : ''
        if (!absolute || sources.some((s) => s.url === absolute)) return
        sources.push({
          key: `modiplay:auto:${sources.length}`,
          url: absolute,
          type: 'hls',
          qualityHint: 'Auto',
          expiresAt: accessDeadline(absolute, now()),
          language: 'original',
          headers: { referer: playerUrl, 'user-agent': embedUA },
          subtitles: [],
        })
      }
      if (relayPath) push(relayPath)
      if (!sources.length && directSrc) {
        const raw = unescapeHtml(directSrc)
        const m = raw.match(/^(https?:\/\/[^/]+)(\/stream\/.*)$/i)
        if (m) push(`${siteOrigin}/proxy.php?serve_m3u8=1&ref=${encodeURIComponent(playerUrl)}&url=${encodeURIComponent(raw)}&ebd=${encodeURIComponent(m[1] ?? '')}`)
      }
      if (!sources.length) throw new ProviderFailure('empty')
      const subtitles: ProviderSource['subtitles'] = []
      const seenSubs = new Set<string>()
      for (const m of page.text.matchAll(/<track[^>]*src="([^"]+)"[^>]*label="([^"]*)"/gi)) {
        let file = unescapeHtml(m[1] ?? '')
        if (file.startsWith('/')) file = `${siteOrigin}${file}`
        if (!file.startsWith('https://') || seenSubs.has(file) || subtitles.length >= 20) continue
        seenSubs.add(file)
        const label = (m[2] || 'Unknown').slice(0, 64)
        subtitles.push({ id: `modiplay-sub-${subtitles.length}`, label, language: label.slice(0, 32), url: file, format: /\.srt/i.test(file) ? 'srt' : 'vtt' })
      }
      return sources.map((source) => ({ ...source, subtitles }))
    } finally {
      op.cleanup()
    }
  })
}
