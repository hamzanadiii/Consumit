import type { HlsConfig, LoaderCallbacks, LoaderConfiguration, LoaderContext } from 'hls.js'
import { isSafeMediaUrl } from './media-source'

type Playlist = { text: string; signature: string; refs: { url: string; playlist: boolean; key: boolean }[] }
type Route = { path: number[]; asset?: number }
type Lease = () => { src: string } | undefined
const MAX_DOCUMENT = 2 * 1024 * 1024

/** Compare the complete timeline/rendition metadata before reusing a buffer.
 * Only capability URLs may change: durations, sequences, codec/rendition tags,
 * key IVs and byte ranges must match. Live/LL playlists use normal recovery.
 */
export function readLeasePlaylist(text: string, base: string): Playlist {
  if (text.length > MAX_DOCUMENT || !text.trimStart().startsWith('#EXTM3U')) throw new Error('Invalid relay playlist')
  if (/#EXT-X-(?:DEFINE|CONTENT-STEERING|PART|PRELOAD-HINT|RENDITION-REPORT)[:\s]/.test(text)) throw new Error('Unsupported relay renewal')
  const refs: Playlist['refs'] = []
  const signature: string[] = []
  const canonical: string[] = []
  let variant = false
  const reference = (uri: string, playlist: boolean, key = false) => {
    const url = new URL(uri, base).href
    if (!isSafeMediaUrl(url) || refs.length >= 2000) throw new Error('Invalid relay reference')
    refs.push({ url, playlist, key })
    return url
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || (line.startsWith('#') && !line.startsWith('#EXT'))) continue
    if (!line.startsWith('#')) {
      canonical.push(reference(line, variant)); signature.push('@URI'); variant = false
    } else {
      const playlist = /^#EXT-X-(?:MEDIA|I-FRAME-STREAM-INF):/.test(line)
      const key = /^#EXT-X-(?:SESSION-)?KEY:/.test(line)
      if (key && !/METHOD=(?:AES-128|NONE)(?:,|$)/.test(line)) throw new Error('Unsupported relay encryption')
      const normalized = line.replace(/\bURI="([^"]+)"/g, (_match, uri: string) => `URI="${reference(uri, playlist, key)}"`)
      canonical.push(normalized)
      signature.push(normalized.replace(/\bURI="([^"]+)"/g, 'URI="@URI"'))
      if (line.startsWith('#EXT-X-STREAM-INF:')) variant = true
    }
  }
  if (!refs.length || (!refs.some(ref => ref.playlist) && !signature.includes('#EXT-X-ENDLIST'))) throw new Error('Relay renewal requires VOD')
  return { text: canonical.join('\n') + '\n', signature: signature.join('\n'), refs }
}

/** Old HLS fragment metadata retains its original URLs. Resolve those stable
 * addresses against the latest verified playlist graph, without loadSource,
 * replacing MediaSource, clearing buffered media, or seeking the element.
 */
