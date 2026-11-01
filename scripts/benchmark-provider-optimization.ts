import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { StaleCache, type CatalogRefreshLease } from '../apps/api/src/catalog/stale-cache.ts'
import type { PersistentCatalogCacheEntry, PersistentCatalogCacheStore } from '../apps/api/src/catalog/cache-store.ts'
import { createMemoryPlaybackStore } from '../apps/api/src/playback/state.ts'
import { createSubtitleDiscovery } from '../apps/api/src/subtitles/discovery.ts'
import { createStoreFileStore } from '../apps/api/src/subtitles/storage.ts'
import { createProgressWriteCoordinator } from '../apps/web/src/lib/progress-write-coordinator.ts'

const percentile = (samples: number[], quantile: number) => [...samples].sort((a, b) => a - b)[Math.min(samples.length - 1, Math.floor(samples.length * quantile))] ?? 0
async function catalog(coordinated: boolean) {
  let row: PersistentCatalogCacheEntry = { key: 'home', value: 'stale', fetchedAt: new Date(0), freshUntil: new Date(100), staleUntil: new Date(1000) }
  let reads = 0, writes = 0, upstreamCalls = 0, lock: string | null = null
  const store: PersistentCatalogCacheStore = { get: async () => { reads++; return row }, set: async next => { writes++; row = next }, delete: async () => {}, deleteExpired: async () => 0 }
  const lease: CatalogRefreshLease = { claim: async (_key, token) => { if (lock) return false; lock = token; return true }, release: async (_key, token) => { if (lock === token) lock = null } }
  const instances = Array.from({ length: 30 }, () => new StaleCache(() => 200, store, undefined, coordinated ? lease : undefined))
  const started = performance.now()
  await Promise.all(instances.map(cache => cache.get('home', { freshForMs: 500, staleForMs: 500 }, async () => { upstreamCalls++; return 'fresh' })))
  // Allow detached stale refreshes to settle before counting their work.
  await new Promise(resolve => setTimeout(resolve, 0))
  return { instances: 30, durationMs: performance.now() - started, persistentReads: reads, persistentWrites: writes, upstreamCalls }
}
async function subtitles() {
  let upstreamCalls = 0, active = 0, peak = 0
  const store = createMemoryPlaybackStore(), files = createStoreFileStore(store)
  const discovery = createSubtitleDiscovery({ providers: Array.from({ length: 29 }, (_, provider) => ({
    id: `fixture-${provider}`, name: `fixture-${provider}`, supports: () => true,
    async search() {
      upstreamCalls++; active++; peak = Math.max(peak, active)
      await Promise.resolve(); active--
      return Array.from({ length: 100 }, (_, index) => ({ provider: `fixture-${provider}`, lang: index % 2 ? 'en-gb' : 'en-us', label: `English ${index}`, format: 'srt' as const, url: `https://subs.example.com/${provider}/${index}.srt` }))
    },
  })), store, files, origin: 'https://consumit.example.com', query: async () => ({ type: 'movie', tmdbId: 550 }) })
  const ref = { kind: 'movie' as const, id: 550 }, signal = new AbortController().signal
  const started = performance.now()
  const simultaneous = await Promise.all(Array.from({ length: 25 }, () => Array.fromAsync(discovery.discover(ref, signal))))
  const coldMs = performance.now() - started, coldCalls = upstreamCalls
  const samples: number[] = []
  for (let i = 0; i < 100; i++) { const start = performance.now(); await Array.fromAsync(discovery.discover(ref, signal)); samples.push(performance.now() - start) }
  const page = await discovery.page(simultaneous[0]![0]!.searchId, 'en')
  return { simultaneous: 25, coldMs, coldUpstreamCalls: coldCalls, warmUpstreamCalls: upstreamCalls - coldCalls, peakProviderConcurrency: peak, visibleEnglishChoices: page?.tracks.length, warmP50Ms: percentile(samples, 0.5), warmP95Ms: percentile(samples, 0.95) }
}
async function progress(coordinated: boolean) {
  let writes = 0
  const coordinator = createProgressWriteCoordinator(), operation = async () => { writes++; await Promise.resolve() }
  await Promise.all(Array.from({ length: 4 }, () => coordinated ? coordinator.write('member:episode:25', true, operation) : operation()))
  return { overlappingIdenticalLifecycleFlushes: 4, writes, cadenceSeconds: 25 }
}
const memoryBefore = process.memoryUsage()
const report = {
  observedAt: new Date().toISOString(), runtime: { engine: 'bun', version: Bun.version, nodeCompatibility: process.version }, fixtureOnly: true,
  limitations: ['No network, database server, route bundle, browser field metric or production capacity was measured. Catalog persistence is a counted fixture.'],
  catalog: { beforeWithoutSharedLease: await catalog(false), afterWithSharedLease: await catalog(true) },
  subtitles: await subtitles(), progress: { before: await progress(false), after: await progress(true) },
  resources: { before: memoryBefore, after: process.memoryUsage() },
}
await writeFile(resolve(process.argv[2] ?? 'docs/audits/provider-optimization-fixtures-2026-10-24.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report))
