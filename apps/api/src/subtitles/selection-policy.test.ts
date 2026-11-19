import { describe, expect, it } from 'vitest'
import {
  classifySubtitleMatch,
  hasExactSeasonEpisode,
  isSubtitleCandidateEligible,
  isSubtitleProviderEligible,
  matchesSubtitleEpisode,
  primarySubtitleLanguage,
  requiresExactEpisodeArchiveMatch,
  subtitleContentChecksum,
  subtitleLanguageRank,
} from './selection-policy.ts'
import type { RawSubtitle, SubtitleQuery } from './types.ts'

describe('subtitle choice policy', () => {
  it('requires trusted recording or release evidence and never uses cue span as proof', () => {
    const raw = { url: 'https://subs.example.com/one.srt', lang: 'en', label: 'English', provider: 'fixture', format: 'srt' as const, release: 'Film.2026.1080p.WEB.ReleaseGroup' }
    expect(classifySubtitleMatch(raw)).toBe('unverified')
    expect(classifySubtitleMatch(raw, { release: raw.release })).toBe('release')
    expect(classifySubtitleMatch({ ...raw, release: '1080p' }, { release: '1080p' })).toBe('unverified')
    expect(classifySubtitleMatch({ ...raw, recordingVersion: 'current', authority: 'current' }, { videoVersion: 'current' })).toBe('source')
    expect(classifySubtitleMatch({ ...raw, recordingVersion: 'other', authority: 'other' }, { videoVersion: 'current' })).toBe('unverified')
  })
  it('groups regional language variants without limiting available choices', () => {
    expect(primarySubtitleLanguage('eng')).toBe('en')
    expect(primarySubtitleLanguage('en-GB')).toBe('en')
  })
  it('deduplicates cue numbering but keeps genuinely different timing', () => {
    const base = 'WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.000\nHello\n'
    expect(subtitleContentChecksum(base)).toBe(subtitleContentChecksum(base.replace('\n1\n', '\nother\n')))
    expect(subtitleContentChecksum(base)).not.toBe(subtitleContentChecksum(base.replace('01.000', '01.500')))
  })

  it('owns provider availability and strict archive matching policy', () => {
    expect(['cinesrc', 'subf2m', 'stream-cinesrcframe-5afc928a'].every(id => !isSubtitleProviderEligible(id))).toBe(true)
    expect(['yify', 'stream-kyren-12345678'].every(isSubtitleProviderEligible)).toBe(true)
    expect(requiresExactEpisodeArchiveMatch('subsource')).toBe(true)
    expect(requiresExactEpisodeArchiveMatch('yify')).toBe(false)
  })

  it('matches exact season and episode identities without accepting ranges or numeric prefixes', () => {
    expect(hasExactSeasonEpisode('Show.S01E02', 1, 2)).toBe(true)
    expect(hasExactSeasonEpisode('Show.S01E20', 1, 2)).toBe(false)
    expect(hasExactSeasonEpisode('Show.S01E02-E03', 1, 2)).toBe(false)
    expect(hasExactSeasonEpisode('Show 1x02', 1, 2)).toBe(true)
  })

  it('accepts canonical absolute anime episodes and rejects conflicting explicit labels', () => {
    const anime: SubtitleQuery = { type: 'anime', season: 2, episode: 7, absoluteEpisode: 25 }
    expect(matchesSubtitleEpisode('Show.S01E25', anime)).toBe(true)
    expect(matchesSubtitleEpisode('Show Episode 25', anime)).toBe(true)
    expect(matchesSubtitleEpisode('Show.S02E08', anime)).toBe(false)
    const raw: RawSubtitle = { url: 'https://subs.example/episode.srt', lang: 'en', label: 'Show S01E02', format: 'srt', provider: 'example' }
    expect(isSubtitleCandidateEligible(raw, { type: 'tv', season: 1, episode: 2 })).toBe(true)
    expect(isSubtitleCandidateEligible({ ...raw, label: 'Show S01E03' }, { type: 'tv', season: 1, episode: 2 })).toBe(false)
    expect(isSubtitleCandidateEligible({ ...raw, identity: { tmdbId: 99 } }, { type: 'tv', tmdbId: 42, season: 1, episode: 2 })).toBe(false)
    expect(isSubtitleCandidateEligible({ ...raw, identity: { language: 'fr' } }, { type: 'tv', season: 1, episode: 2 })).toBe(false)
  })

  it('ranks regional language variants by their preferred base language', () => {
    expect(subtitleLanguageRank('en-US', ['fr', 'eng'])).toBe(1)
    expect(subtitleLanguageRank('pt-BR', ['en', 'ar'])).toBe(100 + 'p'.charCodeAt(0))
  })
})
