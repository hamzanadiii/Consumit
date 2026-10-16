-- Keyset orderings used by the bounded member library snapshot and pages.
-- The composite indexes include a stable id tie-breaker so page boundaries
-- remain deterministic when records share a timestamp.
CREATE INDEX "SavedTitle_member_created_desc_idx"
ON "SavedTitle"("memberId", "createdAt" DESC, "id" DESC);

DROP INDEX "DiaryEntry_memberId_watchedOn_idx";
CREATE INDEX "Diary_member_date_created_desc_idx"
ON "DiaryEntry"("memberId", "watchedOn" DESC, "createdAt" DESC, "id" DESC);

DROP INDEX "MemberList_memberId_idx";
DROP INDEX "MemberList_memberId_updatedAt_idx";
CREATE INDEX "MemberList_member_updated_desc_idx"
ON "MemberList"("memberId", "updatedAt" DESC, "id" DESC);

DROP INDEX "SavedMemberList_memberId_createdAt_idx";
CREATE INDEX "SavedList_member_created_desc_idx"
ON "SavedMemberList"("memberId", "createdAt" DESC, "id" DESC);
