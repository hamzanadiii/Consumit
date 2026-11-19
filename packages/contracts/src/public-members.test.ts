import { describe, expect, it } from 'vitest'
import { listReadResponseSchema, profileReadResponseSchema, publicProfileCollectionPageSchema } from './index'

describe('visitor response contracts', () => {
  it('excludes private profile and collection fields even when supplied by a backing service', () => {
    const profile = profileReadResponseSchema.parse({
      viewerIsOwner: false, canonicalUsername: 'film_fan',
      sectionVisibility: { favorites: true, ratings: true, reviews: true, lists: true, network: true, likes: true, tags: true, watchlist: true, watched: true, diary: true, history: true, activity: true },
      profile: { id: 'member-id', username: 'film_fan', displayName: 'Film Fan', avatarStyle: 'dusk', avatarUrl: null, bannerUrl: null, bio: 'Public bio', isFollowing: false, location: 'Private location', email: 'private@example.test' },
      favorites: [{ id: 550, kind: 'movie', position: 1, origin: 'letterboxd', sourceKey: 'private-import' }],
      ratingDistribution: Array.from({ length: 10 }, (_, index) => ({ value: index + 1, count: 0 })),
      statistics: { activity: 0, diary: 0, history: 0, ratings: 0, reviews: 0, lists: 0, watchlist: 0, watched: 42 }, social: { followers: 0, following: 0 }, diary: ['private-diary'], history: ['private-history'],
    })
    expect(profile.profile).not.toHaveProperty('location')
    expect(profile.profile).not.toHaveProperty('email')
    expect(profile).not.toHaveProperty('diary')
    expect(profile).not.toHaveProperty('history')
    expect(profile.favorites[0]).not.toHaveProperty('origin')
    expect(profile.favorites[0]).not.toHaveProperty('sourceKey')
    expect(profile.statistics.watched).toBe(42)
    const reviews = publicProfileCollectionPageSchema.parse({ collection: 'reviews', items: [{ id: 550, kind: 'movie', reviewId: 'review-id', body: 'Public review', reviewedOn: null, tags: ['private-tag'], origin: 'imported', sourceKey: 'private-import' }], nextCursor: null })
    for (const field of ['tags', 'origin', 'sourceKey']) expect(JSON.stringify(reviews)).not.toContain(field)
  })
  it('strips public list import metadata while keeping ordered titles and notes', () => {
    const list = listReadResponseSchema.parse({ viewerIsOwner: false, viewerHasSaved: false, owner: { username: 'film_fan', displayName: null }, list: { id: 'list-id', slug: 'film-list', name: 'Favorites', description: null, itemCount: 1, visibility: 'public', origin: 'imported' }, items: [{ id: 550, kind: 'movie', note: 'A public note', position: 1, origin: 'imported', sourceKey: 'private-import' }] })
    expect(list.items).toEqual([{ id: 550, kind: 'movie', note: 'A public note', position: 1 }])
    expect(JSON.stringify(list)).not.toContain('origin')
    expect(JSON.stringify(list)).not.toContain('sourceKey')
  })
})
