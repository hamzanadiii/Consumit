import {
  acceptedResponseSchema,
  apiErrorResponseSchema,
  createDiaryEntryRequestSchema,
  createMemberListRequestSchema,
  createReviewRequestSchema,
  diaryEntrySchema,
  profileSchema,
  favoriteSelectionRequestSchema,
  memberLibraryCollectionPageSchema,
  memberProfileArchivePageSchema,
  memberRatingLookupResponseSchema,
  watchHistoryPageSchema,
  memberListDetailSchema,
  memberRatingSchema,
  memberRatingPageSchema,
  memberReviewSchema,
  memberTitleRecordSchema,
  memberTitleStateSchema,
  sessionMemberResponseSchema,
  titleReviewsPageSchema,
  updateDiaryEntryRequestSchema,
  updateMemberListContentRequestSchema,
  updateMemberReviewRequestSchema,
  updateProfileRequestSchema,
  usernameAvailabilityResponseSchema,
  publicMemberPageSchema,
  publicProfileCollectionPageSchema,
  type PublicProfileCollection,
  type AcceptedResponse,
  type CreateDiaryEntryRequest,
  type CreateMemberListRequest,
  type CreateReviewRequest,
  type PasswordChangeRequest,
  type LoginRequest,
  type CatalogRef,
  type MemberLibraryCollection,
  type MemberLibraryCollectionPage,
  type MemberProfileArchiveKind,
  type MemberProfileArchivePage,
  type MemberRating,
  type MemberRatingPage,
  type WatchHistoryPage,
  type MemberListDetail,
  type RecoveryConfirmRequest,
  type RegisterRequest,
  type SafeMember,
  type TitleReviewSort,
  type UpdateDiaryEntryRequest,
  type UpdateMemberListContentRequest,
  type UpdateMemberReviewRequest,
  type UpdateProfileRequest,
  type VerifyEmailRequest,
} from '@consumit/contracts'
import type { ZodType } from 'zod'

export class IdentityApiError extends Error {
  readonly code: string
  readonly requestId: string | null
  readonly retryable: boolean
  readonly status: number

  constructor(message: string, options: { code: string; requestId?: string; retryable: boolean; status: number }) {
    super(message)
    this.name = 'IdentityApiError'
    this.code = options.code
    this.requestId = options.requestId ?? null
    this.retryable = options.retryable
    this.status = options.status
  }
}

async function request<T>(path: string, options: RequestInit, schema?: ZodType<T>): Promise<T> {
  let response: Response
  const deadline = AbortSignal.timeout(15_000)
  try {
    response = await fetch(path, {
      ...options,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: options.signal ? AbortSignal.any([options.signal, deadline]) : deadline,
      headers: { accept: 'application/json', ...(options.body ? { 'content-type': 'application/json' } : {}), ...options.headers },
    })
  } catch (cause) {
    if (options.signal?.aborted) throw cause
    throw new IdentityApiError(deadline.aborted ? 'The account service took too long to respond. Try again.' : 'The account service could not be reached. Check your connection and try again.', { code: 'AUTH_STATE_UNAVAILABLE', retryable: true, status: 503 })
  }
  if (!response.ok) {
    const parsed = apiErrorResponseSchema.safeParse(await response.json().catch(() => null))
    throw new IdentityApiError(parsed.success ? parsed.data.error.message : 'The account request failed.', {
      code: parsed.success ? parsed.data.error.code : 'INTERNAL',
      ...(parsed.success ? { requestId: parsed.data.error.requestId } : {}),
      retryable: parsed.success ? parsed.data.error.retryable : response.status >= 500,
      status: response.status,
    })
  }
  if (!schema) return undefined as T
  const parsed = schema.safeParse(await response.json().catch(() => null))
  if (!parsed.success) throw new IdentityApiError('The account service returned an invalid response.', { code: 'INTERNAL', retryable: true, status: 503 })
  return parsed.data
}

const body = (value: unknown) => JSON.stringify(value)

export const setMemberFollow = (memberId: string, following: boolean): Promise<void> => request(`/v1/me/follows/${encodeURIComponent(memberId)}`, { method: following ? 'PUT' : 'DELETE' })
export const searchMembers = (q: string, cursor?: string, signal?: AbortSignal) => request(`/v1/members/search?${new URLSearchParams({ q, limit: '20', ...(cursor ? { cursor } : {}) })}`, { method: 'GET', ...(signal ? { signal } : {}) }, publicMemberPageSchema)
export const getProfileCollection = (username: string, collection: PublicProfileCollection, cursor?: string, signal?: AbortSignal) => request(`/v1/profiles/${encodeURIComponent(username)}/collections/${collection}?${new URLSearchParams({ limit: '20', ...(cursor ? { cursor } : {}) })}`, { method: 'GET', ...(signal ? { signal } : {}) }, publicProfileCollectionPageSchema)

