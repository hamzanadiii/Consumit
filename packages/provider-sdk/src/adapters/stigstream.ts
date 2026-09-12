import { Buffer } from 'node:buffer'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, mediaType, ProviderFailure, verifiedPlaybackSources, type ProviderHttp } from './http.ts'

const origin = 'https://api.stigstream.ru'
const siteOrigin = 'https://stigstream.ru'
const defaultHeaders = {
  referer: `${siteOrigin}/`,
  origin: siteOrigin,
  accept: 'application/json',
}
const info = new TextEncoder().encode('yur/secure-channel/v1|aes-256-gcm')
const SERVERS = ['Nova', 'Comet', 'Nebula', 'Cosmic', 'Obsidian', 'Flux', 'Orion', 'Atlas']

type Session = { sessionId: string; key: CryptoKey; expiresAt: number }

export function createStigstreamProvider(http: ProviderHttp, now = Date.now) {
  let cached: Session | null = null
  let handshaking: Promise<Session> | null = null

  async function getSession(signal: AbortSignal): Promise<Session> {
    if (cached && now() < cached.expiresAt) return cached
    if (!handshaking) {
      handshaking = (async () => {
        const kp = await crypto.subtle.generateKey(
          { name: 'ECDH', namedCurve: 'P-256' },
          false,
          ['deriveBits'],
        )
        const rawPub = await crypto.subtle.exportKey('raw', kp.publicKey)
        const res = await document(
          http,
          `${origin}/secure/handshake`,
          signal,
          { ...defaultHeaders, 'content-type': 'application/json' },
          { method: 'POST', body: JSON.stringify({ clientPublicKey: Buffer.from(rawPub).toString('base64') }) },
        )
        const data = JSON.parse(res.text) as {
          sessionId: string
          serverPublicKey: string
          salt: string
          ttl?: number
        }
        const serverPub = await crypto.subtle.importKey(
          'raw',
          Buffer.from(data.serverPublicKey, 'base64'),
          { name: 'ECDH', namedCurve: 'P-256' },
          false,
          [],
        )
        const bits = await crypto.subtle.deriveBits(
          { name: 'ECDH', public: serverPub } as EcdhKeyDeriveParams,
          kp.privateKey,
          256,
        )
        const hk = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey'])
        const key = await crypto.subtle.deriveKey(
          { name: 'HKDF', hash: 'SHA-256', salt: Buffer.from(data.salt, 'base64'), info } as HkdfParams,
          hk,
          { name: 'AES-GCM', length: 256 },
          false,
          ['decrypt'],
        )
        return { sessionId: data.sessionId, key, expiresAt: now() + (data.ttl ?? 600000) - 5000 }
      })().finally(() => { handshaking = null })
    }
    cached = await handshaking
    return cached
  }

  return adapter('stigstream', async (input, signal) => {
    const session = await getSession(signal)
    const { ref } = input

    for (let i = 0; i < SERVERS.length; i++) {
      const server = SERVERS[i]
      const path = ref.kind === 'movie'
        ? `/movie/${server}/${ref.id}`
        : `/tv/${server}/${ref.id}/${ref.season}/${ref.episode}`
      const url = `${origin}${path}`

      let text = ''
      try {
        const res = await document(http, url, signal, {
          ...defaultHeaders,
          'x-session-id': session.sessionId,
        })
        text = res.text
      } catch {
        continue
      }

      let payload: any
      try {
        const json = JSON.parse(text)
        if (json && json.v === '4' && json.iv && json.data) {
          const iv = Buffer.from(json.iv, 'base64')
          const ct = Buffer.from(json.data, 'base64')
          const pt = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv, tagLength: 128 },
            session.key,
            ct,
          )
          payload = JSON.parse(new TextDecoder().decode(pt))
        } else {
          payload = json
        }
      } catch {
        continue
      }

      const streams = Array.isArray(payload?.streams) ? payload.streams : []
      if (!streams.length) continue

      const subtitles = (Array.isArray(payload?.subtitles) ? payload.subtitles : []).map((sub: any, sIdx: number) => ({
        id: `stigstream-sub-${sIdx}`,
        label: sub.lang || sub.label || `Subtitle ${sIdx + 1}`,
        language: (sub.lang || sub.label || 'und').toLowerCase().slice(0, 10),
        url: sub.url,
        format: (sub.url.endsWith('.srt') ? 'srt' : 'vtt') as 'vtt' | 'srt',
      }))

      const lang = server === 'Orion' ? 'Turkish' : server === 'Atlas' ? 'French' : 'original'

      const sources: ProviderSource[] = []
      for (let sIdx = 0; sIdx < streams.length; sIdx++) {
        const str = streams[sIdx]
        if (!str.url) continue
        const type = mediaType(str.url) || (str.type === 'mp4' ? 'native' : 'hls')
        sources.push({
          key: `stigstream:${server.toLowerCase()}:${sIdx}`,
          url: str.url,
          type,
          qualityHint: str.quality || 'Auto',
          expiresAt: accessDeadline(str.url, now()),
          language: lang,
          headers: { referer: `${siteOrigin}/` },
          subtitles,
        })
      }

      if (sources.length > 0) {
        const verified = await verifiedPlaybackSources(http, sources, signal)
        if (verified.length > 0) return verified
      }
    }

    throw new ProviderFailure('empty')
  })
}
