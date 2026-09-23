import { Buffer } from 'node:buffer'
import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, mediaType, ProviderFailure, type ProviderHttp } from './http.ts'

const origin = 'https://new.vidnest.fun'
const subOrigin = 'https://sub.vdrk.site'
const CIPHER_ALPHABET = 'RB0fpH8ZEyVLkv7c2i6MAJ5u3IKFDxlS1NTsnGaqmXYdUrtzjwObCgQP94hoeW+/='
const STANDARD_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='

export function decipherPayload(data: string): any {
  const map: Record<string, string> = {}
  for (let i = 0; i < CIPHER_ALPHABET.length; i++) {
    const from = CIPHER_ALPHABET[i]
    const to = STANDARD_ALPHABET[i]
    if (from === undefined || to === undefined) continue
    map[from] = to
  }
  const standardB64 = data.split('').map((c) => map[c] ?? c).join('')
  const jsonStr = Buffer.from(standardB64, 'base64').toString('utf8')
  return JSON.parse(jsonStr)
}

const SERVERS = [
  { name: 'Catflix', path: 'yflix' },
  { name: 'Filxer', path: 'rogflix' },
  { name: 'Gama', path: 'vidzee' },
  { name: 'Zeta', path: 'nextgencloudfabric' },
  { name: 'Ophim', path: 'klikxxi' },
  { name: 'Beta', path: 'vidxyz' },
  { name: 'Sigma', path: 'hollymoviehd' },
  { name: 'Lamda', path: 'allmovies' },
  { name: 'Delta', path: 'allmovies' },
]

export type VidnestScope = { id?: string; servers?: string[] }

export function createVidnestProvider(http: ProviderHttp, now = Date.now, scope: VidnestScope = {}) {
  const { id = 'vidnest', servers } = scope
  const wanted = servers?.map((server) => server.toLowerCase())
  return Object.assign(adapter('vidnest', async (input, signal) => {
    const { ref } = input
    // Movies + series only: an anime ref must never resolve by numeric-id
    // coincidence (AniList ids are not TMDB ids).
    if (ref.kind !== 'movie' && ref.kind !== 'series') throw new ProviderFailure('empty')
    const isTv = ref.kind === 'series'
    const pathSuffix = isTv ? `tv/${ref.id}/${ref.season}/${ref.episode}` : `movie/${ref.id}`

    const results = await Promise.all(
      SERVERS.filter((server) => !wanted || wanted.includes(server.name.toLowerCase())).map(async (server) => {
        const url = `${origin}/${server.path}/${pathSuffix}`
        try {
          const res = await document(http, url, signal, { referer: `${origin}/`, accept: 'application/json' })
          const json = JSON.parse(res.text)
          if (!json?.encrypted || !json?.data) return { server, data: null }
          const decoded = decipherPayload(json.data)
          return { server, data: decoded }
        } catch {
          return { server, data: null }
        }
      }),
    )

    // Subtitles
    let subtitles: Array<{ id: string; label: string; language: string; url: string; format: 'vtt' | 'srt' }> = []
    try {
      const subUrl = `${subOrigin}/v2/${pathSuffix}`
      const subRes = await document(http, subUrl, signal)
      const subList = JSON.parse(subRes.text)
      if (Array.isArray(subList)) {
        subtitles = subList
          .filter((s: any) => s?.file)
          .map((s: any, idx: number) => ({
            id: `vidnest-sub-${idx}`,
            label: s.label || `Subtitle ${idx + 1}`,
            language: (s.label || 'und').toLowerCase().slice(0, 10),
            url: s.file,
            format: (s.file.endsWith('.srt') ? 'srt' : 'vtt') as 'vtt' | 'srt',
          }))
      }
    } catch {
      // ignore
    }

    const sources: ProviderSource[] = []
    const seen = new Set<string>()

    for (const { server, data } of results) {
      if (!data) continue
      const candidates: Array<{ url: string; quality?: string; language?: string }> = []
      if (data.url) {
        candidates.push({ url: data.url, quality: data.quality })
      }
      if (Array.isArray(data.streams)) {
        for (const str of data.streams) {
          if (str?.url) candidates.push(str)
        }
      }
      if (Array.isArray(data.sources)) {
        for (const str of data.sources) {
          if (str?.url) candidates.push(str)
        }
      }

      for (const c of candidates) {
        if (!c.url || seen.has(c.url)) continue
        seen.add(c.url)
        const type = c.url.endsWith('.mp4') ? 'native' : (mediaType(c.url) || 'hls')
        const qualityHint = c.quality || c.language || 'Auto'

        sources.push({
          key: `vidnest:${server.name.toLowerCase()}:${sources.length}`,
          url: c.url,
          type,
          qualityHint,
          expiresAt: accessDeadline(c.url, now()),
          language: c.language || 'original',
          headers: { referer: `${origin}/` },
          subtitles,
        })
      }
    }

    if (!sources.length) throw new ProviderFailure('empty')
    return sources
  }), { id })
}
