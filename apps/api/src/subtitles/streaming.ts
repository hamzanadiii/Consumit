import { createHash } from 'node:crypto'
import { allowedMediaUrl, assertHlsManifest, parseHlsAttributeList, parseHlsReferences, validatedSources, type ProviderRegistration } from '@consumit/provider-sdk'
import type { PlaybackRef } from '@consumit/contracts'
import { acquireProviderBudget } from '../playback/provider-budget.ts'
import { collectSubtitleCandidates } from '../playback/resolver.ts'
import { createProviderHttp } from '../playback/provider-http.ts'
import { downloadStreamingSubtitle } from './hls.ts'
import type { PlaybackStore } from '../playback/state.ts'
import type { RawSubtitle, SubtitleQuery, SubtitleSearchProvider } from './types.ts'

function canonicalRef(query: SubtitleQuery): PlaybackRef | null {
  if (query.type === 'anime') return query.anilistId && query.absoluteEpisode
    ? { kind: 'anime', id: query.anilistId, episode: query.absoluteEpisode } : null
  if (!query.tmdbId) return null
  return query.type === 'movie' ? { kind: 'movie', id: query.tmdbId }
    : { kind: 'series', id: query.tmdbId, season: query.season ?? 1, episode: query.episode ?? 1 }
}

/** Subtitle-only inspection of configured adapters. No video selection or health writes. */
export function createStreamingSubtitleProviders(providers: readonly ProviderRegistration[], region: string, store: PlaybackStore): SubtitleSearchProvider[] {
  let active = 0
  const waiters: (() => void)[] = []
  const release = () => { active--; waiters.shift()?.() }
  async function admit(signal: AbortSignal) {
    signal.throwIfAborted()
    if (active >= 6) await new Promise<void>((resolve, reject) => {
      const ready = () => { active++; signal.removeEventListener('abort', abort); resolve() }
      const abort = () => { const index = waiters.indexOf(ready); if (index >= 0) waiters.splice(index, 1); reject(signal.reason) }
      waiters.push(ready)
      signal.addEventListener('abort', abort, { once: true })
    })
    else active++
    if (signal.aborted) { release(); signal.throwIfAborted() }
    return release
  }
  return providers.map(registration => {
    const id = `stream-${registration.adapter.id}`.slice(0, 53) + '-' + createHash('sha256').update(registration.adapter.id).digest('hex').slice(0, 8)
    const enabled = () => registration.enabled && registration.deliveryMode !== 'embed' && registration.approvedRegions.includes(region)
    const authority = () => createHash('sha256').update(JSON.stringify([
      registration.enabled, registration.role, registration.deliveryMode, registration.approvedRegions,
      registration.mediaKinds, registration.mediaHosts, registration.mediaHostPatterns?.map(pattern => pattern.source), registration.workerConfig,
    ])).digest('hex')
    const accepts = (raw: RawSubtitle) => enabled() && raw.authority === authority()
      && Number.isFinite(Date.parse(raw.expiresAt ?? '')) && Date.parse(raw.expiresAt!) > Date.now() + 5000
      && allowedMediaUrl(raw.url, registration.mediaHosts, registration.mediaHostPatterns)
    const cache = new Map<string, { until: number; tracks: RawSubtitle[] }>()
    return {
      discoveryOnly: true,
      id, name: registration.adapter.separateAudio?.label ?? registration.adapter.id,
      // Same host gate the video sources ride: engine-side checks reject
      // subtitle URLs outside the registration before any fetch is issued.
      fileHosts: registration.mediaHosts,
      fileHostPatterns: registration.mediaHostPatterns,
      accepts,
      async download(raw, signal) {
        if (!accepts(raw)) throw new Error('Subtitle provider is no longer available.')
        const bytes = await downloadStreamingSubtitle(raw, registration, signal)
        if (!accepts(raw)) throw new Error('Subtitle provider is no longer available.')
        return bytes
      },
      supports(query) { const ref = canonicalRef(query); return enabled() && Boolean(ref && registration.mediaKinds.includes(ref.kind)) },
      async search(query, signal) {
        const ref = canonicalRef(query)
        if (!ref || !enabled()) return []
        const key = JSON.stringify([ref, authority()]), cached = cache.get(key)
        if (cached && cached.until > Date.now() && cached.tracks.every(accepts)) return cached.tracks
        const releaseLane = await admit(signal)
        let releaseBudget: (() => Promise<void>) | null = null
        try {
          releaseBudget = await acquireProviderBudget(registration, region, store)
          if (!releaseBudget) throw new Error('Subtitle provider is busy.')
          if (!enabled()) return []
          const scope = authority()
          // Preserve canonical identity; adapter-specific numbering stays in resolve.
          const result = await registration.adapter.resolve({ ref, region, audioLanguage: ref.kind === 'anime' ? 'sub' : 'original' }, signal)
          const sources = validatedSources(result, registration).filter(source => source.type !== 'iframe')
          if (scope !== authority() || !enabled()) return []
          const seen = new Set<string>()
          const tracks: RawSubtitle[] = []
          const candidates = collectSubtitleCandidates(sources, registration).map(candidate => ({ ...candidate, hls: false, expiresAt: Math.min(...sources.filter(source => source.subtitles.some(entry => entry.url === candidate.track.url)).map(source => Date.parse(source.expiresAt))) }))
          const http = createProviderHttp(registration.mediaHosts, undefined, false, registration.mediaHostPatterns)
          const inspectionSignal = AbortSignal.any([signal, AbortSignal.timeout(1500)])
          // Inspect at most two representations; master parsing never fetches video bytes.
          for (const source of sources.filter(source => source.type === 'hls' && !source.segmentTransform).slice(0, 2)) {
            try {
              let url = source.url
              for (let depth = 0; depth < 2; depth++) {
                const headers = new URL(url).hostname === new URL(source.url).hostname ? source.headers : Object.fromEntries(Object.entries(source.headers).filter(([name]) => !/^(cookie|authorization)$/i.test(name)))
                const response = await http(url, headers, inspectionSignal)
                if (response.status !== 200 || !allowedMediaUrl(response.url, registration.mediaHosts, registration.mediaHostPatterns) || assertHlsManifest(response.text) !== 'master' || parseHlsReferences(response.text, response.url).some(url => !allowedMediaUrl(url, registration.mediaHosts, registration.mediaHostPatterns))) break
                let found = false
                for (const line of response.text.split(/\r?\n/).map(line => line.trim())) {
                  if (!line.startsWith('#EXT-X-MEDIA:')) continue
                  const attrs = Object.fromEntries(parseHlsAttributeList(line.slice(13)))
                  if (attrs.TYPE !== 'SUBTITLES' || !attrs.URI || !attrs.LANGUAGE) continue
                  const href = new URL(attrs.URI, response.url).href
                  if (!allowedMediaUrl(href, registration.mediaHosts, registration.mediaHostPatterns)) continue
                  candidates.push({ track: { id: 'manifest', url: href, language: attrs.LANGUAGE, label: attrs.NAME ?? attrs.LANGUAGE, format: 'vtt' }, hosts: registration.mediaHosts, headers: new URL(href).hostname === new URL(source.url).hostname ? source.headers : Object.fromEntries(Object.entries(source.headers).filter(([name]) => !/^(cookie|authorization)$/i.test(name))), hls: true, expiresAt: Date.parse(source.expiresAt) })
                  found = true
                }
                if (found) break
                const variant = response.text.split(/\r?\n/).map(line => line.trim()).find(line => line && !line.startsWith('#'))
                if (!variant) break
                url = new URL(variant, response.url).href
              }
            } catch { /* Declared files remain available if master inspection fails. */ }
          }
          for (const { track, headers, expiresAt, hls } of candidates) {
            let lang: string
            try { lang = Intl.getCanonicalLocales(track.language.replaceAll('_', '-'))[0]!.toLowerCase() } catch { continue }
            if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(lang) || lang.length > 32 || seen.has(track.url)) continue
            seen.add(track.url)
            tracks.push({ url: track.url, lang, label: track.label, provider: id, providerName: registration.adapter.separateAudio?.label ?? registration.adapter.id, format: hls ? 'vtt' : 'other', hls, headers, authority: scope, expiresAt: new Date(expiresAt).toISOString() })
            if (tracks.length >= 128) break
          }
          if (cache.size >= 64) cache.delete(cache.keys().next().value!)
          cache.set(key, { until: Math.min(Date.now() + (tracks.length ? 60000 : 10000), ...tracks.map(track => Date.parse(track.expiresAt!) - 5000)), tracks })
          return tracks
        } finally { try { await releaseBudget?.() } finally { releaseLane() } }
      },
    }
  })
}
