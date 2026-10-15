import { describe, expect, it } from 'vitest'
import { analyticsPage, analyticsReferrer } from './google-analytics'

describe('analytics privacy projection', () => {
  it('groups public title IDs while excluding unknown or private routes', () => {
    expect(analyticsPage('/anime/113415')).toEqual({ path: '/anime/title', title: 'Anime title' })
    expect(analyticsPage('/series/1396')).toEqual({ path: '/series/title', title: 'Series title' })
    expect(analyticsPage('/title/550')).toEqual({ path: '/title', title: 'Title' })
    expect(analyticsPage('/title/550/reviews')).toBeNull()
    expect(analyticsPage('/profile/member-name')).toBeNull()
    expect(analyticsPage('/search?query=private')).toBeNull()
  })
  it('removes credentials, paths, queries and fragments from referrers', () => {
    expect(analyticsReferrer('https://name:password@example.com/private?email=secret#token')).toBe('https://example.com')
    expect(analyticsReferrer('javascript:alert(1)')).toBe('')
    expect(analyticsReferrer('')).toBe('')
  })
})
