import type {
  CatalogRef,
  MemberLibrary,
  MemberListDetail,
  MemberProfileData,
  PlaybackProgress,
  ProgressRef,
  ProgressWriteRequest,
  UpdateDiaryEntryRequest,
  UpdateMemberListRequest,
  UpdateMemberReviewRequest,
} from '@consumit/contracts'

export interface MemberData {
  library(memberId: string): Promise<MemberLibrary>
  list(slug: string, viewerMemberId?: string): Promise<MemberListDetail | null>
  profile(username: string, viewerMemberId?: string): Promise<MemberProfileData | null>
  progress(memberId: string, ref: ProgressRef): Promise<PlaybackProgress | null>
  setFavorites(memberId: string, favorites: readonly CatalogRef[]): Promise<MemberLibrary>
  setProgress(memberId: string, input: ProgressWriteRequest): Promise<PlaybackProgress>
  setSaved(memberId: string, title: CatalogRef, saved: boolean): Promise<MemberLibrary>
  updateDiary(memberId: string, entryId: string, changes: UpdateDiaryEntryRequest): Promise<boolean>
  updateList(memberId: string, listId: string, changes: UpdateMemberListRequest): Promise<boolean>
  updateReview(memberId: string, reviewId: string, changes: UpdateMemberReviewRequest): Promise<boolean>
}
