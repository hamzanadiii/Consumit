import { z } from 'zod'
import { allowedMediaUrl, isRelayMediaUrl, type ProviderSource } from '../index.ts'
import { assertHlsManifest, parseHlsReferenceEntries } from '../manifest.ts'
import { accessDeadline, adapter, document, parseSkipSegments, ProviderFailure, type ProviderHttp } from './http.ts'

// PROVE providers/anime/recloud.ts: AniList-native embed -> getSources ->
// signed browser-direct HLS. Never execute the page script or cross audio lanes.
const origin = 'https://cdn.4animo.xyz'
const hosts = ['cdn.4animo.xyz']
const servers = ['', '1', '2']
const fileSchema = z.object({ file: z.string().min(1).max(4096), audio: z.string().max(32).optional(), language: z.string().max(32).optional() })
const resultSchema = z.object({
  sources: z.array(fileSchema).max(16).optional(),
  link: fileSchema.optional(),
  file: z.string().min(1).max(4096).optional(),
  audio: z.string().max(32).optional(),
  tracks: z.array(z.object({ file: z.string().max(4096), label: z.string().max(128).optional(), kind: z.string().max(32).optional() })).max(64).optional(),
  intro: z.unknown().optional(), outro: z.unknown().optional(),
})

function directUrl(value: string, base = origin): string {
  const url = new URL(value, base).href
  if (!allowedMediaUrl(url, hosts) || isRelayMediaUrl(url)) throw new ProviderFailure('malformed')
  return url
}

function matchingAudio(value: string | undefined, dub: boolean): boolean {
  if (!value) return true // The requested embed lane supplies the variant.
  const language = value.trim().toLowerCase().split('-')[0]!
  return (dub ? ['en', 'eng', 'english', 'dub', 'dubbed'] : ['ja', 'jpn', 'japanese', 'original', 'sub', 'subbed']).includes(language)
}

/** Verify a bounded playlist chain and segment prefix without playback headers. */
async function verify(http: ProviderHttp, root: string, signal: AbortSignal) {
  let current = root
  for (let depth = 0; depth < 3; depth++) {
    const response = await document(http, current, signal, { accept: 'application/vnd.apple.mpegurl' })
    directUrl(response.url)
    const kind = assertHlsManifest(response.text)
    const refs = parseHlsReferenceEntries(response.text, response.url)
    if (!refs.length) throw new ProviderFailure('malformed')
    for (const ref of refs) directUrl(ref.url)
    if (kind === 'master') {
      const variant = response.text.split(/\r?\n/).map(line => line.trim()).find(line => line && !line.startsWith('#'))
      if (!variant) throw new ProviderFailure('malformed')
      current = directUrl(variant, response.url)
      continue
    }
    const segment = refs.find(ref => ref.media)
    if (!segment) throw new ProviderFailure('empty')
    const live = await document(http, segment.url, signal, { range: 'bytes=0-16383' }, { readPrefixBytes: 16_384 })
    directUrl(live.url)
    if ((live.bytes?.length ?? Buffer.byteLength(live.text)) < 1000 || /(?:text\/html|application\/json)/i.test(live.headers?.get('content-type') ?? '')) throw new ProviderFailure('empty')
    return
  }
  throw new ProviderFailure('malformed')
}

export function createRecloudProvider(http: ProviderHttp, now = Date.now) {
  return Object.assign(adapter('recloud', async ({ ref, audioLanguage }, signal) => {
    const audio = audioLanguage.toLowerCase().split('-')[0]
    if (ref.kind !== 'anime' || !Number.isInteger(ref.episode) || !ref.episode || !['ja', 'en'].includes(audio!)) throw new ProviderFailure('empty')
    const dub = audio === 'en', lane = dub ? 'dub' : 'sub'
    let failure: unknown = new ProviderFailure('empty')
    for (const server of servers) {
      signal.throwIfAborted()
      try {
        const scoped = AbortSignal.any([signal, AbortSignal.timeout(8_000)])
        const embed = `${origin}/embed${server ? `/${server}` : ''}/ani/${ref.id}/${ref.episode}/${lane}?k=1`
        const page = await document(http, embed, scoped, { referer: `${origin}/`, accept: 'text/html' })
        const path = page.text.match(/sourcesUrl\s*=\s*['"]([^'"]{1,4096})['"]/)?.[1]
        if (!path) throw new ProviderFailure('empty')
        const endpoint = directUrl(path)
        if (new URL(endpoint).pathname !== '/stream/getSources') throw new ProviderFailure('malformed')
        const response = await document(http, endpoint, scoped, { referer: embed, origin, accept: 'application/json' })
        const data = resultSchema.parse(JSON.parse(response.text))
        if (!matchingAudio(data.audio, dub)) throw new ProviderFailure('empty')
        const files = data.sources ?? (data.link ? [data.link] : data.file ? [{ file: data.file }] : [])
        for (const item of files) {
          if (!matchingAudio(item.audio ?? item.language, dub)) continue
          const url = directUrl(item.file)
          await verify(http, url, scoped)
          const subtitles: ProviderSource['subtitles'] = []
          for (const track of (data.tracks ?? []).slice(0, 8)) {
            if (track.kind && !['captions', 'subtitles'].includes(track.kind)) continue
            try {
              const label = (track.label || 'Subtitle').slice(0, 64)
              const languages: Record<string, string> = { english: 'en', japanese: 'ja', spanish: 'es', portuguese: 'pt', french: 'fr', arabic: 'ar' }
              const language = languages[label.toLowerCase().split(/[ (]/)[0]!] ?? 'und'
              subtitles.push({ id: `recloud-${lane}-${subtitles.length}`, url: directUrl(track.file), label, language, format: 'vtt' })
            } catch { /* Captions cannot discard a playable source. */ }
          }
          const skipSegments = parseSkipSegments(data)
          return [{ key: `${server || 'hd'}:${lane}:${ref.episode}`, url, type: 'hls' as const,
            language: dub ? 'en' : 'original', expiresAt: accessDeadline(url, now()), headers: {}, qualityHint: 'auto', subtitles,
            ...(skipSegments.length ? { skipSegments } : {}), }]
        }
        throw new ProviderFailure('empty')
      } catch (error) { failure = error }
    }
    throw failure
  }), { audioLanguages: ['ja', 'en'] as const })
}
