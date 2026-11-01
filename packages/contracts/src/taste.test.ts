import { describe, expect, it } from 'vitest'
import { tasteEditionWriteSchema, tasteRecommendationResponseSchema, tasteRecommendationWriteSchema, tasteReviewWriteSchema } from './taste'

describe('publication intent contracts', () => {
  it('allows unfinished private editions and requires three unique explained picks to publish', () => {
    const draft = { month: '2026-10', title: 'October', revision: 0 }
    expect(tasteEditionWriteSchema.safeParse(draft).success).toBe(true)
    expect(tasteEditionWriteSchema.safeParse({ ...draft, publish: true }).success).toBe(false)
    const picks = [1, 2, 3].map(id => ({ kind: 'anime', id, reason: 'The atmosphere.' }))
    expect(tasteEditionWriteSchema.safeParse({ ...draft, picks, publish: true }).success).toBe(true)
    expect(tasteEditionWriteSchema.safeParse({ ...draft, picks: [picks[0], picks[0], picks[2]], publish: true }).success).toBe(false)
  })
  it('rejects ambiguous episode identities', () => {
    const input = { kind: 'series', id: 42, episode: 2, body: 'My reading.', rating: null, idempotencyKey: '6d9d3d6f-e77b-431c-928b-c93f394085fa' }
    expect(tasteReviewWriteSchema.safeParse(input).success).toBe(false)
    expect(tasteReviewWriteSchema.safeParse({ ...input, season: 1 }).success).toBe(true)
    expect(tasteReviewWriteSchema.safeParse({ ...input, kind: 'movie', season: 1 }).success).toBe(false)
  })
  it('accepts only a catalog title and an explicit recipient response for recommendations', () => {
    expect(tasteRecommendationWriteSchema.safeParse({ kind: 'anime', id: 21, recipientId: 'member-1' }).success).toBe(true)
    expect(tasteRecommendationWriteSchema.safeParse({ kind: 'anime', id: 21, recipientId: 'member-1', message: 'A private note' }).success).toBe(false)
    expect(tasteRecommendationResponseSchema.safeParse('already-seen').success).toBe(true)
    expect(tasteRecommendationResponseSchema.safeParse('open-chat').success).toBe(false)
  })
})