export async function getCurrentMember(signal?: AbortSignal): Promise<SafeMember | null> {
  try {
    const response = await request('/v1/me', { ...(signal ? { signal } : {}), method: 'GET' }, sessionMemberResponseSchema)
    return response.member
  } catch (error) {
    if (error instanceof IdentityApiError && error.status === 401) return null
    throw error
  }
}

export const registerMember = (input: RegisterRequest): Promise<AcceptedResponse> => request('/v1/auth/register', { body: body(input), method: 'POST' }, acceptedResponseSchema)
export const requestEmailVerification = (email: string): Promise<AcceptedResponse> => request('/v1/auth/verification/request', { body: body({ email }), method: 'POST' }, acceptedResponseSchema)
export const verifyMemberEmail = async (input: VerifyEmailRequest): Promise<SafeMember> => (await request('/v1/auth/verify-email', { body: body(input), method: 'POST' }, sessionMemberResponseSchema)).member
export const loginMember = async (input: LoginRequest): Promise<SafeMember> => (await request('/v1/auth/login', { body: body(input), method: 'POST' }, sessionMemberResponseSchema)).member
export const updateMemberProfile = (input: UpdateProfileRequest) => request('/v1/me/profile', { body: body(updateProfileRequestSchema.parse(input)), method: 'PATCH' }, profileSchema)
export const getUsernameAvailability = (username: string) => request(`/v1/usernames/${encodeURIComponent(username)}/availability`, { method: 'GET' }, usernameAvailabilityResponseSchema)
export const saveMemberFavorites = (favorites: readonly CatalogRef[]): Promise<void> => request('/v1/me/favorites', { body: body(favoriteSelectionRequestSchema.parse({ favorites })), method: 'PUT' })
export const setMemberSaved = (title: CatalogRef, saved: boolean): Promise<void> => request(`/v1/me/library/titles/${title.kind}/${title.id}`, { method: saved ? 'PUT' : 'DELETE' })
/** One 200-answered read for saved/watched flags, rating, like, and own review.
//  Missing nullable records mean "never set" — no 404s, so browsers stay quiet. */
export const getMemberTitleState = (title: CatalogRef) => request(`/v1/me/titles/${title.kind}/${title.id}`, { method: 'GET' }, memberTitleStateSchema)
export const setMemberRating = (title: CatalogRef, value: number) => request('/v1/ratings', { body: body({ ...title, value }), method: 'PUT' }, memberRatingSchema)
export const clearMemberRating = (title: CatalogRef): Promise<void> => request(`/v1/ratings/${title.kind}/${title.id}`, { method: 'DELETE' })
export const setMemberWatched = (title: CatalogRef, watched: boolean): Promise<void> => request(`/v1/me/library/watched/${title.kind}/${title.id}`, { method: watched ? 'PUT' : 'DELETE' })
export const setMemberLiked = async (title: CatalogRef, liked: boolean) => {
  if (!liked) {
    await request(`/v1/likes/${title.kind}/${title.id}`, { method: 'DELETE' })
    return null
  }
  return request('/v1/likes', { body: body({ ...title }), method: 'PUT' }, memberTitleRecordSchema)
}
export const createMemberReview = (input: CreateReviewRequest) => request('/v1/me/reviews', { body: body(createReviewRequestSchema.parse(input)), method: 'POST' }, memberReviewSchema)
export const updateMemberReview = (reviewId: string, changes: UpdateMemberReviewRequest): Promise<void> => request(`/v1/me/reviews/${encodeURIComponent(reviewId)}`, { body: body(updateMemberReviewRequestSchema.parse(changes)), method: 'PATCH' })
export const listTitleReviews = (title: CatalogRef, page = 1, sort: TitleReviewSort = 'recent') => request(`/v1/reviews/${title.kind}/${title.id}?page=${page}&sort=${sort}`, { method: 'GET' }, titleReviewsPageSchema)
export const createDiaryEntry = (input: CreateDiaryEntryRequest) => request('/v1/me/diary', { body: body(createDiaryEntryRequestSchema.parse(input)), method: 'POST' }, diaryEntrySchema)
export const updateDiaryEntry = (entryId: string, changes: UpdateDiaryEntryRequest): Promise<void> => request(`/v1/me/diary/${encodeURIComponent(entryId)}`, { body: body(updateDiaryEntryRequestSchema.parse(changes)), method: 'PATCH' })
export const deleteDiaryEntry = (entryId: string): Promise<void> => request(`/v1/me/diary/${encodeURIComponent(entryId)}`, { method: 'DELETE' })
export const getMemberLibraryPage = (collection: MemberLibraryCollection, cursor?: string, limit = 30): Promise<MemberLibraryCollectionPage> => {
  const params = new URLSearchParams({ limit: String(limit) })
  if (cursor) params.set('cursor', cursor)
  return request(`/v1/me/library/collections/${collection}?${params}`, { method: 'GET' }, memberLibraryCollectionPageSchema)
}
export const getProfileArchivePage = (username: string, collection: MemberProfileArchiveKind, cursor?: string, limit = 30): Promise<MemberProfileArchivePage> => {
  const params = new URLSearchParams({ limit: String(limit) })
  if (cursor) params.set('cursor', cursor)
  return request(`/v1/profiles/${encodeURIComponent(username)}/archives/${collection}?${params}`, { method: 'GET' }, memberProfileArchivePageSchema)
}
export const getMemberRatingPage = (value: number, cursor?: string, limit = 30): Promise<MemberRatingPage> => {
  const params = new URLSearchParams({ limit: String(limit), value: String(value) })
  if (cursor) params.set('cursor', cursor)
  return request(`/v1/me/ratings?${params}`, { method: 'GET' }, memberRatingPageSchema)
}
export const getMemberRatingsForTitles = (titles: readonly CatalogRef[]): Promise<MemberRating[]> => {
  if (titles.length === 0) return Promise.resolve([])
  const refs = titles.slice(0, 50).map(({ kind, id }) => `${kind}:${id}`).join(',')
  return request(`/v1/me/ratings/lookup?${new URLSearchParams({ titles: refs })}`, { method: 'GET' }, memberRatingLookupResponseSchema)
}
export const getMemberWatchHistoryPage = (cursor?: string): Promise<WatchHistoryPage> => request(`/v1/me/watch-history?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { method: 'GET' }, watchHistoryPageSchema)
export const createMemberList = (input: CreateMemberListRequest): Promise<MemberListDetail> => request('/v1/me/lists', { body: body(createMemberListRequestSchema.parse(input)), method: 'POST' }, memberListDetailSchema)
export const getMemberListDetail = (slug: string): Promise<MemberListDetail> => request(`/v1/lists/${encodeURIComponent(slug)}`, { method: 'GET' }, memberListDetailSchema)
export const updateMemberListContent = (listId: string, changes: UpdateMemberListContentRequest): Promise<void> => request(`/v1/me/lists/${encodeURIComponent(listId)}`, { body: body(updateMemberListContentRequestSchema.parse(changes)), method: 'PUT' })
export const deleteMemberList = (listId: string): Promise<void> => request(`/v1/me/lists/${encodeURIComponent(listId)}`, { method: 'DELETE' })

export const logoutMember = (): Promise<void> => request('/v1/auth/logout', { method: 'POST' })
export const requestPasswordRecovery = (email: string): Promise<AcceptedResponse> => request('/v1/auth/recovery/request', { body: body({ email }), method: 'POST' }, acceptedResponseSchema)
export const confirmPasswordRecovery = (input: RecoveryConfirmRequest): Promise<void> => request('/v1/auth/recovery/confirm', { body: body(input), method: 'POST' })
export const changeMemberPassword = async (input: PasswordChangeRequest): Promise<void> => request('/v1/auth/password/change', { body: body(input), method: 'POST' })
export const deleteMemberAccount = (password: string): Promise<void> => request('/v1/me', { body: body({ password }), method: 'DELETE' })

export async function downloadMemberExport(): Promise<void> {
  let response: Response
  try {
    response = await fetch('/v1/me/export', { cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(30_000) })
  } catch {
    throw new IdentityApiError('The account service could not be reached.', { code: 'AUTH_STATE_UNAVAILABLE', retryable: true, status: 503 })
  }
  if (!response.ok) {
    const parsed = apiErrorResponseSchema.safeParse(await response.json().catch(() => null))
    throw new IdentityApiError(parsed.success ? parsed.data.error.message : 'The export could not be prepared.', {
      code: parsed.success ? parsed.data.error.code : 'INTERNAL',
      ...(parsed.success ? { requestId: parsed.data.error.requestId } : {}),
      retryable: parsed.success ? parsed.data.error.retryable : response.status >= 500,
      status: response.status,
    })
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'consumit-member-export.json'
  anchor.click()
  URL.revokeObjectURL(url)
}
