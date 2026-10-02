import { describe, expect, it, vi } from 'vitest'
import type { PlaybackSession } from '@consumit/contracts'
import { createPlaybackCoordinator, scheduleSourceRefresh, type PlaybackTransport } from './playback-coordinator'

const source = { id: 'first', providerId: 'direct', type: 'hls' as const, src: 'https://media.example/a.m3u8', delivery: 'direct' as const, expiresAt: '2099-01-01T00:00:00.000Z', subtitles: [], skipSegments: [] }
const session: PlaybackSession = { id: '00000000-0000-4000-8000-000000000001', ref: { kind: 'movie', id: 1 }, source, expiresAt: '2099-01-01T00:00:00.000Z', fallbackCount: 0, capabilities: { refresh: true, fallback: true, externalSubtitles: false } }
const signal = new AbortController().signal

function fixture(refresh: PlaybackSession, fallback: PlaybackSession) {
  const recover = vi.fn<PlaybackTransport['recover']>(async (_session, action) => action === 'refresh' ? refresh : fallback)
  const transport: PlaybackTransport = { resolve: vi.fn(async () => session), providers: vi.fn(async () => []), recover, switch: vi.fn(async () => fallback) }
  return { coordinator: createPlaybackCoordinator(transport, () => 1000), recover }
}

describe('shared playback coordinator', () => {
  it('falls back immediately when direct media is blocked by required headers', async () => {
    const { coordinator, recover } = fixture(session, session)
    await coordinator.recover(session, 'network', signal, 'headers')
    expect(recover.mock.calls.map((call) => call[1])).toEqual(['fallback'])
  })
  it('refreshes an expiring source without spending a fallback', async () => {
    const refreshed = { ...session, source: { ...source, src: 'https://media.example/b.m3u8' } }
    const { coordinator, recover } = fixture(refreshed, session)
    expect(await coordinator.recover(session, 'expired', signal)).toEqual(refreshed)
    expect(recover).toHaveBeenCalledTimes(1)
    expect(recover.mock.calls[0]?.[1]).toBe('refresh')
  })

  it('moves to fallback when the refresh returns the same unplayable URL', async () => {
    const stale = { ...session, source: { ...source, expiresAt: new Date(10_000).toISOString() } }
    const backup = { ...session, source: { ...source, providerId: 'backup', src: 'https://media.example/backup.m3u8', delivery: 'direct' as const } }
    const { coordinator, recover } = fixture(stale, backup)
    expect(await coordinator.recover(stale, 'network', signal)).toEqual(backup)
    expect(recover.mock.calls.map((call) => call[1])).toEqual(['refresh', 'fallback'])
  })

  it('skips refresh for 410 Gone but renews the selected provider repeatedly', async () => {
    const refreshed = { ...session, source: { ...source, src: 'https://media.example/b.m3u8' } }
    const backup = { ...session, source: { ...source, providerId: 'backup', src: 'https://media.example/backup.m3u8', delivery: 'direct' as const } }
    const { coordinator, recover } = fixture(refreshed, backup)
    await coordinator.recover(session, 'gone', signal)
    expect(recover.mock.calls.map((call) => call[1])).toEqual(['fallback'])
    recover.mockClear()
    await coordinator.recover(session, 'network', signal)
    await coordinator.recover(refreshed, 'expired', signal)
    expect(recover.mock.calls.map((call) => call[1])).toEqual(['refresh', 'refresh'])
  })

  it('accepts a renewed expiry for the same URL without changing providers', async () => {
    const short = { ...session, source: { ...source, expiresAt: '2026-01-01T00:00:20.000Z' } }
    const renewed = { ...short, source: { ...short.source, expiresAt: '2026-01-01T00:03:00.000Z' } }
    const { coordinator, recover } = fixture(renewed, session)
    expect(await coordinator.recover(short, 'expired', signal)).toEqual(renewed)
    expect(recover.mock.calls.map((call) => call[1])).toEqual(['refresh'])
  })

  it('switches past a failing manual choice once without retrying a provider', async () => {
    const backup = { ...session, source: { ...source, providerId: 'backup', src: 'https://media.example/backup.m3u8', delivery: 'direct' as const } }
    const switchProvider = vi.fn(async (_current: PlaybackSession, id: string) => {
      if (id === 'broken') throw new Error('offline')
      return backup
    })
    const coordinator = createPlaybackCoordinator({ resolve: vi.fn(), providers: vi.fn(), recover: vi.fn(), switch: switchProvider })
    const next = await coordinator.switchAvailable(session, 'broken', [
      { id: 'broken', label: 'Broken', health: 'ok', available: true },
      { id: 'backup', label: 'Backup', health: 'ok', available: true },
    ] as never, signal)
    expect(next).toEqual(backup)
    expect(switchProvider.mock.calls.map((call) => call[1])).toEqual(['broken', 'backup'])
  })

  it('falls back immediately after a media decoder failure', async () => {
    const { coordinator, recover } = fixture(session, session)
    await coordinator.recover(session, 'media', signal)
    expect(recover.mock.calls.map((call) => call[1])).toEqual(['fallback'])
  })

  it('hands an honest failure to the caller when refresh and fallback both fail', async () => {
    const recover = vi.fn<PlaybackTransport['recover']>(async () => { throw new Error('No compatible playback source is available.') })
    const transport: PlaybackTransport = { resolve: vi.fn(async () => session), providers: vi.fn(async () => []), recover, switch: vi.fn() }
    const coordinator = createPlaybackCoordinator(transport, () => 1000)
    await expect(coordinator.recover(session, 'expired', signal)).rejects.toThrow('No compatible playback source')
    expect(recover.mock.calls.map((call) => call[1])).toEqual(['refresh', 'fallback'])
  })

  it('forwards the browser delivery failure to recovery', async () => {
    const { coordinator, recover } = fixture(session, session)
    await coordinator.recover(session, 'network', signal, 'segment')
    expect(recover.mock.calls[0]?.[1]).toBe('refresh')
    expect(recover.mock.calls[0]?.[2]).toMatchObject({ reason: 'network', deliveryFailure: 'segment' })
  })

  it('does not overflow a timer for a far-future source expiry', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
      const refresh = vi.fn()
      const cancel = scheduleSourceRefresh('2099-01-01T00:00:00.000Z', refresh)
      vi.advanceTimersByTime(3_600_000)
      expect(refresh).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(1)
      cancel()
      expect(vi.getTimerCount()).toBe(0)
    } finally { vi.useRealTimers() }
  })
})
