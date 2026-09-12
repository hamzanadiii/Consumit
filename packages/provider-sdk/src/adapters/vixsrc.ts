import { z } from 'zod'
import { accessDeadline, adapter, document, ProviderFailure, titlePath, userAgent, type ProviderHttp } from './http.ts'

const origin = 'https://vixsrc.to'
const responseSchema = z.object({ src: z.string().min(1).max(4096) })

/** Port of the supplied VixSrc API recipe; no page scripts are executed. */
export function createVixsrcProvider(http: ProviderHttp, now = Date.now) {
  return adapter('vixsrc', async (input, signal) => {
    const apiUrl = `${origin}/api${titlePath(input)}`
    const headers = { referer: `${origin}/`, origin }
    const api = await document(http, apiUrl, signal, headers)
    const { src } = responseSchema.parse(JSON.parse(api.text))
    const pageUrl = new URL(src, origin)
    if (pageUrl.origin !== origin) throw new ProviderFailure('malformed')
    const page = await document(http, pageUrl.href, signal, headers)
    const token = page.text.match(/token["']\s*:\s*["']([^"']+)/)?.[1]
    const expires = page.text.match(/expires["']\s*:\s*["'](\d+)/)?.[1]
    const playlist = page.text.match(/\burl\s*:\s*["']([^"']+)/)?.[1]
    if (!token || !expires || !playlist) throw new ProviderFailure('malformed')
    const master = new URL(playlist, pageUrl)
    master.searchParams.set('token', token)
    master.searchParams.set('expires', expires)
    master.searchParams.set('h', '1')
    const expiresAt = accessDeadline(master.href, now(), Number(expires) * 1000)
    const deliveryHeaders = { referer: apiUrl, 'user-agent': userAgent }
    const manifest = await document(http, master.href, signal, deliveryHeaders)
    if (!manifest.text.trimStart().startsWith('#EXTM3U') || !/#EXT-X-(STREAM-INF|TARGETDURATION):/.test(manifest.text)) throw new ProviderFailure('malformed')
    // Audio and segmented subtitle renditions remain in the adaptive HLS manifest.
    return [{ key: 'original-hls', url: manifest.url, type: 'hls', headers: deliveryHeaders, language: 'original', expiresAt, subtitles: [] }]
  })
}
