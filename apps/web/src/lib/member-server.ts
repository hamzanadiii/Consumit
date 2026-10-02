import 'server-only'

import {
  apiErrorResponseSchema,
  memberLibraryCollectionPageSchema,
  memberLibrarySnapshotSchema,
  watchHistoryPageSchema,
  memberListDetailSchema,
  memberProfileDataSchema,
  memberProfileArchivePageSchema,
  memberRatingLookupResponseSchema,
  memberRatingPageSchema,
  titleReviewsPageSchema,
  type CatalogKind,
  type MemberLibrarySnapshot,
  type MemberLibraryCollection,
  type MemberLibraryCollectionPage,
  type WatchHistoryPage,
  type MemberListDetail,
  type MemberProfileData,
  type MemberProfileArchiveKind,
  type MemberProfileArchivePage,
  type MemberRatingPage,
  type MemberRating,
  type CatalogRef,
  type TitleReviewAudience,
  type TitleReviewsPage,
  type TitleReviewSort,
} from '@consumit/contracts'
import { cookies } from 'next/headers'
import { cache } from 'react'
import type { ZodType } from 'zod'

export class MemberApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) { super(message); this.name = 'MemberApiError'; this.status = status }
}

function baseUrl() {
  return (process.env.CONSUMIT_API_URL ?? 'http://127.0.0.1:3001').replace(/\/$/, '')
}

async function request<T>(path: string, schema: ZodType<T>): Promise<T> {
  const store = await cookies()
  const cookie = store.get('__Host-consumit_session') ?? store.get('consumit_session')
  const response = await fetch(`${baseUrl()}${path}`, {
    cache: 'no-store',
    headers: { accept: 'application/json', ...(cookie ? { cookie: `${cookie.name}=${cookie.value}` } : {}) },
    signal: AbortSignal.timeout(6_000),
  })
  if (!response.ok) {
    const error = apiErrorResponseSchema.safeParse(await response.json().catch(() => null))
    throw new MemberApiError(error.success ? error.data.error.message : 'Member data is temporarily unavailable.', response.status)
  }
  const parsed = schema.safeParse(await response.json().catch(() => null))
  if (!parsed.success) throw new MemberApiError('The member service returned an invalid response.', 503)
  return parsed.data
}

export const getPublicProfile = cache((username: string): Promise<MemberProfileData> => request(`/v1/profiles/${encodeURIComponent(username)}`, memberProfileDataSchema))
export const getPublicProfileArchivePage = cache((username: string, collection: MemberProfileArchiveKind, cursor?: string, limit = 30): Promise<MemberProfileArchivePage> => {
  const params = new URLSearchParams({ limit: String(limit) })
  if (cursor) params.set('cursor', cursor)
  return request(`/v1/profiles/${encodeURIComponent(username)}/archives/${collection}?${params}`, memberProfileArchivePageSchema)
})
export const getMemberLibrarySnapshot = cache((): Promise<MemberLibrarySnapshot> => request('/v1/me/library', memberLibrarySnapshotSchema))
export const getMemberLibraryPage = cache((collection: MemberLibraryCollection, cursor?: string, limit = 30): Promise<MemberLibraryCollectionPage> => {
  const params = new URLSearchParams({ limit: String(limit) })
  if (cursor) params.set('cursor', cursor)
  return request(`/v1/me/library/collections/${collection}?${params}`, memberLibraryCollectionPageSchema)
})
export const getMemberWatchHistory = cache((): Promise<WatchHistoryPage> => request('/v1/me/watch-history?limit=20', watchHistoryPageSchema))
export const getMemberRatingPage = cache((value: number, cursor?: string, limit = 30): Promise<MemberRatingPage> => {
  const params = new URLSearchParams({ limit: String(limit), value: String(value) })
  if (cursor) params.set('cursor', cursor)
  return request(`/v1/me/ratings?${params}`, memberRatingPageSchema)
})
export const getMemberRatingsForTitles = cache((titles: readonly CatalogRef[]): Promise<MemberRating[]> => {
  if (titles.length === 0) return Promise.resolve([])
  const refs = titles.slice(0, 50).map(({ kind, id }) => `${kind}:${id}`).join(',')
  return request(`/v1/me/ratings/lookup?${new URLSearchParams({ titles: refs })}`, memberRatingLookupResponseSchema)
})
export const getMemberList = cache((slug: string): Promise<MemberListDetail> => request(`/v1/lists/${encodeURIComponent(slug)}`, memberListDetailSchema))
export const getTitleReviews = cache((kind: CatalogKind, id: number, page: number, sort: TitleReviewSort, audience: TitleReviewAudience = 'all'): Promise<TitleReviewsPage> => request(`/v1/reviews/${kind}/${id}?page=${page}&sort=${sort}&audience=${audience}`, titleReviewsPageSchema))
