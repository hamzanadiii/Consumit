import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStaticProvider, type ProviderRegistration } from '@consumit/provider-sdk'

import { createProbeScheduler } from './probe.ts'

const ref = { kind: 'movie' as const, id: 550 }

function registration(id: string, resolve?: ProviderRegistration['adapter']['resolve']): ProviderRegistration {
  const adapter = createStaticProvider(id, [{ ref, sources: [] }])
  if (resolve) adapter.resolve = resolve
  return {
    adapter, enabled: true, approvedRegions: ['US'], mediaHosts: ['media.example'],
    upstreamGroup: id, concurrency: 2, requestsPerMinute: 30,
    mediaKinds: ['movie', 'series'],
  }
}

const source = { key: 'main', url: 'https://media.example/v.m3u8', type: 'hls' as const, language: 'original', expiresAt: '2099-01-01T00:00:00.000Z', headers: {}, subtitles: [] }

describe('provider probe scheduler', () => {
  afterEach(() => { vi.useRealTimers() })

  it('records ok and empty outcomes per provider without throwing', async () => {
    const good = registration('good', async () => ({ ok: true as const, sources: [source] }))
    const bad = registration('bad', async () => ({ ok: false as const, code: 'empty' as const, retryable: false }))
    const scheduler = createProbeScheduler({ providers: [good, bad], region: 'US', intervalMs: 0, gapMs: 0, timeoutMs: 5000 })
    await scheduler.runOnce()
    const status = await scheduler.status()
    expect(status['good:movie:US']).toMatchObject({ ok: true })
    expect(status['bad:movie:US']).toMatchObject({ ok: false, code: 'empty' })
    expect(typeof status['good:movie:US']!.ms).toBe('number')
  })

  it('skips disabled providers and survives throwing adapters', async () => {
    const off = registration('off')
    off.enabled = false
    const boom = registration('boom', async () => { throw new Error('downstream blew up') })
    const scheduler = createProbeScheduler({ providers: [off, boom], region: 'US', intervalMs: 0, gapMs: 0, timeoutMs: 5000 })
    await scheduler.runOnce()
    const status = await scheduler.status()
    expect(status['off:movie:US']).toBeUndefined()
    expect(status['boom:movie:US']).toMatchObject({ ok: false, code: 'error' })
  })

  it('picks the anime reference for anime-only providers', async () => {
    const seen: Array<{ ref: unknown; audioLanguage: string }> = []
    const anime = registration('ani', async (input) => { seen.push({ ref: input.ref, audioLanguage: input.audioLanguage }); return { ok: true as const, sources: [source] } })
    anime.mediaKinds = ['anime']
    const scheduler = createProbeScheduler({ providers: [anime], region: 'US', intervalMs: 0, gapMs: 0, timeoutMs: 5000 })
    await scheduler.runOnce()
    expect(seen).toMatchObject([{ ref: { kind: 'anime', id: 21, episode: 1 }, audioLanguage: 'en' }])
  })

  it('uses a provider-specific probe fixture for selective catalogs', async () => {
    const seen: unknown[] = []
    const anime = registration('ani', async (input) => { seen.push(input.ref); return { ok: true as const, sources: [source] } })
    anime.mediaKinds = ['anime']
    anime.probes = { anime: { ref: { kind: 'anime', id: 172463, episode: 1 }, audioLanguage: 'ja' } }
    const scheduler = createProbeScheduler({ providers: [anime], region: 'US', intervalMs: 0, gapMs: 0 })
    await scheduler.runOnce()
    expect(seen).toMatchObject([{ kind: 'anime', id: 172463, episode: 1 }])
  })

  it('keeps probe results separate for configured regions', async () => {
    const seen: string[] = []
    const provider = registration('regional', async (input) => { seen.push(input.region); return { ok: true as const, sources: [source] } })
    provider.approvedRegions = ['IT', 'US']
    provider.mediaKinds = ['movie']
    const scheduler = createProbeScheduler({ providers: [provider], region: 'US', intervalMs: 0, gapMs: 0 })
    await scheduler.runOnce()
    expect(seen).toEqual(['US', 'IT'])
    expect(await scheduler.status()).toMatchObject({ 'regional:movie:US': { ok: true }, 'regional:movie:IT': { ok: true } })
  })

  it('does not run overlapping cycles and stops cleanly', async () => {
    vi.useFakeTimers()
    let calls = 0
    const slow = registration('slow', async () => { calls++; await new Promise((resolve) => setTimeout(resolve, 10000)); return { ok: true as const, sources: [source] } })
    const scheduler = createProbeScheduler({ providers: [slow], region: 'US', intervalMs: 60000, gapMs: 0, timeoutMs: 30000 })
    scheduler.start()
    scheduler.start()
    await vi.advanceTimersByTimeAsync(10000)
    expect(calls).toBe(1)
    scheduler.stop()
    scheduler.stop()
  })
  it('advances past adapters that ignore cancellation', async () => {
    vi.useFakeTimers()
    const stuck = registration('stuck', () => new Promise(() => undefined))
    stuck.mediaKinds = ['movie']
    const healthy = registration('healthy', async () => ({ ok: true as const, sources: [source] }))
    healthy.mediaKinds = ['movie']
    const scheduler = createProbeScheduler({ providers: [stuck, healthy], region: 'US', intervalMs: 0, gapMs: 0, timeoutMs: 1000 })
    const work = scheduler.runOnce()
    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(10)
    await work
    const status = await scheduler.status()
    expect(status['stuck:movie:US']).toMatchObject({ ok: false, code: 'error' })
    expect(status['healthy:movie:US']).toMatchObject({ ok: true })
  })
})
