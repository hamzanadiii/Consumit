import { Buffer } from 'node:buffer'
import { z } from 'zod'
import { sourceAccess, adapter, document, mediaType, ProviderFailure, userAgent, type ProviderHttp } from './http.ts'
import { discoverRelaySource } from './relay-discovery.ts'

const origin = 'https://vidstorm.to'
const keyBlob = 'C1oPWQVfDl0EXglYDVoIWQpdBV8PXgtYDlkJWgRdDV8IXgpYBVkOWgldBF8NXghYC1kFWg5dCV8EXg1YCFkLWg=='
const payloadSchema = z.object({ boron: z.object({ url: z.string().max(4096), language: z.string().max(32).optional(), type: z.string().max(16).optional() }).nullish() })

export async function decodeStormUrl(value: string): Promise<string> {
  if (value.startsWith('https://')) return value
  const raw = Buffer.from(value, 'base64url')
  if (raw.length < 29) throw new ProviderFailure('malformed')
  const hex = [...Buffer.from(keyBlob, 'base64')].map(byte => String.fromCharCode(byte ^ 60)).join('')
  const key = await crypto.subtle.importKey('raw', Buffer.from(hex, 'hex'), 'AES-GCM', false, ['decrypt'])
  return new TextDecoder('utf-8', { fatal: true }).decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.subarray(0, 12) }, key, raw.subarray(12)))
}

export function createStormBoronProvider(http: ProviderHttp, now = Date.now) {
  return adapter('stormboron', async ({ ref }, signal) => {
    if (ref.kind !== 'movie' && ref.kind !== 'series') throw new ProviderFailure('empty')
    const path = ref.kind === 'movie' ? `/api/movie/${ref.id}` : `/api/tv/${ref.id}/${ref.season}/${ref.episode}`
    const response = await document(http, `${origin}${path}`, signal, { accept: 'application/json' })
    const source = payloadSchema.parse(JSON.parse(response.text)).boron
    if (!source) throw new ProviderFailure('empty')
    const url = await decodeStormUrl(source.url)
    if (!url.startsWith('https://')) throw new ProviderFailure('malformed')
    const candidate = { key: 'stormboron:boron', url, type: mediaType(url, source.type) ?? 'hls',
      headers: { referer: `${origin}/`, origin, 'user-agent': userAgent },
      ...sourceAccess(url, now()), language: /^english$/i.test(source.language ?? '') ? 'en' : 'original',
      qualityHint: 'Auto', subtitles: [] }
    return [http.mediaScope ? await discoverRelaySource(candidate, http, 'storm-boron-v1', signal) : candidate]
  })
}
