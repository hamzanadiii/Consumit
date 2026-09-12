import { allowedMediaUrl } from '@consumit/provider-sdk'
import { parseHlsReferenceEntries } from './hls.ts'
import type { DeliveryEngine, DeliveryProbeTarget, DeliveryResourceKind } from './delivery.ts'
import type { MediaTransport } from './transport.ts'

/**
 * Canary target collector (ADR-0002, Phase 1 measurement run).
 *
 * Walks one provider's real manifest chain with plain browser headers — the
 * same conditions direct playback faces — and returns bounded probe targets
 * for the registry runner. Nothing here is playable state: no leases, no
 * session, no Valkey writes beyond the registry the caller passes in.
 *
 * Bounds (all small by design; a canary tick per provider costs ~20 requests):
 * at most maxVariants rendition playlists are followed, each contributing at
 * most maxSegments segment targets plus its key/auxiliary references.
 */

const DOCUMENT_LIMIT = 2_000_000
const MAX_TARGETS = 24
const ENGINES: readonly DeliveryEngine[] = ['hlsjs', 'native']

export type CanaryCollection = {
  targets: DeliveryProbeTarget[]
  /** Fetched manifest texts (master + followed renditions) for timeline and
   *  seek certification without refetching. Bounded by readText's 2MB cap. */
  manifests: Array<{ url: string; text: string }>
  note?: string | undefined
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

function push(
  targets: DeliveryProbeTarget[],
  seen: Set<string>,
  skippedHosts: Set<string>,
  url: string,
  kind: DeliveryResourceKind,
  hosts: readonly string[],
) {
  if (targets.length >= MAX_TARGETS) return
  const host = hostOf(url)
  // Renditions share keys and init segments; probe each URL once.
  if (!host || seen.has(`${kind}:${url}`)) return
  if (!allowedMediaUrl(url, hosts)) {
    skippedHosts.add(host)
    return
  }
  seen.add(`${kind}:${url}`)
  for (const engine of ENGINES) targets.push({ url, host, kind, engine })
}

async function readText(
  url: string,
  hosts: readonly string[],
  transport: MediaTransport,
  signal: AbortSignal,
): Promise<string | null> {
  try {
    const response = await transport(
      url,
      hosts,
      { 'user-agent': 'Mozilla/5.0 AppleWebKit/537.36 Chrome/150 Safari/537.36', accept: '*/*' },
      signal,
    )
    try {
      if (response.status < 200 || response.status >= 300) return null
      let size = 0
      const chunks: Buffer[] = []
      for await (const chunk of response.body) {
        const bytes = Buffer.from(chunk as Uint8Array)
        size += bytes.length
        if (size > DOCUMENT_LIMIT) return null
        chunks.push(bytes)
      }
      return Buffer.concat(chunks).toString('utf8')
    } finally {
      response.body.destroy()
    }
  } catch {
    return null
  }
}

/**
 * Collect probe targets from one upstream source URL. Native/mp4 sources
 * yield a single target; HLS masters are followed one level into rendition
 * playlists. Every fetch uses browser headers only: anything that will not
 * load this way cannot play direct, which is exactly the question.
 */
export async function collectCanaryTargets(input: {
  url: string
  type: 'hls' | 'native' | 'dash'
  hosts: readonly string[]
  transport: MediaTransport
  signal: AbortSignal
  maxVariants?: number | undefined
  maxSegments?: number | undefined
}): Promise<CanaryCollection> {
  const { url, type, hosts, transport, signal } = input
  const maxVariants = input.maxVariants ?? 2
  const maxSegments = input.maxSegments ?? 2
  const targets: DeliveryProbeTarget[] = []
  const manifests: Array<{ url: string; text: string }> = []
  const seen = new Set<string>()
  const skippedHosts = new Set<string>()
  const skippedNote = () =>
    skippedHosts.size
      ? `: ${skippedHosts.size} reference host(s) outside media allowlist (${[...skippedHosts].slice(0, 5).join(', ')})`
      : ''
  if (!allowedMediaUrl(url, hosts)) return { targets, manifests, note: 'source outside media allowlist' }
  if (type === 'native') {
    push(targets, seen, skippedHosts, url, 'mp4', hosts)
    return targets.length ? { targets, manifests } : { targets, manifests, note: 'source outside media allowlist' }
  }
  if (type !== 'hls') return { targets, manifests, note: 'only hls and native sources are canaried' }
  const master = await readText(url, hosts, transport, signal)
  if (master === null) return { targets, manifests, note: 'master manifest unreachable with browser headers' }
  let entries
  try {
    entries = parseHlsReferenceEntries(master, url)
  } catch {
    return { targets, manifests, note: 'master manifest failed strict parsing' }
  }
  manifests.push({ url, text: master })
  push(targets, seen, skippedHosts, url, 'manifest', hosts)
  // URI lines in a master (no EXTINF) are rendition playlists; tag URIs
  // (keys, maps) are opaque references. Fetch renditions to discover real
  // segments; anything unparseable becomes a key-style direct probe.
  let variants = 0
  for (const entry of entries) {    if (entry.media || variants >= maxVariants || targets.length >= MAX_TARGETS) break
    const text = await readText(entry.url, hosts, transport, signal)
    if (text === null || !text.trimStart().startsWith('#EXTM3U')) {
      push(targets, seen, skippedHosts, entry.url, 'key', hosts)
      continue
    }
    variants += 1
    let rendition: Array<{ url: string; media: boolean }>
    try {
      rendition = parseHlsReferenceEntries(text, entry.url)
    } catch {
      push(targets, seen, skippedHosts, entry.url, 'key', hosts)
      continue
    }
    manifests.push({ url: entry.url, text })
    push(targets, seen, skippedHosts, entry.url, 'manifest', hosts)
    let segments = 0
    for (const ref of rendition) {
      if (targets.length >= MAX_TARGETS) break
      if (!ref.media) {
        push(targets, seen, skippedHosts, ref.url, 'key', hosts)
        continue
      }
      if (segments >= maxSegments) continue
      segments += 1
      push(targets, seen, skippedHosts, ref.url, 'segment', hosts)
    }
  }
  // Media playlists served directly as the source (EXTINF at top level).
  if (variants === 0) {
    let segments = 0
    for (const entry of entries) {
      if (targets.length >= MAX_TARGETS) break
      if (!entry.media) {
        push(targets, seen, skippedHosts, entry.url, 'key', hosts)
        continue
      }
      if (segments >= maxSegments) continue
      segments += 1
      push(targets, seen, skippedHosts, entry.url, 'segment', hosts)
    }
  }
  if (!targets.length) return { targets, manifests, note: 'no probeable references discovered' }
  // Targets exist but references were skipped: surface it — a manifest whose
  // segments live outside the allowlist (e.g. a rotated CDN host) means the
  // Direct-only certification rejects those segments, and the config is stale.
  if (entries.length === 0) return { targets, manifests, note: 'master manifest has no references' }
  if (skippedHosts.size) return { targets, manifests, note: `partial walk${skippedNote()}` }
  return { targets, manifests }
}
