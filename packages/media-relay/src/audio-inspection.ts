import { createHash } from 'node:crypto'
import { allowedMediaUrl, assertHlsManifest, parseHlsAttributeList, parseHlsReferences, sumMediaPlaylistDuration, validatedSources, type ProviderInput, type ProviderRegistration, type ProviderResult, type ProviderSource } from '@consumit/provider-sdk'
import { createProviderHttp } from '../../../apps/api/src/playback/provider-http.ts'
import type { MediaTransport } from '../../../apps/api/src/playback/transport.ts'

/** Edge-only playlist inspection. At most three wrapper masters and one
 * selected audio timeline are read; no video segments are downloaded. */
export async function inspectEdgeAudio(result: ProviderResult, provider: ProviderRegistration, input: ProviderInput, transport: MediaTransport, signal: AbortSignal): Promise<ProviderResult> {
  const source = validatedSources(result, provider).find(source => source.type === 'hls')
  if (!source) return { ok: false, code: 'empty', retryable: false }
  const safe = (url: string) => allowedMediaUrl(url, provider.mediaHosts, provider.mediaHostPatterns)
  const http = createProviderHttp(provider.mediaHosts, transport, false, provider.mediaHostPatterns)
  let current = source.url
  for (let depth = 0; depth < 3; depth++) {
    const response = await http(current, source.headers, signal)
    if (response.status !== 200 || assertHlsManifest(response.text) !== 'master' || parseHlsReferences(response.text, response.url).some(url => !safe(url))) return { ok: false, code: 'empty', retryable: false }
    const lines = response.text.split(/\r?\n/).map(line => line.trim()), tracks: ProviderSource[] = []
    for (const line of lines.filter(line => line.startsWith('#EXT-X-MEDIA:'))) {
      const attributes = Object.fromEntries(parseHlsAttributeList(line.slice('#EXT-X-MEDIA:'.length)))
      if (attributes.TYPE !== 'AUDIO' || !attributes.URI || !attributes.LANGUAGE || !attributes.NAME) continue
      const url = new URL(attributes.URI, response.url).href
      if (!safe(url)) continue
      let language: string
      try { language = Intl.getCanonicalLocales(attributes.LANGUAGE)[0]! } catch { continue }
      const key = createHash('sha256').update(JSON.stringify([input.ref, provider.adapter.id, attributes['GROUP-ID'], attributes.NAME, language])).digest('hex').slice(0, 32)
      if (input.audioTrackKey && input.audioTrackKey !== key) continue
      let audioDurationSec: number | undefined
      if (input.audioTrackKey) {
        const media = await http(url, source.headers, signal)
        if (media.status !== 200 || assertHlsManifest(media.text) !== 'media' || !media.text.includes('#EXT-X-ENDLIST') || parseHlsReferences(media.text, media.url).some(url => !safe(url))) continue
        audioDurationSec = sumMediaPlaylistDuration(media.text) ?? undefined
        if (!audioDurationSec || audioDurationSec > 86400) continue
      }
      tracks.push({ ...source, key, serverName: attributes.NAME.slice(0, 80), url, language, edgeAudio: true, ...(audioDurationSec ? { audioDurationSec } : {}) })
      if (tracks.length >= 20) break
    }
    if (tracks.length) return { ok: true, sources: tracks }
    const variant = lines.find(line => line && !line.startsWith('#'))
    if (!variant) break
    current = new URL(variant, response.url).href
  }
  return { ok: false, code: 'empty', retryable: false }
}
