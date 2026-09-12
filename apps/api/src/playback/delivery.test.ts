import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { createMemoryPlaybackStore } from './state.ts'
import {
  createCapabilityRegistry,
  deliveryKey,
  guessEngine,
  planDelivery,
  planSource,
  probeDirectSupport,
  runDeliveryProbes,
  type DeliveryCapability,
} from './delivery.ts'
import type { MediaTransport } from './transport.ts'

const direct = () => 'direct' as const
const unsupported = () => 'unsupported' as const
const stub = (status = 200, headers: Record<string, string> = { 'content-type': 'video/mp4' }): MediaTransport =>
  (async (url) => ({ url, status, headers: new Headers(headers), body: Readable.from([Buffer.alloc(4)]) }))

describe('delivery planner', () => {
  it('rejects cookie-locked, dash, and transformed sources', () => {
    const capable = () => direct()
    expect(planDelivery({ headers: { cookie: 'session=1' }, type: 'hls' }, 'hlsjs', capable)).toBe('unsupported')
    expect(planDelivery({ headers: {}, type: 'dash' }, 'hlsjs', capable)).toBe('unsupported')
    expect(planDelivery({ headers: {}, type: 'hls', segmentTransform: 'mpegts-image-prefix' }, 'hlsjs', capable)).toBe('unsupported')
  })
  it('sends native sources direct only with a proven mp4 verdict', () => {
    expect(planDelivery({ headers: {}, type: 'native' }, 'native', () => direct())).toBe('direct')
    expect(planDelivery({ headers: {}, type: 'native' }, 'native', () => unsupported())).toBe('unsupported')
    expect(planDelivery({ headers: {}, type: 'native' }, 'native', () => null)).toBe('unsupported')
    expect(planDelivery({ headers: { referer: 'https://provider.example/' }, type: 'native' }, 'native', () => direct())).toBe('direct')
  })
  it('splits headerless hls into direct only when manifest and segments agree', () => {
    const headers = {}
    expect(planDelivery({ headers, type: 'hls' }, 'hlsjs', () => direct())).toBe('direct')
    expect(planDelivery({ headers, type: 'hls' }, 'hlsjs', (kind) => (kind === 'manifest' ? unsupported() : direct()))).toBe('unsupported')
    expect(planDelivery({ headers, type: 'hls' }, 'hlsjs', () => null)).toBe('unsupported')
  })
  it('allows a header-declared HLS source only when every resource is proven direct', () => {
    const source = { headers: { referer: 'https://provider.example/' }, type: 'hls' as const }
    expect(planDelivery(source, 'hlsjs', () => direct())).toBe('direct')
    expect(planDelivery(source, 'hlsjs', (kind) => (kind === 'segment' ? direct() : unsupported()))).toBe('unsupported')
    // An unsupported key vetoes playback even with direct segments.
    expect(planDelivery(source, 'hlsjs', (kind) => (kind === 'key' ? unsupported() : direct()))).toBe('unsupported')
  })
  it('guesses the playback engine the way media-engine prefers it', () => {
    expect(guessEngine({ hls: true, dash: true, nativeHls: true })).toBe('hlsjs')
    expect(guessEngine({ hls: true, dash: false, nativeHls: true })).toBe('native')
    expect(guessEngine({ hls: true, dash: false, nativeHls: false })).toBe('hlsjs')
  })
})

describe('capability registry', () => {
  it('defaults to unknown and promotes only after sustained success', async () => {
    const registry = createCapabilityRegistry(createMemoryPlaybackStore())
    expect(await registry.get('cdn.example', 'segment', 'hlsjs')).toBeNull()
    for (let i = 0; i < 4; i++) {
      expect((await registry.record('cdn.example', 'segment', 'hlsjs', true)).capability).toBe('unsupported')
    }
    const promoted = await registry.record('cdn.example', 'segment', 'hlsjs', true)
    expect(promoted.capability).toBe('direct')
    expect(promoted.confidence).toBe(1)
    expect(await registry.get('cdn.example', 'segment', 'hlsjs')).toMatchObject({ capability: 'direct', probes: 5 })
  })
  it('demotes instantly on failure and isolates kinds and engines', async () => {
    const registry = createCapabilityRegistry(createMemoryPlaybackStore())
    for (let i = 0; i < 5; i++) await registry.record('cdn.example', 'segment', 'hlsjs', true)
    expect((await registry.record('cdn.example', 'segment', 'hlsjs', false)).capability).toBe('unsupported')
    expect(await registry.get('cdn.example', 'manifest', 'hlsjs')).toBeNull()
    expect(await registry.get('cdn.example', 'segment', 'native')).toBeNull()
  })
  it('fails open when the store is unavailable', async () => {
    const broken = {
      get: () => Promise.reject(new Error('valkey down')),
      set: () => Promise.reject(new Error('valkey down')),
      close: () => Promise.resolve(),
    }
    const registry = createCapabilityRegistry(broken)
    expect(await registry.get('cdn.example', 'segment', 'hlsjs')).toBeNull()
    await expect(registry.record('cdn.example', 'segment', 'hlsjs', true)).resolves.toMatchObject({ capability: 'unsupported' })
  })
  it('keys rows by lowercased host, kind, and engine', () => {
    expect(deliveryKey('CDN.Example', 'segment', 'hlsjs')).toBe('delivery:v2:cdn.example:segment:hlsjs')
  })
})

