import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useEpisodeArt } from './use-episode-art'

const mocks = vi.hoisted(() => ({ fetchEpisode: vi.fn() }))
vi.mock('@/lib/anime-browser', () => ({ browserAnimeEpisode: (...args: unknown[]) => mocks.fetchEpisode(...args) }))

const ART = { title: 'Ballad', description: 'A past.', thumbnail: 'https://media.kitsu.app/x.jpeg' }

async function flush() {
  await act(async () => {})
}

describe('useEpisodeArt', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.fetchEpisode.mockReset()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns art on first hit and skips covered or upcoming episodes', async () => {
    mocks.fetchEpisode.mockResolvedValue(ART)
    const { result, unmount } = renderHook(() => useEpisodeArt(1, 5, {}))
    await flush()
    expect(result.current).toMatchObject({ title: 'Ballad' })
    expect(mocks.fetchEpisode).toHaveBeenCalledTimes(1)
    unmount()

    mocks.fetchEpisode.mockClear()
    const covered = renderHook(() => useEpisodeArt(1, 5, { covered: true }))
    const upcoming = renderHook(() => useEpisodeArt(1, 5, { upcoming: true }))
    await flush()
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(mocks.fetchEpisode).not.toHaveBeenCalled()
    expect(covered.result.current).toBeNull()
    expect(upcoming.result.current).toBeNull()
    covered.unmount()
    upcoming.unmount()
  })

  it('retries once after a miss and then settles', async () => {
    mocks.fetchEpisode.mockResolvedValueOnce(null).mockResolvedValue(ART)
    const { result, unmount } = renderHook(() => useEpisodeArt(1, 5, {}))
    await flush()
    expect(result.current).toBeNull()
    expect(mocks.fetchEpisode).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000) })
    await flush()
    expect(result.current).toMatchObject({ thumbnail: 'https://media.kitsu.app/x.jpeg' })
    expect(mocks.fetchEpisode).toHaveBeenCalledTimes(2)
    unmount()
  })

  it('stays null after two misses without further traffic', async () => {
    mocks.fetchEpisode.mockResolvedValue(null)
    const { result, unmount } = renderHook(() => useEpisodeArt(1, 5, {}))
    await flush()
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    await flush()
    expect(result.current).toBeNull()
    expect(mocks.fetchEpisode).toHaveBeenCalledTimes(2)
    unmount()
  })
})
