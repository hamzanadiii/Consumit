import type {
  CatalogRef,
  CreateMemberListRequest,
  CreateDiaryEntryRequest,
  CreateReviewRequest,
  DiaryEntry,
  MemberLibraryCollection,
  MemberLibraryCollectionPage,
  MemberLibrarySnapshot,
  MemberListDetail,
  MemberProfileData,
  MemberProfileArchiveCursor,
  MemberProfileArchiveKind,
  MemberProfileArchivePage,
  MemberRating,
  MemberRatingPage,
  MemberReview,
  MemberTitleRecord,
  MemberTitleState,
  PlaybackProgress,
  ProgressRef,
  ProgressWriteRequest,
  TitleReviewsPage,
  TitleReviewSort,
  UpdateDiaryEntryRequest,
  UpdateMemberListRequest,
  UpdateMemberListContentRequest,
  UpdateMemberReviewRequest,
  WatchHistoryPage,
} from '@consumit/contracts'

export interface MemberData {
  createDiaryEntry(memberId: string, input: CreateDiaryEntryRequest): Promise<DiaryEntry>
  createReview(memberId: string, input: CreateReviewRequest): Promise<MemberReview>

  libraryPage(memberId: string, collection: MemberLibraryCollection, cursor: string | undefined, limit: number): Promise<MemberLibraryCollectionPage>
  librarySnapshot(memberId: string): Promise<MemberLibrarySnapshot>
  like(memberId: string, ref: CatalogRef): Promise<MemberTitleRecord | null>
  list(slug: string, viewerMemberId?: string): Promise<MemberListDetail | null>
  createList(memberId: string, input: CreateMemberListRequest): Promise<MemberListDetail>
  
  updateListContent(memberId: string, listId: string, changes: UpdateMemberListContentRequest): Promise<boolean>
  deleteList(memberId: string, listId: string): Promise<boolean>
  
  profile(username: string, viewerMemberId?: string): Promise<MemberProfileData | null>
  profileArchive(username: string, collection: MemberProfileArchiveKind, viewerMemberId?: string, cursor?: MemberProfileArchiveCursor, limit?: number): Promise<MemberProfileArchivePage | null>
  progress(memberId: string, ref: ProgressRef): Promise<PlaybackProgress | null>
  watchHistory(memberId: string, cursor: string | undefined, limit: number): Promise<WatchHistoryPage>
  rating(memberId: string, ref: CatalogRef): Promise<MemberRating | null>
  ratingsByValue(memberId: string, value: number, cursor: string | undefined, limit: number): Promise<MemberRatingPage>
  ratingsForTitles(memberId: string, titles: readonly CatalogRef[]): Promise<MemberRating[]>
  removeLike(memberId: string, ref: CatalogRef): Promise<boolean>
  removeRating(memberId: string, ref: CatalogRef): Promise<boolean>
  
  review(memberId: string, ref: CatalogRef): Promise<MemberReview | null>
  setFavorites(memberId: string, favorites: readonly CatalogRef[]): Promise<void>
  
  setLiked(memberId: string, ref: CatalogRef, liked: boolean): Promise<MemberTitleRecord | null>
  setProgress(memberId: string, input: ProgressWriteRequest): Promise<PlaybackProgress>
  setRating(memberId: string, ref: CatalogRef, value: number): Promise<MemberRating>
  
  setSaved(memberId: string, title: CatalogRef, saved: boolean): Promise<void>
  setWatched(memberId: string, title: CatalogRef, watched: boolean): Promise<void>
  titleState(memberId: string, ref: CatalogRef): Promise<MemberTitleState>
  titleReviews(ref: CatalogRef, page: number, sort: TitleReviewSort, viewerMemberId: string): Promise<TitleReviewsPage>
  updateDiary(memberId: string, entryId: string, changes: UpdateDiaryEntryRequest): Promise<boolean>
  deleteDiary(memberId: string, entryId: string): Promise<boolean>
  updateList(memberId: string, listId: string, changes: UpdateMemberListRequest): Promise<boolean>
  updateReview(memberId: string, reviewId: string, changes: UpdateMemberReviewRequest): Promise<boolean>
}
