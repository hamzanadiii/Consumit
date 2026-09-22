import type {
  CatalogRef,
  CreateDiaryEntryRequest,
  CreateReviewRequest,
  DiaryEntry,
  FollowStatus,
  MemberLibrary,
  MemberListDetail,
  MemberProfileData,
  MemberRating,
  MemberReview,
  MemberTitleRecord,
  PlaybackProgress,
  ProgressRef,
  ProgressWriteRequest,
  ReviewLike,
  TitleReviewsPage,
  TitleReviewAudience,
  TitleReviewSort,
  UpdateDiaryEntryRequest,
  UpdateMemberListRequest,
  UpdateMemberReviewRequest,
} from '@consumit/contracts'

export interface MemberData {
  createDiaryEntry(memberId: string, input: CreateDiaryEntryRequest): Promise<DiaryEntry>
  createReview(memberId: string, input: CreateReviewRequest): Promise<MemberReview>
  isFollowing(viewerMemberId: string, username: string): Promise<boolean>
  library(memberId: string): Promise<MemberLibrary>
  like(memberId: string, ref: CatalogRef): Promise<MemberTitleRecord | null>
  list(slug: string, viewerMemberId?: string): Promise<MemberListDetail | null>
  profile(username: string, viewerMemberId?: string): Promise<MemberProfileData | null>
  progress(memberId: string, ref: ProgressRef): Promise<PlaybackProgress | null>
  rating(memberId: string, ref: CatalogRef): Promise<MemberRating | null>
  removeLike(memberId: string, ref: CatalogRef): Promise<boolean>
  removeRating(memberId: string, ref: CatalogRef): Promise<boolean>
  removeReviewLike(memberId: string, reviewId: string): Promise<boolean>
  review(memberId: string, ref: CatalogRef): Promise<MemberReview | null>
  setFavorites(memberId: string, favorites: readonly CatalogRef[]): Promise<MemberLibrary>
  setFollow(viewerMemberId: string, username: string, follow: boolean): Promise<FollowStatus | null>
  setLiked(memberId: string, ref: CatalogRef, liked: boolean): Promise<MemberTitleRecord | null>
  setProgress(memberId: string, input: ProgressWriteRequest): Promise<PlaybackProgress>
  setRating(memberId: string, ref: CatalogRef, value: number): Promise<MemberRating>
  setReviewLiked(memberId: string, reviewId: string, liked: boolean): Promise<ReviewLike | null>
  setSaved(memberId: string, title: CatalogRef, saved: boolean): Promise<MemberLibrary>
  setWatched(memberId: string, title: CatalogRef, watched: boolean): Promise<MemberLibrary>
  titleReviews(ref: CatalogRef, page: number, sort: TitleReviewSort, viewerMemberId?: string, audience?: TitleReviewAudience): Promise<TitleReviewsPage>
  updateDiary(memberId: string, entryId: string, changes: UpdateDiaryEntryRequest): Promise<boolean>
  updateList(memberId: string, listId: string, changes: UpdateMemberListRequest): Promise<boolean>
  updateReview(memberId: string, reviewId: string, changes: UpdateMemberReviewRequest): Promise<boolean>
}
