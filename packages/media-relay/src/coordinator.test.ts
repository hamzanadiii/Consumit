import { DatabaseSync } from 'node:sqlite'
import { expect, it, vi } from 'vitest'
import { ProviderCoordinator } from './resolver-worker.ts'
import type { SqlStorage } from './edge-storage.ts'

function sqlite(): SqlStorage {
  const db = new DatabaseSync(':memory:')
  return { exec<T extends Record<string, unknown>>(query: string, ...params: (string | number | null)[]) { const rows = db.prepare(query).all(...params) as T[]; return { toArray: () => rows } } }
}
function providerRequest(body: unknown, secret: string, signal?: AbortSignal) {
  return new Request('https://resolver.internal/v1/resolve', {
    method: 'POST', headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
    body: JSON.stringify(body), ...(signal ? { signal } : {}),
  })
}
it('coalesces simultaneous lookups before charging admission and reuses SQLite cache after restart', async () => {
  const storage = { sql: sqlite() }, secret = 'fixture-secret-with-more-than-32-characters'
  const env = { RESOLVER_ENABLED: 'true', RESOLVER_SECRET: secret, RESOLVER_ROUTE_POLICY_REQUIRED: 'true' }
  const ref = { kind: 'movie', id: 550 }, expiresAt = new Date(Date.now() + 600_000).toISOString()
  const body = { providerId: 'static-fixture', input: { ref, region: 'US', audioLanguage: 'en' }, metadata: {}, config: { id: 'static-fixture', adapter: 'static', enabled: true, role: 'video', deliveryMode: 'direct', regions: ['US'], mediaHosts: ['media.example.com'], upstreamGroup: 'fixture', concurrency: 1, requestsPerMinute: 1, priority: 0, mediaKinds: ['movie'], entries: [{ ref, sources: [{ key: 'main', url: 'https://media.example.com/movie.mp4', type: 'native', expiresAt }] }] } }
  const request = () => new Request('https://resolver.internal/v1/resolve', { method: 'POST', headers: { authorization: `Bearer ${secret}` }, body: JSON.stringify(body) })
  const coordinator = new ProviderCoordinator({ storage }, env)
  const responses = await Promise.all(Array.from({ length: 25 }, () => coordinator.fetch(request())))
  expect(responses.map(response => response.status)).toEqual(Array(25).fill(200))
  const firstBudget = storage.sql.exec<{ value: string }>("SELECT value FROM state WHERE key LIKE 'budget:%'").toArray()
  expect(firstBudget).toHaveLength(1)
  expect(JSON.parse(firstBudget[0]!.value).count).toBe(1)
  const restarted = new ProviderCoordinator({ storage }, env)
  expect((await restarted.fetch(request())).status).toBe(200)
  const otherProvider = { ...body, providerId: 'static-fixture-two', config: { ...body.config, id: 'static-fixture-two' } }
  const otherResponse = await restarted.fetch(new Request('https://resolver.internal/v1/resolve', {
    method: 'POST', headers: { authorization: `Bearer ${secret}` }, body: JSON.stringify(otherProvider),
  }))
  expect(otherResponse.status).toBe(200)
  expect(storage.sql.exec("SELECT key FROM state WHERE key LIKE 'budget:%'").toArray()).toHaveLength(2)
})

it('keeps a coalesced lookup alive until the last caller disconnects and records upstream blocks', async () => {
  const storage = { sql: sqlite() }, secret = 'fixture-secret-with-more-than-32-characters'
  const env = { RESOLVER_ENABLED: 'true', RESOLVER_SECRET: secret, RESOLVER_ROUTE_POLICY_REQUIRED: 'true' }
  const body = {
    providerId: 'evion', input: { ref: { kind: 'series', id: 1399, season: 1, episode: 1 }, region: 'US', audioLanguage: 'en' }, metadata: {},
    config: { id: 'evion', adapter: 'evion', enabled: true, role: 'video', deliveryMode: 'direct', regions: ['US'], mediaHosts: ['img.animecurx.tech'], resolutionHosts: ['api.bingr.one'], upstreamGroup: 'evion', concurrency: 1, requestsPerMinute: 20, priority: 0, mediaKinds: ['series'] },
  }
  let markStarted!: () => void
  const started = new Promise<void>(resolve => { markStarted = resolve })
  let finishUpstream!: (response: Response) => void
  let upstreamSignal: AbortSignal | undefined
  const fetcher = vi.fn((_url: string | URL, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
    upstreamSignal = init?.signal ?? undefined
    finishUpstream = resolve
    markStarted()
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
  }))
  const coordinator = new ProviderCoordinator({ storage }, env, { fetch: fetcher })
  const firstController = new AbortController(), secondController = new AbortController()
  const first = coordinator.fetch(providerRequest(body, secret, firstController.signal))
  await started
  const second = coordinator.fetch(providerRequest(body, secret, secondController.signal))
  await vi.waitFor(() => expect([...((coordinator as unknown as { jobs: Map<string, { subscribers: number }> }).jobs.values())][0]?.subscribers).toBe(2))
  firstController.abort(new DOMException('Viewer left.', 'AbortError'))
  expect((await first).status).toBe(499)
  expect(upstreamSignal?.aborted).toBe(false)
  finishUpstream(new Response('Cloudflare challenge', { status: 403 }))
  const response = await second
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ ok: false, code: 'blocked', retryable: false })
  expect(fetcher).toHaveBeenCalledTimes(1)
  const circuits = storage.sql.exec<{ value: string }>("SELECT value FROM state WHERE key LIKE 'circuit:%'").toArray()
  expect(circuits).toHaveLength(1)
  expect(JSON.parse(circuits[0]!.value)).toMatchObject({ failures: 1 })
})
