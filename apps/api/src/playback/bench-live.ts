import { readFileSync } from 'node:fs'
import { validatedSources, providerResultSchema } from '@consumit/provider-sdk'
import { configuredProviders } from './configured-providers.ts'
import { createAnilistCatalog } from '../catalog/anilist/adapter.ts'
import { createAnimeProviderResolvers } from '../anime/title-resolver.ts'
import type { ProviderRegistration, MediaKind } from '@consumit/provider-sdk'

// Opt-in live latency benchmark across the enabled local roster.
// Usage: bun src/playback/bench-live.ts [rounds] [concurrency]

const ROUNDS = Math.max(1, Number(process.argv[2] ?? 2) || 2)
const CONCURRENCY = Math.max(1, Math.min(8, Number(process.argv[3] ?? 6) || 6))
const REGION = 'US'

const token = process.env.TMDB_API_READ_TOKEN?.trim()
if (!token) throw new Error('TMDB_API_READ_TOKEN is required (apps/api/.env).')

const animeCatalog = createAnilistCatalog()
// Keep the benchmark on raw AniList: it measures provider resolution without
// the production fallback chain while sharing the production resolver seam.
const animeProviderResolvers = createAnimeProviderResolvers(animeCatalog)
const raw = JSON.parse(readFileSync(new URL('../../../../infra/playback/providers.local.json', import.meta.url), 'utf8')) as unknown
const providers = configuredProviders(raw, {
  tmdbToken: token,
  animeTitleResolver: animeProviderResolvers.title,
  animeTitleVariantsResolver: animeProviderResolvers.titleVariants,
  animeMetaResolver: animeProviderResolvers.metadata,
}).filter((row) => row.enabled)

const DEFAULT_REFS: Record<MediaKind, { kind: MediaKind; id: number; season?: number; episode?: number }> = {
  movie: { kind: 'movie', id: 550 },
  series: { kind: 'series', id: 1399, season: 1, episode: 1 },
  anime: { kind: 'anime', id: 21, episode: 1 },
}

function primaryKind(registration: ProviderRegistration): MediaKind {
  if (registration.mediaKinds.includes('movie')) return 'movie'
  if (registration.mediaKinds.includes('series')) return 'series'
  return 'anime'
}

type Attempt = { id: string; kind: MediaKind; ms: number; ok: boolean; code?: string; sources: number }

async function attempt(registration: ProviderRegistration, kind: MediaKind): Promise<Attempt> {
  const id = registration.adapter.id
  const budget = Math.min(Math.max(registration.attemptMs ?? 0, 10_000), 15_000)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new DOMException('Bench timed out', 'TimeoutError')), budget)
  const started = performance.now()
  try {
    const result = await registration.adapter.resolve({
      ref: registration.probes?.[kind]?.ref ?? DEFAULT_REFS[kind],
      region: REGION,
      audioLanguage: registration.probes?.[kind]?.audioLanguage ?? 'en',
    }, controller.signal)
    const ms = Math.round(performance.now() - started)
    const parsed = providerResultSchema.safeParse(result)
    if (!parsed.success) return { id, kind, ms, ok: false, code: 'invalid-source', sources: 0 }
    if (!parsed.data.ok) return { id, kind, ms, ok: false, code: parsed.data.code, sources: 0 }
    const sources = validatedSources(parsed.data, registration, Date.now())
    return sources.length > 0
      ? { id, kind, ms, ok: true, sources: sources.length }
      : { id, kind, ms, ok: false, code: 'invalid-source', sources: 0 }
  } catch (error) {
    const ms = Math.round(performance.now() - started)
    const code = (error as { code?: string; name?: string }).code ?? (error as { name?: string }).name ?? 'error'
    return { id, kind, ms, ok: false, code: String(code), sources: 0 }
  } finally {
    clearTimeout(timeout)
  }
}

type BenchRow = { id: string; kind: MediaKind; rounds: Attempt[]; mean: number; best: number; ok: boolean; sources: number; code?: string }

const work = providers.map((registration) => ({ registration, kind: primaryKind(registration) }))
const results = new Map<string, Attempt[]>()
let done = 0
const total = work.length * ROUNDS

async function worker(queue: Array<{ registration: ProviderRegistration; kind: MediaKind }>): Promise<void> {
  for (let next = queue.pop(); next; next = queue.pop()) {
    const key = next.registration.adapter.id
    const record = await attempt(next.registration, next.kind)
    const list = results.get(key) ?? []
    list.push(record)
    results.set(key, list)
    done += 1
    const status = record.ok ? 'ok  ' : 'FAIL'
    const detail = record.ok ? record.sources + ' src' : (record.code ?? '')
    console.info('[' + String(done).padStart(3) + '/' + total + '] ' + status + ' ' + key.padEnd(20) + String(record.ms).padStart(6) + 'ms ' + detail)
  }
}

console.info('Benchmarking ' + work.length + ' enabled providers x ' + ROUNDS + ' round(s), concurrency ' + CONCURRENCY + ', region ' + REGION + '...')
const started = performance.now()
for (let round = 0; round < ROUNDS; round += 1) {
  const queue = [...work]
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)))
}
const elapsed = Math.round((performance.now() - started) / 1000)

const rows: BenchRow[] = [...results.entries()].map(([id, attempts]) => {
  const primary = attempts[0]!
  const mean = Math.round(attempts.reduce((sum, item) => sum + item.ms, 0) / attempts.length)
  const best = Math.min(...attempts.map((item) => item.ms))
  const ok = attempts.every((item) => item.ok)
  return { id, kind: primary.kind, rounds: attempts, mean, best, ok, sources: primary.sources, ...(ok || !primary.code ? {} : { code: primary.code }) }
})
rows.sort((left, right) => (Number(right.ok) - Number(left.ok)) || (left.mean - right.mean))

console.info('')
console.info('Done in ' + elapsed + 's. Ranked by mean latency (ok first):')
console.info('rank | provider           | kind   | ok  | src | mean ms | best ms | code')
rows.forEach((row, index) => {
  const flag = row.ok ? ' ok' : 'FAIL'
  console.info(String(index + 1).padStart(4) + ' | ' + row.id.padEnd(18) + ' | ' + row.kind.padEnd(6) + ' | ' + flag + ' | ' + String(row.sources).padStart(3) + ' | ' + String(row.mean).padStart(7) + ' | ' + String(row.best).padStart(7) + ' | ' + (row.code ?? ''))
})

const fastest = rows.filter((row) => row.ok)
if (fastest.length > 0) {
  const top = fastest.slice(0, 5).map((row) => row.id + ' ' + row.mean + 'ms').join(' | ')
  console.info('')
  console.info('FASTEST: ' + fastest[0]!.id + ' (' + fastest[0]!.mean + 'ms mean, ' + fastest[0]!.best + 'ms best)')
  console.info('TOP 5: ' + top)
}
const failures = rows.filter((row) => !row.ok)
if (failures.length > 0) console.info('FAILURES: ' + failures.map((row) => row.id + '(' + row.code + ')').join(', '))
