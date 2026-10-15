import { createHash, randomUUID } from 'node:crypto'
import { allowedMediaUrl } from '@consumit/provider-sdk'
import type { SubtitleCandidate, SubtitleProviderStatus, SubtitleDiscoveryEvent } from '@consumit/contracts'
import type { PlaybackStore } from '../playback/state.ts'
import type { SubtitleCatalog } from './catalog.ts'
import { toServedTracks } from './catalog.ts'
import { langLabel } from './lang.ts'
import { detectTrackFlags, resolveSubtitles, subtitleFileKey, type ServedSubtitle } from './engine.ts'
import { fetchSubtitleBytes } from './http.ts'
import type { SubtitleFileStore } from './storage.ts'
import type { SubtitleRef } from './subtitles.ts'
import type { RawSubtitle, SubtitleQuery, SubtitleSearchProvider } from './types.ts'

const TTL = 3600
const PROVIDER_TIMEOUT_MS = 8500
const PAGE_SIZE = 20

export type DiscoveryTrack = SubtitleCandidate
type Candidate = { public: DiscoveryTrack; raw?: RawSubtitle; prepared?: ServedSubtitle }
type Snapshot = { id: string; ref: SubtitleRef; candidates: Candidate[]; version?: number; remaining?: string[]; query?: SubtitleQuery; nextCursor?: string | undefined }
export type ProviderOutcome = SubtitleProviderStatus
export type DiscoveryEvent = SubtitleDiscoveryEvent

function publicTrack(raw: RawSubtitle, id: string): DiscoveryTrack {
  const flags = detectTrackFlags(`${raw.label} ${raw.url}`)
  return {
    id, language: raw.lang.toLowerCase(), label: raw.label.slice(0, 160), provider: raw.provider.slice(0, 64),
    ...(raw.providerName ? { providerName: raw.providerName.slice(0, 160) } : {}),
    ...(raw.release ? { release: raw.release.slice(0, 160) } : {}),
    ...(raw.hi ? { hi: true } : {}),
    ...(flags.forced ? { forced: true } : {}),
    ...(flags.sdh ? { sdh: true } : {}),
    ...(flags.machineTranslated ? { machineTranslated: true } : {}),
  }
}

function validRaw(raw: RawSubtitle, provider: SubtitleSearchProvider): boolean {
  if (!raw || typeof raw !== 'object' || raw.provider !== provider.id || typeof raw.lang !== 'string' || raw.lang.length > 32 || !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(raw.lang) ||
      typeof raw.label !== 'string' || typeof raw.url !== 'string' || raw.url.length > 4096 ||
      (raw.identityUrl !== undefined && (typeof raw.identityUrl !== 'string' || raw.identityUrl.length > 4096))) return false
  try {
    const url = new URL(raw.url.replace(/ /g, '%20'))
    if (url.protocol !== 'https:' || url.username || url.password || ['localhost', '127.0.0.1', '::1'].includes(url.hostname)) return false
    // Declared file scope rejects injected destinations at intake so they
    // never reach the candidate list a member could select from.
    const hosts = provider.fileHosts ?? []
    const patterns = provider.fileHostPatterns ?? []
    return !(hosts.length || patterns.length) || allowedMediaUrl(url, hosts, patterns)
  } catch { return false }
}

function counts(snapshot: Snapshot): DiscoveryEvent['languages'] {
  const found = new Map<string, number>()
  for (const candidate of snapshot.candidates) found.set(candidate.public.language, (found.get(candidate.public.language) ?? 0) + 1)
  return [...found].map(([code, count]) => ({ code, count })).sort((a, b) => a.code.localeCompare(b.code))
}