describe('planSource', () => {
  const seedDirect = async (store: ReturnType<typeof createMemoryPlaybackStore>, host: string) => {
    const registry = createCapabilityRegistry(store)
    for (const kind of ['manifest', 'segment', 'key'] as const) {
      for (let i = 0; i < 5; i++) await registry.record(host, kind, 'hlsjs', true)
    }
    return registry
  }
  it('plans full with an empty registry and for unparsable urls', async () => {
    const registry = createCapabilityRegistry(createMemoryPlaybackStore())
    const source = { headers: {}, type: 'hls' as const, url: 'https://cdn.example/master.m3u8' }
    expect(await planSource(source, 'hlsjs', registry)).toBe('unsupported')
    expect(await planSource({ headers: {}, type: 'hls' as const, url: 'not a url' }, 'hlsjs', registry)).toBe('unsupported')
    expect(await planSource({ headers: {}, type: 'dash' as const, url: 'https://cdn.example/manifest.mpd' }, 'hlsjs', registry)).toBe('unsupported')
  })
  it('plans direct from complete measured rows', async () => {
    const store = createMemoryPlaybackStore()
    const registry = await seedDirect(store, 'cdn.example')
    expect(await planSource({ headers: {}, type: 'hls' as const, url: 'https://cdn.example/master.m3u8' }, 'hlsjs', registry)).toBe('direct')
    expect(
      await planSource({ headers: { referer: 'https://provider.example/' }, type: 'hls' as const, url: 'https://cdn.example/master.m3u8' }, 'hlsjs', registry),
    ).toBe('direct')
  })
})

describe('direct-playability probes', () => {
  const hosts = ['media.example']
  const signal = new AbortController().signal
  it('requires 2xx playable bytes and CORS for hlsjs', async () => {
    const open = stub(200, { 'content-type': 'video/mp2t', 'access-control-allow-origin': '*' })
    expect(await probeDirectSupport('https://media.example/seg.ts', hosts, 'hlsjs', open, signal)).toBe(true)
    const closed = stub(200, { 'content-type': 'video/mp2t' })
    expect(await probeDirectSupport('https://media.example/seg.ts', hosts, 'hlsjs', closed, signal)).toBe(false)
    expect(await probeDirectSupport('https://media.example/seg.ts', hosts, 'native', closed, signal)).toBe(true)
    expect(await probeDirectSupport('https://media.example/seg.ts', hosts, 'hlsjs', stub(404), signal)).toBe(false)
    expect(await probeDirectSupport('https://media.example/seg.ts', hosts, 'native', stub(200, { 'content-type': 'text/html' }), signal)).toBe(false)
    expect(await probeDirectSupport('https://media.example/seg.ts', hosts, 'native', () => Promise.reject(new Error('down')), signal)).toBe(false)
  })
  it('accepts echo-style CORS only with the matching origin', async () => {
    const echo = stub(200, { 'content-type': 'video/mp2t', 'access-control-allow-origin': 'https://consumit.online' })
    expect(await probeDirectSupport('https://media.example/seg.ts', hosts, 'hlsjs', echo, signal, 'https://consumit.online')).toBe(true)
    expect(await probeDirectSupport('https://media.example/seg.ts', hosts, 'hlsjs', echo, signal)).toBe(false)
    expect(await probeDirectSupport('https://media.example/seg.ts', hosts, 'hlsjs', echo, signal, 'https://other.example')).toBe(false)
  })
  it('runs targets with bounded concurrency and records every outcome', async () => {
    const registry = createCapabilityRegistry(createMemoryPlaybackStore())
    const transport = vi.fn<MediaTransport>(async (url) => ({
      url,
      status: 200,
      headers: new Headers({ 'content-type': 'video/mp2t', 'access-control-allow-origin': '*' }),
      body: Readable.from([Buffer.alloc(1)]),
    }))
    await runDeliveryProbes(
      [
        { url: 'https://media.example/a.ts', host: 'media.example', kind: 'segment', engine: 'hlsjs' },
        { url: 'https://media.example/b.ts', host: 'media.example', kind: 'segment', engine: 'native' },
      ],
      hosts,
      registry,
      transport,
      signal,
      1,
    )
    expect(transport).toHaveBeenCalledTimes(2)
    // Single successes count but do not promote yet.
    expect(await registry.get('media.example', 'segment', 'hlsjs')).toMatchObject({ capability: 'unsupported', probes: 1, successes: 1 })
  })
  it('records nothing once aborted', async () => {
    const registry = createCapabilityRegistry(createMemoryPlaybackStore())
    const controller = new AbortController()
    controller.abort()
    await runDeliveryProbes(
      [{ url: 'https://media.example/a.ts', host: 'media.example', kind: 'segment', engine: 'hlsjs' }],
      hosts,
      registry,
      stub(),
      controller.signal,
    )
    expect(await registry.get('media.example', 'segment', 'hlsjs')).toBeNull()
  })
  it('threads capabilities through the planner end to end', async () => {
    const registry = createCapabilityRegistry(createMemoryPlaybackStore())
    const source = { headers: { referer: 'https://provider.example/' }, type: 'hls' as const }
    const capable = (): DeliveryCapability | null => null
    expect(planDelivery(source, 'hlsjs', capable)).toBe('unsupported')
    for (let i = 0; i < 5; i++) await registry.record('media.example', 'segment', 'hlsjs', true)
    const row = await registry.get('media.example', 'segment', 'hlsjs')
    expect(planDelivery(source, 'hlsjs', (kind) => (kind === 'segment' ? row?.capability ?? null : null))).toBe('unsupported')
  })
})
