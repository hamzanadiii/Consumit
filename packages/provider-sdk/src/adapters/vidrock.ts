import { Buffer } from 'node:buffer'
import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, mediaType, ProviderFailure, type ProviderHttp } from './http.ts'

const origin = 'https://vidrock.to'
const keyHex = '7f3e9c2a8b5d1f4e6a9c3b7d2e5f8a1c4b6d9e2f5a8c1b4d7e9f2a5c8b1d4e7f'

async function decryptUrl(ciphertext: string): Promise<string> {
  const buf = Buffer.from(ciphertext, 'base64url')
  if (buf.length < 13) return ''
  const iv = buf.subarray(0, 12)
  const data = buf.subarray(12)
  const key = await crypto.subtle.importKey('raw', Buffer.from(keyHex, 'hex'), 'AES-GCM', false, ['decrypt'])
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
  return new TextDecoder().decode(pt)
}

const playlistItemSchema = z.object({
  resolution: z.union([z.number(), z.string()]),
  url: z.string().max(4096),
})

export type VidrockScope = { id?: string; servers?: string[] }

export function createVidrockProvider(http: ProviderHttp, now = Date.now, scope: VidrockScope = {}) {
  const { id = 'vidrock', servers } = scope
  const wanted = servers?.map((server) => server.toLowerCase())
  return Object.assign(adapter('vidrock', async (input, signal) => {
    const { ref } = input
    const path = ref.kind === 'movie' ? `/api/movie/${ref.id}` : `/api/tv/${ref.id}/${ref.season}/${ref.episode}`
    const url = `${origin}${path}`

    let doc: { text: string }
    try {
      doc = await document(http, url, signal, { referer: `${origin}/`, accept: 'application/json' })
    } catch {
      throw new ProviderFailure('empty')
    }

    let serversObj: Record<string, { url: string; type?: string }>
    try {
      serversObj = JSON.parse(doc.text)
    } catch {
      throw new ProviderFailure('empty')
    }

    const sources: ProviderSource[] = []
    const serverEntries = Object.entries(serversObj)

    for (let idx = 0; idx < serverEntries.length; idx++) {
      const serverEntry = serverEntries[idx]
      if (!serverEntry) continue
      const [serverName, entry] = serverEntry
      if (!entry.url) continue
      // Scoped mirrors (e.g. Nova) match by substring so upstream renames
      // (`Nova Prime`) keep working; unknown scopes answer empty, never wide.
      if (wanted && !wanted.some((name) => serverName.toLowerCase().includes(name))) continue

      let decUrl = ''
      try {
        decUrl = await decryptUrl(entry.url)
      } catch {
        continue
      }
      if (!decUrl || decUrl.includes('workers.dev')) continue

      if (decUrl.includes('streamrk.site/playlist/')) {
        try {
          const plRes = await document(http, decUrl, signal, { referer: `${origin}/` })
          const items = z.array(playlistItemSchema).parse(JSON.parse(plRes.text))
          for (let pIdx = 0; pIdx < items.length; pIdx++) {
            const item = items[pIdx]
            if (!item) continue
            const type = mediaType(item.url) || 'hls'
            const res = item.resolution
            sources.push({
              key: `vidrock:${serverName.toLowerCase()}:${res}p:${pIdx}`,
              url: item.url,
              type,
              qualityHint: `${res}p`,
              expiresAt: accessDeadline(item.url, now()),
              language: 'original',
              headers: { referer: `${origin}/` },
              subtitles: [],
            })
          }
        } catch {
          // playlist expansion failed
        }
        continue
      }

      const type = entry.type === 'hls' || decUrl.endsWith('.m3u8') ? 'hls' : 'native'
      const qualityHint = type === 'hls' ? '1080p' : 'Auto'

      sources.push({
        key: `vidrock:${serverName.toLowerCase()}:${sources.length}`,
        url: decUrl,
        type,
        qualityHint,
        expiresAt: accessDeadline(decUrl, now()),
        language: 'original',
        headers: { referer: `${origin}/` },
        subtitles: [],
      })
    }

    if (!sources.length) throw new ProviderFailure('empty')
    return sources
  }), { id })
}
