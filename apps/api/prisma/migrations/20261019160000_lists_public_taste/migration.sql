ALTER TABLE "Profile"
  ADD COLUMN "sectionVisibility" JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE "Profile" p
SET "sectionVisibility" = '{"favorites":true,"ratings":true,"reviews":true,"lists":true,"network":true,"likes":true,"tags":true,"watchlist":true}'::jsonb,
    "visibility" = 'public'
FROM "Member" m
WHERE m."id" = p."memberId" AND m."status" = 'ACTIVE';

ALTER TABLE "Profile"
  ALTER COLUMN "visibility" SET DEFAULT 'public',
  ALTER COLUMN "sectionVisibility" SET DEFAULT '{"favorites":true,"ratings":true,"reviews":true,"lists":true,"network":true,"likes":true,"tags":true,"watchlist":true}'::jsonb,
  DROP COLUMN "location",
  DROP COLUMN "locationOrigin";

ALTER TABLE "MemberList" ALTER COLUMN "visibility" SET DEFAULT 'public';

ALTER TABLE "SavedMemberList"
  ADD COLUMN "listSlug" TEXT,
  ADD COLUMN "listName" TEXT,
  ADD COLUMN "ownerUsername" TEXT,
  ADD COLUMN "ownerDisplayName" TEXT;

UPDATE "SavedMemberList" saved
SET "listSlug" = list."slug",
    "listName" = list."name",
    "ownerUsername" = profile."username",
    "ownerDisplayName" = profile."displayName"
FROM "MemberList" list
JOIN "Profile" profile ON profile."memberId" = list."memberId"
WHERE saved."listId" = list."id";

ALTER TABLE "SavedMemberList"
  ALTER COLUMN "listSlug" SET NOT NULL,
  ALTER COLUMN "listName" SET NOT NULL,
  ALTER COLUMN "ownerUsername" SET NOT NULL,
  DROP CONSTRAINT "SavedMemberList_listId_fkey";

DROP INDEX IF EXISTS "Profile_public_username_trgm_idx";
DROP INDEX IF EXISTS "Profile_public_display_name_trgm_idx";
CREATE INDEX "Profile_username_trgm_idx" ON "Profile" USING GIN (username gin_trgm_ops);
CREATE INDEX "Profile_display_name_trgm_idx" ON "Profile" USING GIN ("displayName" gin_trgm_ops);

CREATE INDEX "PlaybackProgress_updatedAt_desc_idx" ON "PlaybackProgress"("updatedAt" DESC);
