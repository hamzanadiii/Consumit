import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadResumeEntries, readOwnedProgress, hideResumeEntry } from './continue-watching'
const record = (kind = 'anime', id = 21, episode = 3, updatedAt = '2026-10-14T12:00:00Z') => ({ kind, id, ...(kind === 'anime' ? { episode } : {}), positionSeconds: 120, durationSeconds: 1200, completed: false, updatedAt })
function store(owner: string, row: ReturnType<typeof record>) { localStorage.setItem(`consumit.progress:${owner}:${row.kind}:${row.id}:0:${row.episode ?? 0}`, JSON.stringify(row)) }
afterEach(() => { localStorage.clear(); vi.unstubAllGlobals() })
describe('owned Continue watching', () => {
  it('keeps AniList identity distinct from a colliding movie id and reads only the current owner', async () => {
    store('guest', record()); store('guest', record('movie')); store('alice', record('anime', 999)); store('bob', record('movie', 1000))
    const rows = await loadResumeEntries()
    expect(rows.map(row => `${row.kind}:${row.id}`).sort()).toEqual(['anime:21', 'movie:21'])
    expect(rows.find(row => row.kind === 'anime')?.href).toBe('/watch/anime/21?episode=3')
    expect(readOwnedProgress('alice').map(row => row.id)).toEqual([999])
  })
  it('resumes account-only episodes and chooses the fresher device/account destination', async () => {
    store('alice', record('anime', 21, 2, '2026-10-13T12:00:00Z')); store('guest', record('movie', 999))
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ items: [{ ...record('anime', 21, 4), hiddenAt: null }, { ...record('movie', 55), hiddenAt: null }], nextCursor: null })))
    const rows = await loadResumeEntries('alice')
    expect(rows).toHaveLength(2); expect(rows.find(row => row.kind === 'anime')?.episode).toBe(4)
    expect(rows.some(row => row.id === 999)).toBe(false)
  })
  it('keeps progress when hidden and restores eligibility after watching again', async () => {
    store('guest', record()); const progressKey = 'consumit.progress:guest:anime:21:0:3'
    await hideResumeEntry({ kind: 'anime', id: 21 })
    expect(await loadResumeEntries()).toEqual([]); expect(localStorage.getItem(progressKey)).not.toBeNull()
    store('guest', record('anime', 21, 3, new Date(Date.now() + 1000).toISOString()))
    expect(await loadResumeEntries()).toHaveLength(1)
  })
  it('respects synced dismissal markers while keeping another account isolated', async () => {
    store('alice', record()); store('bob', record('movie', 777))
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ items: [{ ...record(), hiddenAt: '2026-10-14T12:01:00Z' }], nextCursor: null })))
    expect(await loadResumeEntries('alice')).toEqual([])
    expect(readOwnedProgress('bob')).toHaveLength(1)
  })
})
