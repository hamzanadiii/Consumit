import assert from 'node:assert/strict'
import { test } from 'node:test'
import { smokeProduction } from './smoke-production.mjs'

const catalog = { items: [], page: 1, totalPages: 0, totalResults: 0, meta: { fetchedAt: '2026-10-07T00:00:00.000Z', language: 'en-US', region: 'US', source: 'tmdb', stale: false } }
const session = { id: '09c82022-4e60-49b3-b9d7-21a65a4aef95', ref: { kind: 'movie', id: 550 }, expiresAt: '2026-10-08T00:00:00.000Z', fallbackCount: 0,
  capabilities: { refresh: true, fallback: true, externalSubtitles: true }, source: { id: 'fixture', providerId: 'fixture', type: 'hls', delivery: 'relay', src: 'https://consumit.example/v1/playback/relay-manifest?grant=fixture', expiresAt: '2026-10-08T00:00:00.000Z' } }

function fixture(overrides = {}) {
  return async (url, init) => {
    assert.equal(init.cache, 'no-store')
    assert.ok(init.signal instanceof AbortSignal)
    const path = url.pathname
    if (overrides[path]) return overrides[path]()
    if (path === '/healthz') return new Response('ok')
    if (path === '/') return new Response('page', { headers: { 'x-content-type-options': 'nosniff' } })
    if (path === '/v1/titles/discover') return Response.json(catalog, { headers: { 'cache-control': 'public, max-age=300' } })
    if (path === '/v1/me/library') return Response.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in.', requestId: 'fixture-request', retryable: false } }, { status: 401, headers: { 'cache-control': 'private, no-store' } })
    if (path === '/v1/playback/resolve') return Response.json(session, { headers: { 'cache-control': 'private, no-store' } })
    throw new Error(`Unexpected smoke path ${path}`)
  }
}

test('smoke checks the active private route and accepts validated relay playback', async () => {
  await smokeProduction('https://consumit.example', '{"kind":"movie","id":550}', fixture())
})
test('a private-route 404 cannot pass the deployment smoke', async () => {
  await assert.rejects(smokeProduction('https://consumit.example', undefined, fixture({ '/v1/me/library': () => Response.json({ error: { code: 'NOT_FOUND', message: 'Missing.', requestId: 'fixture-request', retryable: false } }, { status: 404, headers: { 'cache-control': 'private, no-store' } }) })), /Anonymous member access/)
})
test('malformed catalog output cannot pass a cache-header check', async () => {
  await assert.rejects(smokeProduction('https://consumit.example', undefined, fixture({ '/v1/titles/discover': () => Response.json({}, { headers: { 'cache-control': 'public' } }) })))
})
