UPDATE "Profile"
SET "sectionVisibility" = COALESCE("sectionVisibility", '{}'::jsonb) ||
  '{"watched":true,"diary":true,"history":true,"activity":true}'::jsonb;

ALTER TABLE "Profile"
  ALTER COLUMN "sectionVisibility" SET DEFAULT '{"favorites":true,"ratings":true,"reviews":true,"lists":true,"network":true,"likes":true,"tags":true,"watchlist":true,"watched":true,"diary":true,"history":true,"activity":true}'::jsonb;

UPDATE "MemberList" SET "visibility" = 'private' WHERE "visibility" NOT IN ('public', 'private', 'unlisted');
ALTER TABLE "MemberList"
  ADD CONSTRAINT "MemberList_visibility_check" CHECK ("visibility" IN ('public', 'unlisted', 'private'));

CREATE TABLE "MemberListCollaborator" (
  "listId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MemberListCollaborator_pkey" PRIMARY KEY ("listId", "memberId"),
  CONSTRAINT "MemberListCollaborator_listId_fkey" FOREIGN KEY ("listId") REFERENCES "MemberList"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MemberListCollaborator_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "MemberListCollaborator_member_created_idx"
  ON "MemberListCollaborator"("memberId", "createdAt" DESC);
