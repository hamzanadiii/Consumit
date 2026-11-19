import { expect, it } from 'vitest'
import { createStaticProvider, type ProviderRegistration } from '@consumit/provider-sdk'
import { buildProviderHealthRows } from './provider-health.ts'
import type { ProviderRoute } from './route-registry.ts'

const now = 1_800_000_000_000
const version = 'edge-v1-0123456789abcdef'
const route: ProviderRoute = { provider: 'fixture', kind: 'movie', region: 'US', purpose: 'video', delivery: 'direct', lookup: 'https://resolver.example', media: 'browser', policy: 'a'.repeat(64), relayHosts: [], version }
const provider: ProviderRegistration = {
  adapter: createStaticProvider('fixture', []), enabled: true, approvedRegions: ['US'], mediaHosts: ['media.example.com'],
  upstreamGroup: 'fixture', concurrency: 1, requestsPerMinute: 10, mediaKinds: ['movie'], workerConfig: { id: 'fixture' },
  routeVersion: version,
}
const probe = { ok: true, ms: 185, at: now, stage: 'lookup' as const, purpose: 'video' as const }

it('keeps lookup success distinct and refuses healthy until browser playback, advance, seek, and resume evidence exists', () => {
  const routeFinder = () => route
  const lookupOnly = buildProviderHealthRows({ providers: [provider], probes: { 'fixture:movie:US': probe }, routeVersion: version, findRoute: routeFinder, probeIntervalMs: 30_000, now })
  expect(lookupOnly.movie[0]).toMatchObject({ status: 'degraded', lookupStatus: 'healthy', deliveryStatus: 'unknown', stage: 'playback', failureCategory: 'playback_unverified', lastSuccessAt: null })
  const verified = buildProviderHealthRows({
    providers: [provider], probes: { 'fixture:movie:US': probe }, routeVersion: version, findRoute: routeFinder, probeIntervalMs: 30_000, now,
    evidence: { [`fixture:movie:US:direct:video:${version}`]: { firstFrame: 1, advanced: 1, seeked: 1, resumed: 1, failures: 0, lastSuccessAt: now } },
  })
  expect(verified.movie[0]).toMatchObject({ status: 'healthy', lookupStatus: 'healthy', deliveryStatus: 'healthy', stage: 'playback', lastSuccessAt: now })
})

it('reports a Cloudflare upstream block at lookup stage and keeps it degraded', () => {
  const result = buildProviderHealthRows({
    providers: [provider], probes: { 'fixture:movie:US': { ...probe, ok: false, code: 'blocked' } },
    routeVersion: version, findRoute: () => route, probeIntervalMs: 30_000, now,
  })
  expect(result.movie[0]).toMatchObject({ status: 'degraded', lookupStatus: 'degraded', stage: 'lookup', failureCategory: 'blocked' })
})

it('creates separate audio health and never promotes audio from a video lookup probe', () => {
  const audio = { ...provider, role: 'audio' as const }
  const audioRoute = { ...route, purpose: 'audio' as const }
  const result = buildProviderHealthRows({
    providers: [audio], probes: { 'fixture:audio:movie:US': { ...probe, purpose: 'audio' } },
    routeVersion: version, findRoute: () => audioRoute, probeIntervalMs: 30_000, now,
  })
  expect(result.movie).toEqual([])
  expect(result.audio[0]).toMatchObject({ purpose: 'audio', status: 'degraded', lookupStatus: 'healthy', deliveryStatus: 'unknown', failureCategory: 'playback_unverified' })
})
