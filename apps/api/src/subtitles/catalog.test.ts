import { describe, expect, it } from 'vitest'

import { catalogIdentity, checksumVtt, servedStorageKey, toServedTracks, vttFacts } from './catalog.ts'

describe('catalogIdentity', () => {
  it('keys movies, series, and anime canonically with zero defaults', () => {
    expect(catalogIdentity({ kind: 'movie', id: 550 })).toEqual({ kind: 'MOVIE', tmdbId: 550, anilistId: 0, season: 0, episode: 0 })
    expect(catalogIdentity({ kind: 'series', id: 1396, season: 2, episode: 7 })).toEqual({ kind: 'SERIES', tmdbId: 1396, anilistId: 0, season: 2, episode: 7 })
    expect(catalogIdentity({ kind: 'anime', id: 21, episode: 1001 })).toEqual({ kind: 'ANIME', tmdbId: 0, anilistId: 21, season: 0, episode: 1001 })
  })
})

describe('checksumVtt and vttFacts', () => {
  const VTT = 'WEBVTT\n\n00:00.000 --> 00:04.000\nHi\n\n00:05.000 --> 01:00.000\nYo\n'
  it('checksums bytes deterministically', () => {
    expect(checksumVtt(VTT)).toBe(checksumVtt(VTT))
    expect(checksumVtt(VTT)).toHaveLength(64)
    expect(checksumVtt(`${VTT} `)).not.toBe(checksumVtt(VTT))
  })

  it('counts cues and spans durations', () => {
    expect(vttFacts(VTT)).toEqual({ cueCount: 2, durationMs: 3600000 })
    expect(vttFacts('WEBVTT\n\nno cues\n')).toEqual({ cueCount: 0, durationMs: null })
  })
})

describe('servedStorageKey and toServedTracks', () => {
  it('extracts first-party keys and skips direct tracks', () => {
    expect(servedStorageKey('https://api.example/v1/subtitles/file/abcdef0123456789')).toBe('abcdef0123456789')
    expect(servedStorageKey('https://cdn.example/en.vtt')).toBeNull()
  })

  it('maps catalog rows back to served tracks with signals', () => {
    const tracks = toServedTracks([{
      language: 'en', label: 'English (yify)', format: 'vtt' as const, provider: 'yify',
      storageKey: 'abcdef0123456789', originalExt: 'srt', hi: false, rating: 4, releaseTag: 'BluRay',
    }], 'https://api.example')
    expect(tracks).toHaveLength(1)
    expect(tracks[0]).toMatchObject({
      id: 'sub-yify-abcdef01',
      url: 'https://api.example/v1/subtitles/file/abcdef0123456789',
      format: 'vtt',
      rating: 4,
      release: 'BluRay',
    })
  })
})
