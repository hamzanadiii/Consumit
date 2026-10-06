import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { sourceAccess, adapter, document, mediaType, parseSkipSegments, ProviderFailure, type ProviderHttp } from './http.ts'
import { decipherPayload } from './vidnest.ts'

const sourceSchema = z.object({ url: z.string().max(4096).optional(), file: z.string().max(4096).optional() })
const trackSchema = z.object({
  url: z.string().max(4096).optional(), file: z.string().max(4096).optional(),
  label: z.string().max(64).optional(), lang: z.string().max(32).optional(), srclang: z.string().max(32).optional(),
  kind: z.string().max(32).optional(),
})
const payloadSchema = z.object({
  sources: z.array(sourceSchema).max(32).optional(), multiSrc: z.array(sourceSchema).max(32).optional(),
  subtitles: z.array(trackSchema).max(32).optional(), tracks: z.array(trackSchema).max(32).optional(),
  intro: z.unknown().optional(), outro: z.unknown().optional(),
})
const envelopeSchema = z.object({ encrypted: z.boolean().optional(), data: z.string().max(1_000_000).optional() })
const megaSchema = z.object({ status: z.string().max(32), source: z.string().max(4096).optional(), tracks: z.array(trackSchema).max(32).optional() })

function subtitles(tracks: z.infer<typeof trackSchema>[], id: string): ProviderSource['subtitles'] {
  return tracks.filter(track => !track.kind || ['captions', 'subtitles'].includes(track.kind)).flatMap((track, index) => {
    const url = track.url ?? track.file
    if (!url?.startsWith('https://')) return []
    return [{ id: `${id}-sub-${index}`, url, label: track.label ?? track.lang ?? 'Subtitle',
      language: track.srclang ?? track.lang ?? 'und', format: /\.srt(?:[?#]|$)/i.test(url) ? 'srt' as const : 'vtt' as const }]
  })
}

/** Exact AniList/episode routes from PROVE. 9Anime owns only hd-2;
 * AniWave owns aniwave_hls. Neither route substitutes a different audio. */
export function createAnimeRelayProvider(http: ProviderHttp, id: 'megavid' | '9anime' | 'aniwave', now = Date.now) {
  return Object.assign(adapter(id, async (input, signal) => {
    const { ref } = input
    if (ref.kind !== 'anime' || !ref.episode) throw new ProviderFailure('empty')
    const audio = input.audioLanguage === 'en' ? 'dub' : 'sub'
    let urls: string[], tracks: z.infer<typeof trackSchema>[], skips: ReturnType<typeof parseSkipSegments> = []
    let headers: Record<string, string>
    if (id === 'megavid') {
      const response = await document(http, `https://megavid.buzz/ani/${ref.id}/${ref.episode}/${audio}/source`, signal,
        { accept: 'application/json', referer: 'https://megavid.buzz/' })
      const payload = megaSchema.parse(JSON.parse(response.text))
      if (payload.status !== 'ok' || !payload.source) throw new ProviderFailure('empty')
      urls = [payload.source]; tracks = payload.tracks ?? []
      headers = { referer: 'https://megavid.buzz/', origin: 'https://megavid.buzz' }
    } else {
      const path = id === '9anime' ? `/hianime/anime/${ref.id}/${ref.episode}/${audio}/hd-2` : `/aniwave_hls/${ref.id}/${ref.episode}/${audio}`
      const response = await document(http, `https://new.vidnest.fun${path}`, signal,
        { accept: 'application/json', referer: 'https://vidnest.fun/' })
      const raw: unknown = JSON.parse(response.text)
      const envelope = envelopeSchema.parse(raw)
      const payload = payloadSchema.parse(envelope.encrypted && envelope.data ? decipherPayload(envelope.data) : raw)
      urls = [...payload.sources ?? [], ...payload.multiSrc ?? []].flatMap(source => source.url ?? source.file ?? [])
      tracks = payload.subtitles ?? payload.tracks ?? []
      skips = parseSkipSegments(payload)
      const origin = id === '9anime' ? 'https://megaplay.buzz' : 'https://play.echovideo.ru'
      headers = { referer: `${origin}/`, origin }
    }
    const seen = new Set<string>()
    return urls.filter(url => url.startsWith('https://') && !seen.has(url) && !!seen.add(url)).slice(0, 32).map((url, index) => ({
      key: `${id}:${audio}:${index}`, url, type: mediaType(url) ?? 'hls', headers,
      language: audio === 'dub' ? 'en' : 'original', qualityHint: 'Auto', ...sourceAccess(url, now()),
      subtitles: subtitles(tracks, id), skipSegments: skips,
    }))
  }), { audioLanguages: ['ja', 'en'] })
}