export function createSubtitleDiscovery(deps: {
  providers: readonly SubtitleSearchProvider[]
  store: PlaybackStore
  files: SubtitleFileStore
  origin: string
  catalog?: SubtitleCatalog | undefined
  query(ref: SubtitleRef, signal: AbortSignal): Promise<SubtitleQuery>
  requirements?: Readonly<Record<string, string>> | undefined
}) {
  const outcomes = new Map<string, ProviderOutcome>()
  const key = (id: string) => `subtitle:discovery:${id}`
  const latestKey = (ref: SubtitleRef) => `subtitle:latest:${ref.kind}:${ref.id}:${ref.season ?? 0}:${ref.episode ?? 0}`
  const available = (candidate: Candidate) => {
    if (!candidate.public.provider.startsWith('stream-')) return true
    const provider = deps.providers.find(provider => provider.id === candidate.public.provider)
    return Boolean(candidate.raw && provider?.accepts?.(candidate.raw))
  }
  async function read(id: string): Promise<Snapshot | null> {
    if (!/^[0-9a-f-]{36}$/.test(id)) return null
    const raw = await deps.store.get(key(id))
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw) as Snapshot
      return parsed.id === id && Array.isArray(parsed.candidates) ? parsed : null
    } catch { return null }
  }
  async function save(snapshot: Snapshot) { snapshot.candidates = snapshot.candidates.filter(available); await deps.store.set(key(snapshot.id), JSON.stringify(snapshot), TTL) }
  function candidateId(raw: RawSubtitle) {
    return createHash('sha256').update(`${raw.provider}|${raw.lang.toLowerCase()}|${raw.identityUrl ?? raw.url}`).digest('hex').slice(0, 24)
  }
  function mergeCandidate(snapshot: Snapshot, candidate: Candidate) {
    const fileKey = candidate.raw ? subtitleFileKey(candidate.raw) : candidate.public.preparedUrl?.match(/\/file\/([0-9a-f]{16})$/)?.[1]
    const existing = snapshot.candidates.find((entry) => entry.public.id === candidate.public.id ||
      (fileKey !== undefined && fileKey === (entry.raw ? subtitleFileKey(entry.raw) : entry.public.preparedUrl?.match(/\/file\/([0-9a-f]{16})$/)?.[1])))
    if (existing) {
      // Preserve the visible ID and attach the provider result to its cached
      // file instead of displaying a second, unprepared copy.
      if (candidate.raw) existing.raw = candidate.raw
      if (candidate.prepared) { existing.prepared = candidate.prepared; existing.public.preparedUrl = candidate.prepared.url }
      return false
    }
    if (snapshot.candidates.length >= 10000) return false
    snapshot.candidates.push(candidate)
    return true
  }
  function add(snapshot: Snapshot, raw: RawSubtitle) {
    const id = candidateId(raw)
    return mergeCandidate(snapshot, { public: publicTrack(raw, id), raw })
  }
  async function* discover(ref: SubtitleRef, signal: AbortSignal, cursor?: string): AsyncGenerator<DiscoveryEvent> {
    if (cursor && !/^[0-9a-f-]{36}\.[0-9a-f-]{36}$/.test(cursor)) throw new Error('Invalid subtitle continuation.')
    const prior = cursor ? await read(cursor.split('.')[0]!) : null
    if (cursor && (!prior || JSON.stringify(prior.ref) !== JSON.stringify(ref))) throw new Error('Search subtitles again.')
    if (cursor) {
      const cached = await deps.store.get(`subtitle:batch:${cursor}`)
      if (cached) { for (const event of JSON.parse(cached) as DiscoveryEvent[]) yield event; return }
      if (prior?.nextCursor !== cursor) throw new Error('Search subtitles again.')
    }
    const lock = cursor ? `subtitle:batch-lock:${cursor}` : null, lease = randomUUID()
    if (lock && !await deps.store.claim(lock, lease, 30)) throw new Error('Subtitle discovery is busy. Try again.')
    const emitted: DiscoveryEvent[] = []
    try {
    for await (const event of discoverBatch(ref, signal, prior ?? undefined)) { emitted.push(event); yield event }
    if (cursor) await deps.store.set(`subtitle:batch:${cursor}`, JSON.stringify(emitted), TTL)
    } finally { if (lock) await deps.store.release(lock, lease) }
  }
  async function* discoverBatch(ref: SubtitleRef, signal: AbortSignal, prior?: Snapshot): AsyncGenerator<DiscoveryEvent> {
    const snapshot: Snapshot = prior ?? { id: randomUUID(), ref, candidates: [], version: 2 }
    if (!prior) {
    try {
      const previousId = await deps.store.get(latestKey(ref))
      const previous = previousId ? await read(previousId) : null
      if (previous?.version === 2) {
        const usable = await Promise.all(previous.candidates.map(async (candidate) => {
          if (candidate.prepared && candidate.public.preparedUrl) {
            const fileKey = candidate.public.preparedUrl.match(/\/file\/([0-9a-f]{16})$/)?.[1]
            if (!fileKey || !await deps.files.getVtt(fileKey)) return null
          }
          return available(candidate) ? candidate : null
        }))
        for (const candidate of usable) if (candidate) mergeCandidate(snapshot, candidate)
      }
    } catch { /* Cache outages never hold discovery. */ }
    await save(snapshot)
    await deps.store.set(latestKey(ref), snapshot.id, TTL)
    yield { type: 'snapshot', searchId: snapshot.id, languages: counts(snapshot) }

    if (deps.catalog) {
      try {
        const rows = await deps.catalog.find(ref, [])
        const usable = await Promise.all(rows.map(async (row) => await deps.files.getVtt(row.storageKey) ? row : null))
        let added = false
        for (const row of usable) {
          if (!row || row.provider.startsWith('stream-')) continue
          const track = toServedTracks([row], deps.origin)[0]!
          const inserted = mergeCandidate(snapshot, { public: {
            id: `catalog-${row.storageKey}`, language: row.language, label: row.label, provider: row.provider,
            preparedUrl: track.url, ...(row.releaseTag ? { release: row.releaseTag } : {}), ...(row.hi ? { hi: true } : {}),
          }, prepared: track })
          added ||= inserted
        }
        if (added) {
          await save(snapshot)
          yield { type: 'snapshot', searchId: snapshot.id, languages: counts(snapshot) }
        }
      } catch { /* Catalog outages never hold discovery. */ }
    }

    }
    const query = snapshot.query ?? await deps.query(ref, signal)
    snapshot.query = query
    snapshot.remaining ??= deps.providers.filter(provider => { try { return provider.supports(query) } catch { return false } }).map(provider => provider.id)
    const batch = snapshot.remaining.splice(0, 12)
    await save(snapshot)
    const pending = new Map<string, Promise<{ provider: SubtitleSearchProvider; raws: RawSubtitle[]; durationMs: number; error?: 'failed' | 'timeout' }>>()
    for (const provider of deps.providers) {
      let supported = false
      try { supported = provider.supports(query) } catch { /* Treat a broken supports check as skipped. */ }
      if (!supported) {
        const status: ProviderOutcome = { id: provider.id, name: provider.name, state: 'skipped', durationMs: 0, found: 0, reason: deps.requirements?.[provider.id] ? 'credentials_required' : 'unsupported' }
        outcomes.set(provider.id, status)
        yield { type: 'provider', searchId: snapshot.id, languages: counts(snapshot), provider: status }
        continue
      }
      if (!batch.includes(provider.id)) continue
      pending.set(provider.id, (async () => {
        const started = Date.now()
        const controller = new AbortController()
        let abortSearch: (() => void) | undefined
        const abort = () => { controller.abort(); abortSearch?.() }
        signal.addEventListener('abort', abort, { once: true })
        if (signal.aborted) controller.abort()
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
          const result = await Promise.race([
            provider.search(query, controller.signal),
            new Promise<never>((_, reject) => { abortSearch = () => reject(new DOMException('Subtitle search cancelled.', 'AbortError')); if (signal.aborted) abortSearch() }),
            new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('timeout')) }, PROVIDER_TIMEOUT_MS) }),
          ])
          return { provider, raws: result, durationMs: Date.now() - started }
        } catch (error) {
          return { provider, raws: [], durationMs: Date.now() - started, error: error instanceof Error && error.message === 'timeout' ? 'timeout' as const : 'failed' as const }
        } finally { clearTimeout(timer); signal.removeEventListener('abort', abort) }
      })())
    }
    while (pending.size && !signal.aborted) {
      const result = await Promise.race(pending.values())
      pending.delete(result.provider.id)
      const valid = Array.isArray(result.raws) ? result.raws.slice(0, 2000).filter((raw) => validRaw(raw, result.provider) && (!result.provider.accepts || result.provider.accepts(raw))) : []
      for (const raw of valid) add(snapshot, raw)
      await save(snapshot)
      const status: ProviderOutcome = {
        id: result.provider.id, name: result.provider.name,
        state: result.error === 'timeout' ? 'timeout' : result.error ? 'failed' : valid.length ? 'ready' : 'no_match',
        durationMs: result.durationMs, found: valid.length,
        ...(result.error ? { failure: 'search' as const } : Array.isArray(result.raws) && valid.length < result.raws.length ? { failure: 'parse' as const } : {}),
      }
      outcomes.set(result.provider.id, status)
      yield { type: 'provider', searchId: snapshot.id, languages: counts(snapshot), provider: status }
    }
    if (signal.aborted) snapshot.remaining.unshift(...pending.keys())
    snapshot.nextCursor = snapshot.remaining.length ? `${snapshot.id}.${randomUUID()}` : undefined
    await save(snapshot)
    yield { type: 'complete', searchId: snapshot.id, languages: counts(snapshot), ...(snapshot.nextCursor ? { nextCursor: snapshot.nextCursor } : {}) }
  }
  async function page(searchId: string, language: string, cursor = 0, preferred: readonly string[] = []) {
    const snapshot = await read(searchId)
    if (!snapshot) return null
    const ranked = snapshot.candidates.filter((candidate) => candidate.public.language === language && available(candidate))
      .sort((a, b) => Number(b.public.preparedUrl !== undefined) - Number(a.public.preparedUrl !== undefined) ||
        Number(preferred.includes(b.public.language)) - Number(preferred.includes(a.public.language)) || a.public.label.localeCompare(b.public.label))
    const tracks = ranked.slice(cursor, cursor + PAGE_SIZE).map((candidate) => candidate.public)
    return { tracks, total: ranked.length, nextCursor: cursor + PAGE_SIZE < ranked.length ? cursor + PAGE_SIZE : null }
  }
  async function search(searchId: string, term: string, cursor = 0) {
    const snapshot = await read(searchId)
    if (!snapshot) return null
    const query = term.trim().toLowerCase().slice(0, 80)
    const matches = snapshot.candidates.filter((candidate) => available(candidate) &&
      `${candidate.public.language} ${langLabel(candidate.public.language)} ${candidate.public.label} ${candidate.public.provider} ${candidate.public.release ?? ''}`.toLowerCase().includes(query))
    return { tracks: matches.slice(cursor, cursor + PAGE_SIZE).map((candidate) => candidate.public), total: matches.length, nextCursor: cursor + PAGE_SIZE < matches.length ? cursor + PAGE_SIZE : null }
  }
  async function testCandidates(searchId: string): Promise<string[]> {
    const snapshot = await read(searchId)
    if (!snapshot) return []
    const seen = new Set<string>()
    return snapshot.candidates.filter((candidate) => {
      if (seen.has(candidate.public.provider)) return false
      seen.add(candidate.public.provider)
      return true
    }).map((candidate) => candidate.public.id)
  }
  async function prepare(searchId: string, candidateId: string, signal: AbortSignal): Promise<ServedSubtitle | null> {
    const snapshot = await read(searchId)
    const candidate = snapshot?.candidates.find((entry) => entry.public.id === candidateId)
    if (!snapshot || !candidate || !available(candidate)) return null
    if (candidate.prepared) {
      const fileKey = candidate.prepared.url.match(/\/file\/([0-9a-f]{16})$/)?.[1]
      return fileKey && await deps.files.getVtt(fileKey) ? candidate.prepared : null
    }
    if (!candidate.raw) return null
    try {
      // Preparation already has an exact candidate. It must not repeat
      // optional catalog lookups before downloading the selected file.
      const query: SubtitleQuery = { type: snapshot.ref.kind === 'series' ? 'tv' : snapshot.ref.kind }
      const configured = deps.providers.find(provider => provider.id === candidate.raw!.provider)
      // The shim inherits the real provider's declared file scope so the
      // engine enforces the same destination rules on this single-candidate
      // preparation as it does on live fan-out searches.
      const provider: SubtitleSearchProvider = {
        id: candidate.raw.provider, name: candidate.raw.provider, supports: () => true, search: async () => [candidate.raw!],
        ...(configured?.fileHosts?.length ? { fileHosts: configured.fileHosts } : {}),
        ...(configured?.fileHostPatterns?.length ? { fileHostPatterns: configured.fileHostPatterns } : {}),
      }
      let downloadFailed = false
      const fetchFile: typeof fetchSubtitleBytes = async (...args) => {
        try { return configured?.download ? await configured.download(candidate.raw!, args[3]) : await fetchSubtitleBytes(...args) }
        catch (error) { downloadFailed = true; throw error }
      }
      const track = (await resolveSubtitles(query, [provider], deps.files, deps.origin, signal, fetchFile, true))[0] ?? null
      if (!available(candidate)) return null
      if (!track) {
        outcomes.set(candidate.raw.provider, { id: candidate.raw.provider, name: candidate.raw.provider, state: 'failed', durationMs: 0, found: 0, failure: downloadFailed ? 'download' : 'conversion' })
        return null
      }
      // resolveSubtitles historically passed remote VTT URLs through. The
      // browser-facing discovery contract only accepts first-party files.
      if (!track.url.startsWith(`${deps.origin.replace(/\/$/, '')}/v1/subtitles/file/`)) return null
      const fileKey = track.url.match(/\/file\/([0-9a-f]{16})$/)?.[1]
      if (!fileKey || !await deps.files.getVtt(fileKey)) return null
      candidate.prepared = track
      candidate.public.preparedUrl = track.url
      await save(snapshot)
      if (deps.catalog && !candidate.public.provider.startsWith('stream-')) {
        try {
          const vtt = await deps.files.getVtt(fileKey)
          if (vtt) await deps.catalog.save(snapshot.ref, [{
            language: track.language, label: track.label, format: 'vtt', provider: track.provider,
            storageKey: fileKey, vtt, ...(track.hi ? { hi: true } : {}),
            ...(typeof track.rating === 'number' ? { rating: track.rating } : {}),
            ...(track.release ? { releaseTag: track.release } : {}),
          }])
        } catch { /* Durable catalog failure does not lose a playable file. */ }
      }
      return track
    } catch {
      outcomes.set(candidate.raw.provider, { id: candidate.raw.provider, name: candidate.raw.provider, state: 'failed', durationMs: 0, found: 0, failure: 'download' })
      return null
    }
  }
  function diagnostics() {
    return deps.providers.map((provider) => ({
      id: provider.id, name: provider.name,
      configured: !deps.requirements?.[provider.id],
      requirement: deps.requirements?.[provider.id] ?? null,
      last: outcomes.get(provider.id) ?? null,
    }))
  }
  return { discover, page, search, testCandidates, prepare, diagnostics }
}
