import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, mediaType, ProviderFailure, type ProviderHttp } from './http.ts'

const apiOrigin = 'https://scrapper.rivestream.app'
const headers = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  accept: 'application/json',
  connection: 'close',
}
const responseSchema = z.object({
  data: z.object({
    sources: z.array(z.object({
      url: z.string().max(4096).optional(),
      quality: z.string().max(64).optional(),
      format: z.string().max(16).optional(),
    }).passthrough()).max(64).optional(),
  }).passthrough().optional(),
}).passthrough()

function bounded(parent: AbortSignal) {
  const controller = new AbortController()
  if (parent.aborted) controller.abort(parent.reason)
  const onAbort = () => controller.abort(parent.reason)
  parent.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('Rive Apollo request timed out', 'TimeoutError')), 9000)
  return { signal: controller.signal, cleanup: () => { clearTimeout(timer); parent.removeEventListener('abort', onAbort) } }
}

function unwrapValhalla(value: string) {
  try {
    const url = new URL(value)
    if (/valhallastream/i.test(url.hostname)) {
      const inner = url.searchParams.get('url')
      if (inner) return inner
    }
  } catch { /* the caller rejects malformed URLs */ }
  return value
}

export function createRiveApolloProvider(http: ProviderHttp, now = Date.now) {
  return adapter('riveapollo', async ({ ref }, signal) => {
    if (ref.kind !== 'movie' && ref.kind !== 'series') throw new ProviderFailure('empty')
    const query = ref.kind === 'movie'
      ? `provider=apollo&id=${encodeURIComponent(String(ref.id))}`
      : `provider=apollo&id=${encodeURIComponent(String(ref.id))}&season=${ref.season}&episode=${ref.episode}`
    const op = bounded(signal)
    let response: Awaited<ReturnType<ProviderHttp>>
    try {
      response = await http(`${apiOrigin}/api/provider?${query}`, headers, op.signal)
    } catch (error) {
      if (signal.aborted) throw error
      throw new ProviderFailure('unavailable')
    } finally { op.cleanup() }
    if (response.status === 404) throw new ProviderFailure('empty')
    if (response.status < 200 || response.status >= 300) throw new ProviderFailure('unavailable')
    let result: z.infer<typeof responseSchema>
    try { result = responseSchema.parse(JSON.parse(response.text)) }
    catch { throw new ProviderFailure('malformed') }

    const sources: ProviderSource[] = []
    const seen = new Set<string>()
    for (const [index, item] of (result.data?.sources ?? []).entries()) {
      const rawUrl = unwrapValhalla(item.url?.trim() ?? '')
      if (!rawUrl) continue
      let url: URL
      try { url = new URL(rawUrl) } catch { continue }
      if (url.protocol !== 'https:' || url.username || url.password || seen.has(url.href)) continue

      const formatHint = `${item.format ?? ''} ${item.quality ?? ''}`.toLowerCase()
      const type = mediaType(url.href, formatHint.includes('hls') ? 'hls' : undefined)
        ?? (formatHint.includes('mp4') ? 'native' : undefined)
      if (!type) continue
      let expiresAt: string
      try { expiresAt = accessDeadline(url.href, now()) } catch { continue }

      const quality = (item.quality ?? 'Auto').trim().slice(0, 64) || 'Auto'
      const height = Number.parseInt(/(\d{3,4})\s*p?/i.exec(quality)?.[1] ?? '0', 10)
      seen.add(url.href)
      sources.push({
        key: `riveapollo:${height > 0 ? `${height}p` : 'auto'}:${index}`,
        url: url.href,
        type,
        qualityHint: height > 0 ? `${height}p` : quality,
        expiresAt,
        language: 'original',
        // The partner referrer is needed for server-side manifest checks.
        // Keep the HLS request direct; the browser sends Consumit's own origin.
        headers: { referer: 'https://atlantic.st/' },
        subtitles: [],
        ...(height > 0 ? { height } : {}),
      })
      if (sources.length >= 32) break
    }
    if (!sources.length) throw new ProviderFailure('empty')
    return sources
  })
}
