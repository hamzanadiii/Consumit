import { describe, expect, it } from 'vitest'

import {
  playbackProviderListSchema,
  catalogTitleSummarySchema,
  accountDeletionRequestSchema,
  apiErrorResponseSchema,
  avatarUrlSchema,
  bannerUrlSchema,
  loginRequestSchema,
  playbackProgressSchema,
  progressWriteRequestSchema,
  letterboxdImportSchema,
  passwordChangeRequestSchema,
  profileSchema,
  recoveryConfirmRequestSchema,
  registerRequestSchema,
  safeMemberSchema,
  setRatingRequestSchema,
  updateDiaryEntryRequestSchema,
  updateMemberListRequestSchema,
  updateMemberReviewRequestSchema,
  updateProfileRequestSchema,
  usernameAvailabilityResponseSchema,
  usernameSchema,
  titleHref,
  watchHref,
} from './index'

describe('catalog contracts', () => {
  it('builds canonical title and watch destinations', () => {
    expect(titleHref({ id: 550, kind: 'movie' })).toBe('/title/550')
    expect(titleHref({ id: 1399, kind: 'series' })).toBe('/series/1399')
    expect(watchHref({ id: 550, kind: 'movie' })).toBe('/watch/movie/550')
    expect(watchHref({ id: 1399, kind: 'series' }, { episode: 2, season: 3 })).toBe(
      '/watch/series/1399?season=3&episode=2',
    )
  })

  it('rejects malformed artwork URLs', () => {
    const result = catalogTitleSummarySchema.safeParse({
      backdropUrl: null,
      genreNames: [],
      id: 550,
      kind: 'movie',
      originalTitle: 'Fight Club',
      overview: '',
      popularity: 1,
      posterUrl: 'not-a-url',
      releaseDate: '1999-10-15',
      title: 'Fight Club',
      tmdbRating: 8.4,
      tmdbVoteCount: 10,
      year: 1999,
    })

    expect(result.success).toBe(false)
  })

  it('validates identity request shapes and rejects short passwords', () => {
    expect(registerRequestSchema.safeParse({ email: ' HAMZA@example.com ', password: 'long-enough-password', username: '  Hamza_8 ' }).data).toMatchObject({ email: 'hamza@example.com', username: 'hamza_8' })
    expect(registerRequestSchema.safeParse({ email: 'hamza@example.com', password: 'long-enough-password' }).success).toBe(false)
    expect(registerRequestSchema.safeParse({ email: 'not-an-email', password: 'long-enough-password' }).success).toBe(false)
    expect(loginRequestSchema.safeParse({ email: 'hamza@example.com', password: 'short' }).success).toBe(false)
    expect(
      safeMemberSchema.safeParse({ avatarStyle: 'halo', avatarUrl: null, createdAt: '2026-09-06T00:00:00.000Z', displayName: null, email: 'hamza@example.com', emailVerified: true, id: 'member_1', username: 'hamza_8' }).success,
    ).toBe(true)
    expect(
      safeMemberSchema.safeParse({ avatarStyle: 'dicebear', avatarUrl: null, createdAt: '2026-09-06T00:00:00.000Z', displayName: null, email: 'hamza@example.com', emailVerified: true, id: 'member_1', username: 'hamza_8' }).success,
    ).toBe(false)
    expect(avatarUrlSchema.safeParse('https://api.dicebear.com/7.x/notionists/svg?seed=abc').success).toBe(true)
    expect(avatarUrlSchema.safeParse('data:image/svg+xml;base64,abc').success).toBe(false)
    expect(avatarUrlSchema.safeParse('ftp://files.example/avatar.svg').success).toBe(false)
    expect(bannerUrlSchema.safeParse('https://image.tmdb.org/t/p/w1280/abc.jpg').success).toBe(true)
    expect(bannerUrlSchema.safeParse('https://api.dicebear.com/7.x/notionists/svg?seed=abc').success).toBe(false)
    expect(bannerUrlSchema.safeParse('https://evil.example/t/p/w1280/abc.jpg').success).toBe(false)
    expect(recoveryConfirmRequestSchema.safeParse({ code: '123456', email: 'hamza@example.com', newPassword: 'another-long-password' }).success).toBe(true)
    expect(passwordChangeRequestSchema.safeParse({ currentPassword: 'long-enough-password', newPassword: 'another-long-password' }).success).toBe(true)
    expect(accountDeletionRequestSchema.safeParse({ password: 'long-enough-password' }).success).toBe(true)
  })

  it('normalizes usernames and rejects reserved or unsafe names', () => {
    expect(usernameSchema.parse('  Cinema_Fan9 ')).toBe('cinema_fan9')
    expect(usernameSchema.safeParse('admin').success).toBe(false)
    expect(usernameSchema.safeParse('two words').success).toBe(false)
    expect(usernameSchema.safeParse('ab').success).toBe(false)
    expect(usernameSchema.safeParse('a'.repeat(31)).success).toBe(false)
  })

  it('validates editable profiles and username availability', () => {
    expect(updateProfileRequestSchema.parse({ avatarStyle: 'noir', avatarUrl: 'https://api.dicebear.com/7.x/notionists/svg?seed=abc', bannerUrl: 'https://image.tmdb.org/t/p/w1280/abc.jpg', bio: '  Films, quietly.  ', displayName: ' Hamza ', location: ' Rabat ', username: 'HAMZA_8', visibility: 'public' })).toEqual({
      avatarStyle: 'noir', avatarUrl: 'https://api.dicebear.com/7.x/notionists/svg?seed=abc', bannerUrl: 'https://image.tmdb.org/t/p/w1280/abc.jpg', bio: 'Films, quietly.', displayName: 'Hamza', location: 'Rabat', username: 'hamza_8', visibility: 'public',
    })
    expect(updateProfileRequestSchema.safeParse({ avatarUrl: 'javascript:alert(1)' }).success).toBe(false)
    expect(profileSchema.safeParse({ avatarStyle: 'dusk', avatarUrl: null, bannerUrl: null, bio: null, createdAt: '2026-09-06T00:00:00.000Z', displayName: null, location: null, nextUsernameChangeAt: null, username: 'hamza_8', usernameChangedAt: null, visibility: 'private' }).success).toBe(true)
    expect(usernameAvailabilityResponseSchema.parse({ available: true, username: 'HAMZA_8' })).toEqual({ available: true, username: 'hamza_8' })
  })

  it('requires durable Letterboxd import progress and review data', () => {
    expect(letterboxdImportSchema.safeParse({
      confirmedAt: null,
      createdAt: '2026-09-07T00:00:00.000Z',
      failedReason: null,
      id: 'import_1',
      progress: { exact: 4, confident: 2, needsReview: 1, skipped: 3, total: 11, unmatched: 1 },
      status: 'needs_review',
      updatedAt: '2026-09-07T00:01:00.000Z',
    }).success).toBe(true)
  })

  it('validates non-empty member record edits', () => {
    expect(updateDiaryEntryRequestSchema.parse({ rewatch: true, tags: [' noir '], watchedOn: '2026-09-08' })).toEqual({ rewatch: true, tags: ['noir'], watchedOn: '2026-09-08' })
    expect(updateDiaryEntryRequestSchema.safeParse({}).success).toBe(false)
    expect(updateMemberReviewRequestSchema.parse({ body: '  Newly written.  ', reviewedOn: null })).toEqual({ body: 'Newly written.', reviewedOn: null })
    expect(updateMemberReviewRequestSchema.safeParse({ tags: [''] }).success).toBe(false)
    expect(updateMemberListRequestSchema.parse({ description: null, name: '  Night films  ', visibility: 'public' })).toEqual({ description: null, name: 'Night films', visibility: 'public' })
    expect(updateMemberListRequestSchema.safeParse({}).success).toBe(false)
  })

  it('bounds member ratings to whole points between 1 and 10', () => {
    expect(setRatingRequestSchema.parse({ id: 693134, kind: 'movie', value: 9 })).toMatchObject({ value: 9 })
    expect(setRatingRequestSchema.safeParse({ id: 693134, kind: 'movie', value: 0 }).success).toBe(false)
    expect(setRatingRequestSchema.safeParse({ id: 693134, kind: 'movie', value: 11 }).success).toBe(false)
    expect(setRatingRequestSchema.safeParse({ id: 693134, kind: 'movie', value: 4.5 }).success).toBe(false)
  })

  it('bounds playback progress writes to sane ranges', () => {    expect(progressWriteRequestSchema.parse({ id: 693134, kind: 'movie', positionSeconds: 0 })).toMatchObject({ id: 693134, kind: 'movie' })
    expect(progressWriteRequestSchema.parse({ completed: true, durationSeconds: 3600, episode: 3, id: 95396, kind: 'series', positionSeconds: 3599, season: 1 })).toMatchObject({ completed: true, season: 1 })
    expect(progressWriteRequestSchema.safeParse({ id: 693134, kind: 'movie', positionSeconds: -5 }).success).toBe(false)
    expect(progressWriteRequestSchema.safeParse({ durationSeconds: 0, id: 693134, kind: 'movie', positionSeconds: 10 }).success).toBe(false)
    expect(playbackProgressSchema.safeParse({ completed: false, durationSeconds: null, episode: 3, id: 95396, kind: 'series', positionSeconds: 120, season: 1, updatedAt: '2026-09-06T00:00:00.000Z' }).success).toBe(true)
  })

  it('requires request correlation on stable errors', () => {    expect(apiErrorResponseSchema.safeParse({ error: { code: 'BAD_REQUEST', message: 'Bad request.', requestId: 'request-1234', retryable: false } }).success).toBe(true)
  })

  it('carries direct caption tracks on listed providers', () => {
    const parsed = playbackProviderListSchema.parse({ providers: [
      { id: 'primary', label: 'primary', subtitles: [{ id: 'en', label: 'English', language: 'en', url: 'https://media.example/en.vtt', format: 'vtt' }] },
      { id: 'backup', label: 'backup' },
    ] })
    expect(parsed.providers[0]?.subtitles).toMatchObject([{ id: 'en', format: 'vtt' }])
    expect(parsed.providers[1]?.subtitles).toEqual([])
  })
})
