import { createHash } from 'node:crypto'
import { allowedMediaUrl, assertHlsManifest, isRelayMediaUrl, parseHlsAttributeList, parseHlsReferences, sumMediaPlaylistDuration, validatedSources, type ProviderHttp, type ProviderRegistration } from '@consumit/provider-sdk'
import type { ResolvePlaybackRequest, SeparateAudioTrack } from '@consumit/contracts'
import { ApiError } from '../http/errors.ts'
import { createProviderHttp } from './provider-http.ts'

type Candidate = SeparateAudioTrack & { src: string; expiresAt: string; registration: ProviderRegistration; headers: Record<string, string> }
/** Explicit, bounded role-opted discovery (ADR 0004). Discovery never changes the video session. */
export function createSeparateAudio(providers: readonly ProviderRegistration[], region: string, injectedHttp?: ProviderHttp, appOrigin?: string) {
  const cache = new Map<string, { until: number; tracks: Candidate[] }>()
  const budget = new Map<string, { active: number; count: number; since: number }>()
  const eligible = () => providers.filter(p => p.enabled && (p.role === 'audio' || p.role === 'both') && p.approvedRegions.includes(region))
  const safe = (url: string, p: ProviderRegistration) => allowedMediaUrl(url, p.mediaHosts, p.mediaHostPatterns) && !isRelayMediaUrl(url)
  const httpFor = (p: ProviderRegistration) => injectedHttp ?? createProviderHttp(p.mediaHosts)
  async function audioMaster(src: string, headers: Record<string, string>, p: ProviderRegistration, signal: AbortSignal) {
    let current = src
    // Some movie URLs are a wrapper master. Follow one variant at each
    // level, checking every reference before fetching, with a strict cap.
    for (let depth = 0; depth < 3; depth++) {
      const response = await httpFor(p)(current, headers, signal)
      if (response.status !== 200 || !safe(response.url, p) || assertHlsManifest(response.text) !== 'master') return null
      if (parseHlsReferences(response.text, response.url).some(url => !safe(url, p))) return null
      const lines = response.text.split(/\r?\n/).map(line => line.trim())
      if (lines.some(line => line.startsWith('#EXT-X-MEDIA:') && Object.fromEntries(parseHlsAttributeList(line.slice('#EXT-X-MEDIA:'.length))).TYPE === 'AUDIO')) return response
      const variant = lines.find(line => line && !line.startsWith('#'))
      if (!variant) return null
      current = new URL(variant, response.url).href
    }
    return null
  }
  const keyFor = (input: ResolvePlaybackRequest) => JSON.stringify([input.ref, eligible().map(p => [p.adapter.id, p.role, p.mediaHosts])])
  async function discover(input: ResolvePlaybackRequest, signal: AbortSignal): Promise<Candidate[]> {
    const key = keyFor(input), cached = cache.get(key)
    if (cached && cached.until > Date.now()) return cached.tracks
    const tracks: Candidate[] = []
    // Every enabled Audio source or Both row the operator opted in; dedicated audio roles sort first.
    const rows = eligible().filter(p => p.mediaKinds.includes(input.ref.kind)).sort((a, b) => Number(b.role === 'audio') - Number(a.role === 'audio'))
    let attempted = 0
    for (const p of rows) {
      const b = budget.get(p.adapter.id) ?? { active: 0, count: 0, since: Date.now() }
      if (b.since + 60000 <= Date.now()) { b.count = 0; b.since = Date.now() }
      budget.set(p.adapter.id, b)
      // One busy row must not hide the other opted-in rows' tracks.
      if (b.active >= p.concurrency || b.count >= p.requestsPerMinute) continue
      b.active++; b.count++
      attempted++
      try {
        const bounded = AbortSignal.any([signal, AbortSignal.timeout(12000)])
        const result = await p.adapter.resolve({ ref: input.ref, region, audioLanguage: input.audioLanguage }, bounded)
        const source = validatedSources(result, p).find(s => s.type === 'hls')
        if (!source) continue
        // Inspect the same representation delivered to our browser origin.
        // Some CDNs otherwise return a single-language wrapper instead.
        const headers = { ...source.headers, ...(appOrigin ? { origin: appOrigin } : {}) }
        const master = await audioMaster(source.url, headers, p, bounded)
        if (!master) continue
        for (const line of master.text.split(/\r?\n/).map(l => l.trim()).filter(l => l.startsWith('#EXT-X-MEDIA:'))) {
          const a = Object.fromEntries(parseHlsAttributeList(line.slice('#EXT-X-MEDIA:'.length)))
          if (a.TYPE !== 'AUDIO' || !a.URI || !a.LANGUAGE || !a.NAME) continue
          const src = new URL(a.URI, master.url).href
          if (!safe(src, p)) continue
          let language: string
          try { language = Intl.getCanonicalLocales(a.LANGUAGE)[0]! } catch { continue }
          if (!/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(language)) continue
          tracks.push({ id: createHash('sha256').update(JSON.stringify([input.ref, p.adapter.id, a['GROUP-ID'], a.NAME, language])).digest('hex').slice(0, 32), label: a.NAME.slice(0, 128), language, provider: p.adapter.separateAudio?.label ?? p.adapter.id, src, expiresAt: source.expiresAt, registration: p, headers })
          if (tracks.length >= 40) break
        }
      } finally { b.active-- }
    }
    // Nothing was even attempted: every opted-in row is at its own budget.
    if (rows.length && !attempted) throw new ApiError('CONFLICT', 'Audio discovery is busy. Try again shortly.', { retryable: true })
    if (cache.size >= 128) cache.delete(cache.keys().next().value!)
    const expiry = Math.min(Date.now() + (tracks.length ? 120000 : 15000), ...tracks.map(t => Date.parse(t.expiresAt) - 30000))
    cache.set(key, { until: expiry, tracks })
    return tracks
  }
  return {
    async list(input: ResolvePlaybackRequest, signal: AbortSignal): Promise<SeparateAudioTrack[]> {
      return (await discover(input, signal)).map(({ id, label, language, provider }) => ({ id, label, language, provider }))
    },
    async prepare(input: ResolvePlaybackRequest, id: string, signal: AbortSignal) {
      const track = (await discover(input, signal)).find(t => t.id === id)
      if (!track || !eligible().includes(track.registration)) throw new ApiError('NOT_FOUND', 'This audio track is no longer available. Refresh the audio list.')
      const response = await httpFor(track.registration)(track.src, track.headers, AbortSignal.any([signal, AbortSignal.timeout(8000)]))
      if (response.status !== 200 || !safe(response.url, track.registration) || assertHlsManifest(response.text) !== 'media'
        || !response.text.includes('#EXT-X-ENDLIST') || parseHlsReferences(response.text, response.url).some(url => !safe(url, track.registration))) {
        throw new ApiError('PLAYBACK_UNAVAILABLE', 'This audio track could not be prepared.', { retryable: true })
      }
      const duration = sumMediaPlaylistDuration(response.text)
      if (!duration || duration > 86400) throw new ApiError('PLAYBACK_UNAVAILABLE', 'This audio timeline is unavailable.')
      return { id: track.id, label: track.label, language: track.language, provider: track.provider, src: response.url, duration, expiresAt: track.expiresAt }
    },
  }
}