export class RelayLeaseRouter {
  private routes = new Map<string, Route>()
  private baseline = new Map<string, Playlist>()
  private generation = ''
  private documents = new Map<string, Promise<Playlist>>()
  private abort = new AbortController()
  private disabled = false
  private keys = new Map<string, Uint8Array>()
  constructor(private root: string, private current: Lease, private read = readControlPlaylist,
    private readKey = (url: string, signal: AbortSignal) => readControlBytes(url, signal, 16)) {
    this.routes.set(root, { path: [] })
  }
  destroy() { this.abort.abort(); this.routes.clear(); this.baseline.clear(); this.documents.clear(); this.keys.clear() }
  observeAsset(url: string, data: unknown) {
    const route = this.routes.get(url)
    if (!route || route.asset === undefined || !(data instanceof ArrayBuffer) || data.byteLength !== 16) return
    const ref = this.baseline.get(route.path.join('.'))?.refs[route.asset]
    if (ref?.key) this.keys.set(url, new Uint8Array(data.slice(0)))
  }
  observe(url: string, text: string, responseUrl = url): string {
    const route = this.routes.get(url)
    if (!route || route.asset !== undefined) return text
    const key = route.path.join('.')
    const prior = this.baseline.get(key)
    let parsed: Playlist
    try { parsed = readLeasePlaylist(text, responseUrl) }
    catch (error) {
      if (prior) throw error
      // Unsupported initial/live playlists retain the existing recovery path.
      this.disabled = true
      return text
    }
    if (prior) {
      if (prior.signature !== parsed.signature) throw new Error('Relay recording changed')
      // Keep the engine's fragment addresses stable across any number of leases.
      return prior.text
    }
    if (this.baseline.size >= 8 || route.path.length > 5) throw new Error('Relay playlist limit')
    this.baseline.set(key, parsed)
    parsed.refs.forEach((ref, index) => {
      const next = ref.playlist ? { path: [...route.path, index] } : { path: route.path, asset: index }
      const old = this.routes.get(ref.url)
      // Repeated keys/maps/byte-range URLs within one timeline are legitimate.
      if (!old) this.routes.set(ref.url, next)
    })
    return parsed.text
  }
  async resolve(url: string): Promise<string> {
    const next = this.current()?.src
    const route = this.routes.get(url)
    if (this.disabled || !route || !next || next === this.root) return url
    if (!isSafeMediaUrl(next)) throw new Error('Invalid renewed relay source')
    if (next !== this.generation) { this.generation = next; this.documents = new Map() }
    // Capture the generation; a concurrent later renewal cannot mix documents.
    const documents = this.documents
    const verifiedKeys = new Map<string, Promise<void>>()
    const document = async (path: number[]): Promise<Playlist> => {
      const key = path.join('.')
      const existing = documents.get(key)
      if (existing) return existing
      if (documents.size >= 8 || path.length > 5) throw new Error('Relay playlist limit')
      const pending = (async () => {
        let target = next
        if (path.length) {
          const parent = await document(path.slice(0, -1))
          const ref = parent.refs[path.at(-1)!]
          if (!ref?.playlist) throw new Error('Relay rendition changed')
          target = ref.url
        }
        const parsed = readLeasePlaylist(await this.read(target, this.abort.signal), target)
        const prior = this.baseline.get(key)
        if (prior && prior.signature !== parsed.signature) throw new Error('Relay recording changed')
        // hls.js caches AES keys under the original URI. A renewed recording
        // must still decrypt with those bytes before any fresh segment is used.
        if (prior) for (let index = 0; index < prior.refs.length; index++) {
          const ref = prior.refs[index]!
          if (!ref.key) continue
          const expected = this.keys.get(ref.url)
          if (!expected) throw new Error('Relay key unavailable')
          const targetKey = parsed.refs[index]!.url
          let verified = verifiedKeys.get(targetKey)
          if (!verified) {
            if (verifiedKeys.size >= 64) throw new Error('Relay key limit')
            verified = this.readKey(targetKey, this.abort.signal).then(actual => {
              if (actual.length !== expected.length || actual.some((byte, i) => byte !== expected[i])) throw new Error('Relay key changed')
            })
            verifiedKeys.set(targetKey, verified)
          }
          await verified
        }
        return parsed
      })()
      documents.set(key, pending)
      // Transient playlist failures may retry; successful documents stay cached.
      void pending.catch(() => { if (documents.get(key) === pending) documents.delete(key) })
      return pending
    }
    if (route.asset !== undefined) {
      const parsed = await document(route.path)
      const ref = parsed.refs[route.asset]
      if (!ref || ref.playlist) throw new Error('Relay asset changed')
      return ref.url
    }
    // Validate the root/parent before loading a previously unselected rendition.
    if (!route.path.length) return next
    const parent = await document(route.path.slice(0, -1))
    const ref = parent.refs[route.path.at(-1)!]
    if (!ref?.playlist) throw new Error('Relay rendition changed')
    return ref.url
  }
}

async function readControlPlaylist(url: string, signal: AbortSignal): Promise<string> {
  return new TextDecoder().decode(await readControlBytes(url, signal, MAX_DOCUMENT))
}

async function readControlBytes(url: string, signal: AbortSignal, limit: number): Promise<Uint8Array> {
  const response = await fetch(url, { credentials: 'omit', cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]) })
  if (!response.ok || !response.body) throw new Error('Relay renewal unavailable')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []; let bytes = 0
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > limit) throw new Error('Relay control limit')
      chunks.push(chunk.value)
    }
    const value = new Uint8Array(bytes)
    let offset = 0
    for (const chunk of chunks) { value.set(chunk, offset); offset += chunk.length }
    return value
  } finally { await reader.cancel().catch(() => undefined) }
}

/** Wrap the existing XHR byte loader; async work is control documents only. */
export function relayLeaseLoader(Base: HlsConfig['loader'], router: RelayLeaseRouter): HlsConfig['loader'] {
  return class extends Base {
    private cancelled = false
    override abort() { this.cancelled = true; super.abort() }
    override destroy() { this.cancelled = true; super.destroy() }
    override load(context: LoaderContext, config: LoaderConfiguration, callbacks: LoaderCallbacks<LoaderContext>) {
      this.cancelled = false
      this.context = context
      void router.resolve(context.url).then(url => {
        if (this.cancelled) return
        super.load({ ...context, url }, config, {
          ...callbacks,
          onSuccess: (response, stats, _context, details) => {
            if (this.cancelled) return
            try {
              router.observeAsset(context.url, response.data)
              const data = context.responseType === 'text' && typeof response.data === 'string'
                ? router.observe(context.url, response.data, url) : response.data
              callbacks.onSuccess({ ...response, url: context.url, ...(data === undefined ? {} : { data }) }, stats, context, details)
            } catch { callbacks.onError({ code: 0, text: 'Relay renewal incompatible' }, context, details, stats) }
          },
          onError: (error, _context, details, stats) => callbacks.onError(error, context, details, stats),
          onTimeout: (stats, _context, details) => callbacks.onTimeout(stats, context, details),
        })
      }).catch(() => {
        if (!this.cancelled) callbacks.onError({ code: 0, text: 'Relay renewal unavailable' }, context, null, this.stats)
      })
    }
  }
}
