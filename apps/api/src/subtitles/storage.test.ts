import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { createMemoryPlaybackStore } from '../playback/state.ts'
import { contentPath, createDiskFileStore, createStoreFileStore } from './storage.ts'

describe('contentPath', () => {
  it('keys movies, series, and anime canonically', () => {
    expect(contentPath({ type: 'movie', tmdbId: 550 }, 'en')).toBe(join('tmdb', 'movie', '550', '1', '1', 'en'))
    expect(contentPath({ type: 'tv', tmdbId: 1396, season: 2, episode: 7 }, 'ar')).toBe(join('tmdb', 'tv', '1396', '2', '7', 'ar'))
    expect(contentPath({ type: 'anime', anilistId: 21, episode: 1001 }, 'en')).toBe(join('anime', '21', '1001', 'en'))
  })

  it('sanitizes bad languages and ids', () => {
    expect(contentPath({ type: 'movie' }, '../../x')).toContain('und')
    expect(contentPath({ type: 'movie' }, 'en')).toContain('0')
  })
})

describe('createStoreFileStore', () => {
  it('round-trips converted VTT and has no originals', async () => {
    const files = createStoreFileStore(createMemoryPlaybackStore())
    expect(await files.getVtt('nope')).toBeNull()
    expect(await files.getVtt('short')).toBeNull()
    await files.putVtt('abcdef0123456789', 'WEBVTT\n\n00:00.000 --> 00:04.000\nHi\n', { content: 'tmdb/movie/1/1/1/en', ttlSeconds: 60 })
    expect(await files.getVtt('abcdef0123456789')).toContain('WEBVTT')
    expect(await files.getOriginal('abcdef0123456789')).toBeNull()
  })
})

describe('createDiskFileStore', () => {
  async function dir() {
    return mkdtemp(join(tmpdir(), 'consumit-subs-'))
  }

  it('round-trips VTT and originals under content paths', async () => {
    const root = await dir()
    try {
      const files = createDiskFileStore(root, createMemoryPlaybackStore())
      const key = 'abcdef0123456789'
      await files.putVtt(key, 'WEBVTT\n\n00:00.000 --> 00:04.000\nHi\n', { content: join('tmdb', 'movie', '550', '1', '1', 'en'), ttlSeconds: 3600 })
      await files.putOriginal(key, { bytes: Buffer.from('[Events]\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Hi', 'utf8'), ext: 'ass' }, { content: join('tmdb', 'movie', '550', '1', '1', 'en'), ttlSeconds: 3600 })
      expect(await files.getVtt(key)).toContain('WEBVTT')
      expect(await files.getOriginal(key)).toMatchObject({ ext: 'ass' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects non-hex keys and expires by mtime', async () => {
    const root = await dir()
    try {
      const files = createDiskFileStore(root, createMemoryPlaybackStore())
      expect(await files.getVtt('../escape')).toBeNull()
      expect(await files.getOriginal('../escape')).toBeNull()
      const key = '1234567890abcdef'
      await files.putVtt(key, 'WEBVTT\n\n00:00.000 --> 00:04.000\nHi\n', { content: join('tmdb', 'movie', '1', '1', '1', 'en'), ttlSeconds: -1 })
      expect(await files.getVtt(key)).toBeNull()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('reads as a miss without an index entry', async () => {
    const root = await dir()
    try {
      const files = createDiskFileStore(root, createMemoryPlaybackStore())
      // Orphan file with no index: unreachable until re-indexed by search.
      const content = join('tmdb', 'movie', '9', '1', '1', 'en')
      const { mkdir } = await import('node:fs/promises')
      await mkdir(join(root, content), { recursive: true })
      await writeFile(join(root, content, 'ffffffffffffffff.vtt'), 'WEBVTT\n\n00:00.000 --> 00:04.000\nHi\n', 'utf8')
      expect(await files.getVtt('ffffffffffffffff')).toBeNull()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
