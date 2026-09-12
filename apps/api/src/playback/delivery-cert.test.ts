import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { certifyExpiry, certifyTimeline, certifyVariantSeek, probeSeekSupport } from './delivery-cert.ts'
import type { MediaTransport } from './transport.ts'

const signal = new AbortController().signal
const film = (seconds: number, count: number) =>
  `#EXTM3U\n${Array.from({ length: count }, () => `#EXTINF:${seconds / count},\nseg.ts`).join('\n')}`
const transportFor = (routes: Record<string, { status: number; headers: Record<string, string>; body: Buffer }>): MediaTransport =>
  (async (url) => {
    const found = routes[url]
    if (!found) return { url, status: 404, headers: new Headers(), body: Readable.from([]) }
    return { url, status: found.status, headers: new Headers(found.headers), body: Readable.from([found.body]) }
  })
const seg = (bytes: number, contentType = 'video/mp2t', status = 200) => ({
  status,
  headers: { 'content-type': contentType },
  body: Buffer.alloc(bytes),
})

describe('timeline certification', () => {
  it('rejects wrong-title durations and stays unknown without evidence', () => {
    // 2-hour film expectation vs 3-minute clip actual.
    expect(certifyTimeline(film(180, 30), 7200)).toMatchObject({ plausible: false })
    expect(certifyTimeline(film(7000, 700), 7200)).toMatchObject({ plausible: true })
    // 45-minute episode expectation.
    expect(certifyTimeline(film(2700, 270), 2700)).toMatchObject({ plausible: true })
    expect(certifyTimeline(film(150, 15), 2700)).toMatchObject({ plausible: false })
    // No runtime expectation, or master without timeline: unknown, not failed.
    expect(certifyTimeline(film(7000, 700), undefined)).toMatchObject({ plausible: null })
    expect(certifyTimeline('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nlow.m3u8', 7200)).toMatchObject({ durationSec: undefined, plausible: null })
    expect(certifyTimeline('not a manifest', 7200)).toMatchObject({ plausible: false })
  })
})

describe('seek certification', () => {
  const hosts = ['cdn.example']
  const variant = (count: number) =>
    `#EXTM3U\n${Array.from({ length: count }, (_, i) => `#EXTINF:6,\nhttps://cdn.example/s${i}.ts`).join('\n')}`
  it('proves byte ranges serve with bounded cost', async () => {
    const url = 'https://cdn.example/s0.ts'
    expect(await probeSeekSupport(url, hosts, transportFor({ [url]: seg(100000) }), signal)).toBe(true)
    const partial = transportFor({ [url]: { status: 206, headers: { 'content-type': 'video/mp2t' }, body: Buffer.alloc(64) } })
    expect(await probeSeekSupport(url, hosts, partial, signal)).toBe(true)
    expect(await probeSeekSupport(url, hosts, transportFor({}), signal)).toBe(false)
    expect(await probeSeekSupport(url, hosts, transportFor({ [url]: seg(10, 'text/html') }), signal)).toBe(false)
    expect(await probeSeekSupport(url, hosts, transportFor({ [url]: seg(0) }), signal)).toBe(false)
    expect(await probeSeekSupport(url, hosts, () => Promise.reject(new Error('down')), signal)).toBe(false)
  })
  it('checks the 50% and 95% timeline positions', async () => {
    const routes: Record<string, { status: number; headers: Record<string, string>; body: Buffer }> = {}
    for (let i = 0; i < 100; i++) routes[`https://cdn.example/s${i}.ts`] = seg(1000)
    // Middle segment missing: seek-50 fails, seek-95 passes.
    const broken = { ...routes }
    delete broken['https://cdn.example/s50.ts']
    const transport = transportFor(broken)
    expect(await certifyVariantSeek(variant(100), 'https://cdn.example/v.m3u8', hosts, transport, signal)).toEqual({ seek50: false, seek95: true })
    expect(await certifyVariantSeek(variant(100), 'https://cdn.example/v.m3u8', hosts, transportFor(routes), signal)).toEqual({ seek50: true, seek95: true })
    expect(await certifyVariantSeek('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nlow.m3u8', 'https://cdn.example/m.m3u8', hosts, transportFor(routes), signal)).toEqual({
      seek50: null,
      seek95: null,
    })
    expect(await certifyVariantSeek('garbage', 'https://cdn.example/m.m3u8', hosts, transportFor(routes), signal)).toEqual({ seek50: null, seek95: null })
  })
})

describe('expiry certification', () => {
  const now = Date.parse('2026-09-12T12:00:00.000Z')
  it('enforces a freshness floor for signed urls', () => {
    expect(certifyExpiry('2026-09-12T14:00:00.000Z', now)).toMatchObject({ fresh: true })
    expect(certifyExpiry('2026-09-12T14:00:00.000Z', now).horizonSec).toBe(7200)
    expect(certifyExpiry('2026-09-12T12:04:30.000Z', now)).toMatchObject({ fresh: true })
    expect(certifyExpiry('2026-09-12T12:03:00.000Z', now)).toMatchObject({ fresh: false })
    expect(certifyExpiry('not-a-date', now)).toMatchObject({ horizonSec: undefined, fresh: false })
  })
})
