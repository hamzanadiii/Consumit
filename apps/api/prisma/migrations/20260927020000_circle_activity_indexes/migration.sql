CREATE INDEX "DiaryEntry_memberId_createdAt_idx"
ON "DiaryEntry"("memberId", "createdAt" DESC);

CREATE INDEX "Review_memberId_createdAt_idx"
ON "Review"("memberId", "createdAt" DESC);

CREATE INDEX "MemberList_memberId_updatedAt_idx"
ON "MemberList"("memberId", "updatedAt" DESC);

CREATE INDEX "Profile_public_username_prefix_idx"
ON "Profile"(lower("username") text_pattern_ops)
WHERE "visibility" = 'public';

CREATE INDEX "Profile_public_displayName_prefix_idx"
ON "Profile"(lower("displayName") text_pattern_ops)
WHERE "visibility" = 'public';
