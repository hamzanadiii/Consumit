import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, mediaType, ProviderFailure, verifiedPlaybackSources, type ProviderHttp } from './http.ts'

const origin = 'https://nhdapi.com'

const apiSchema = z.object({
  success: z.boolean(),
  m3u8: z.string().max(4096).nullable().optional(),
  playUrl: z.string().max(4096).nullable().optional(),
  audioTracks: z.array(z.object({
    url: z.string().max(4096),
    language: z.string().max(32),
  })).max(32).optional(),
  subtitles: z.array(z.object({
    url: z.string().max(4096),
    display: z.string().max(64).optional(),
    language: z.string().max(32).optional(),
    format: z.string().max(16).optional(),
  })).max(64).optional(),
  provider: z.string().max(64).optional(),
  kind: z.string().max(32).nullable().optional(),
})

const subsSchema = z.object({
  subtitles: z.array(z.object({
    url: z.string().max(4096),
    display: z.string().max(64).optional(),
    language: z.string().max(32).optional(),
    format: z.string().max(16).optional(),
  })).max(64).optional(),
})

export function createNhdapiProvider(http: ProviderHttp, now = Date.now) {
  return adapter('nhdapi', async (input, signal) => {
    const { ref } = input
    const path = ref.kind === 'movie' ? `/movie/${ref.id}` : `/tv/${ref.id}/${ref.season}/${ref.episode}`
    const expectedPath = `/api${path}`
    const pageUrl = `${origin}${path}`
    const page = await document(http, pageUrl, signal)
    const pathMatch = page.text.match(/var API_PATH = "([^"]+)"/)
    if (!pathMatch) throw new ProviderFailure('malformed')
    const apiPath = pathMatch[1]
    if (apiPath !== expectedPath) throw new ProviderFailure('malformed')
    const keyMatch = page.text.match(/var API_KEY = "([^"]*)"/)
    const apiKey = keyMatch ? keyMatch[1] : ''

    const buildUrl = (exclude?: string) => {
      let u = `${origin}${apiPath}${apiPath.includes('?') ? '&' : '?'}_ts=${now()}`
      if (apiKey) u += `&key=${encodeURIComponent(apiKey)}`
      if (exclude) u += `&exclude=${encodeURIComponent(exclude)}`
      return u
    }

    let apiDoc = await document(http, buildUrl(), signal)
    let data = apiSchema.parse(JSON.parse(apiDoc.text))
    if (!data.success && data.provider) {
      apiDoc = await document(http, buildUrl(data.provider), signal)
      data = apiSchema.parse(JSON.parse(apiDoc.text))
    }
    if (!data.success) throw new ProviderFailure('empty')

    const mediaUrl = data.m3u8 || data.playUrl
    if (!mediaUrl) throw new ProviderFailure('empty')

    const sources: ProviderSource[] = []
    const baseType = mediaType(mediaUrl) || 'hls'
    sources.push({
      key: 'original',
      url: mediaUrl,
      type: baseType,
      expiresAt: accessDeadline(mediaUrl, now()),
      language: 'original',
      headers: {},
      subtitles: [],
    })

    if (data.audioTracks) {
      for (let i = 0; i < data.audioTracks.length; i++) {
        const track = data.audioTracks[i]
        if (!track) continue
        const trackType = mediaType(track.url) || 'hls'
        sources.push({
          key: `dub-${i}`,
          url: track.url,
          type: trackType,
          expiresAt: accessDeadline(track.url, now()),
          language: track.language || 'dub',
          headers: {},
          subtitles: [],
        })
      }
    }

    const verified = await verifiedPlaybackSources(http, sources, signal)
    if (!verified.length) throw new ProviderFailure('empty')

    let rawSubs = data.subtitles
    if (!rawSubs || rawSubs.length === 0) {
      try {
        const subsUrl = `${origin}/api/subtitles?id=${ref.id}`
        const subsDoc = await document(http, subsUrl, signal)
        const parsedSubs = subsSchema.parse(JSON.parse(subsDoc.text))
        rawSubs = parsedSubs.subtitles
      } catch {
        // keyless subtitles failover/missing
      }
    }

    if (rawSubs && rawSubs.length > 0) {
      const formattedSubs = rawSubs.map((s, idx) => ({
        id: `nhd-sub-${idx}`,
        label: s.display || s.language || `Subtitle ${idx + 1}`,
        language: (s.language || s.display || 'und').toLowerCase().slice(0, 10),
        url: s.url,
        format: (s.format || 'vtt') as 'vtt' | 'srt',
      }))
      for (const s of verified) {
        s.subtitles = formattedSubs
      }
    }

    return verified
  })
}
