import { afterEach, describe, expect, it, vi } from 'vitest'
import { PROGRESS_SYNC_INTERVAL_MS, hasMeaningfulProgressChange, progressKey, readPlaybackProgress, writePlaybackProgress } from './playback-progress'

const ref = { kind: 'series' as const, id: 7, season: 2, episode: 3 }
afterEach(() => { localStorage.clear(); vi.unstubAllGlobals() })
describe('canonical playback progress', () => {
  it('keeps guest, member, and episode records separate without provider identity', async () => {
    await writePlaybackProgress(ref, 35, 90, false)
    expect(await readPlaybackProgress(ref, new AbortController().signal)).toBe(35)
    expect(await readPlaybackProgress({ ...ref, episode: 4 }, new AbortController().signal)).toBe(0)
    expect(progressKey(ref, 'member')).not.toBe(progressKey(ref))
  })
  it('stamps local writes so continue watching can sort last-watched-first', async () => {
    await writePlaybackProgress(ref, 35, 90, false)
    const stored = JSON.parse(localStorage.getItem(progressKey(ref)) ?? 'null') as { updatedAt?: unknown }
    expect(typeof stored.updatedAt).toBe('string')
    expect(Number.isNaN(Date.parse(stored.updatedAt as string))).toBe(false)
    expect(await readPlaybackProgress(ref, new AbortController().signal)).toBe(35)
  })
  it('retains a local member copy when API writes fail and resumes it offline', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline')))
    await expect(writePlaybackProgress(ref, 21, 90, false, 'member')).rejects.toThrow()
    expect(await readPlaybackProgress(ref, new AbortController().signal, 'member')).toBe(21)
    expect(await readPlaybackProgress(ref, new AbortController().signal)).toBe(0)
  })
  it('treats a first-watch 204 as an empty server record and keeps a local member resume point', async () => {
    localStorage.setItem(progressKey(ref, 'member'), JSON.stringify({ ...ref, positionSeconds: 18, durationSeconds: 90, completed: false }))
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })))
    await expect(readPlaybackProgress(ref, new AbortController().signal, 'member')).resolves.toBe(18)
  })
  it('does not resume completed media or persist invalid clocks', async () => {
    await writePlaybackProgress(ref, 90, 90, true)
    expect(await readPlaybackProgress(ref, new AbortController().signal)).toBe(0)
    await writePlaybackProgress({ ...ref, episode: 4 }, 1, Infinity, false)
    expect(localStorage.getItem(progressKey({ ...ref, episode: 4 }))).toBeNull()
  })
  it('keeps a completion attempt in the member write even when media duration is unknown', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    const completionId = '82ef6eaf-9248-4b77-820d-6d7bc025c823'
    await writePlaybackProgress(ref, 42, 0, true, 'member', true, completionId)
    const request = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(request[1].keepalive).toBe(true)
    expect(JSON.parse(String(request[1].body))).toMatchObject({ completed: true, completionId, episode: 3, positionSeconds: 42 })
  })
  it('coalesces interval writes to meaningful changes within a 20-30 second cadence', () => {
    expect(PROGRESS_SYNC_INTERVAL_MS).toBeGreaterThanOrEqual(20000)
    expect(PROGRESS_SYNC_INTERVAL_MS).toBeLessThanOrEqual(30000)
    expect(hasMeaningfulProgressChange(undefined, { position: 0, completed: false })).toBe(true)
    expect(hasMeaningfulProgressChange({ position: 10, completed: false }, { position: 11, completed: false })).toBe(false)
    expect(hasMeaningfulProgressChange({ position: 10, completed: false }, { position: 12, completed: false })).toBe(true)
    expect(hasMeaningfulProgressChange({ position: 90, completed: false }, { position: 90, completed: true })).toBe(true)
  })
})
