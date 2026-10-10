import { describe, expect, it } from 'vitest'
import { listReadResponseSchema, profileReadResponseSchema, publicProfileCollectionPageSchema } from './index'

describe('visitor response contracts', () => {
  it('excludes private profile and collection fields even when supplied by a backing service', () => {
    const profile = profileReadResponseSchema.parse({
      viewerIsOwner: false, canonicalUsername: 'film_fan',
      profile: { id: 'member-id', username: 'film_fan', displayName: 'Film Fan', avatarStyle: 'dusk', avatarUrl: null, bannerUrl: null, bio: 'Public bio', isFollowing: false, location: 'Private location', email: 'private@example.test' },
      favorites: [{ id: 550, kind: 'movie', position: 1, origin: 'imported', sourceKey: 'private-import' }],
      ratingDistribution: Array.from({ length: 10 }, (_, index) => ({ value: index + 1, count: 0 })),
      statistics: { ratings: 0, reviews: 0, lists: 0, watched: 42 }, social: { followers: 0, following: 0 }, diary: ['private-diary'], history: ['private-history'],
    })
    for (const field of ['location', 'email', 'watched', 'diary', 'history', 'origin', 'sourceKey']) expect(JSON.stringify(profile)).not.toContain(field)
    const reviews = publicProfileCollectionPageSchema.parse({ collection: 'reviews', items: [{ id: 550, kind: 'movie', reviewId: 'review-id', body: 'Public review', reviewedOn: null, tags: ['private-tag'], origin: 'imported', sourceKey: 'private-import' }], nextCursor: null })
    for (const field of ['tags', 'origin', 'sourceKey']) expect(JSON.stringify(reviews)).not.toContain(field)
  })
  it('strips public list import metadata while keeping ordered titles and notes', () => {
    const list = listReadResponseSchema.parse({ viewerIsOwner: false, owner: { username: 'film_fan', displayName: null }, list: { id: 'list-id', slug: 'film-list', name: 'Favorites', description: null, itemCount: 1, visibility: 'public', origin: 'imported' }, items: [{ id: 550, kind: 'movie', note: 'A public note', position: 1, origin: 'imported', sourceKey: 'private-import' }] })
    expect(list.items).toEqual([{ id: 550, kind: 'movie', note: 'A public note', position: 1 }])
    expect(JSON.stringify(list)).not.toContain('origin')
    expect(JSON.stringify(list)).not.toContain('sourceKey')
  })
})
