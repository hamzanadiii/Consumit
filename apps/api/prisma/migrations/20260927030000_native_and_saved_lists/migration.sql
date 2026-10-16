ALTER TABLE "MemberList"
ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "MemberList_memberId_idempotencyKey_key"
ON "MemberList"("memberId", "idempotencyKey");

CREATE TABLE "SavedMemberList" (
  "id" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "listId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SavedMemberList_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SavedMemberList_memberId_listId_key"
ON "SavedMemberList"("memberId", "listId");

CREATE INDEX "SavedMemberList_memberId_createdAt_idx"
ON "SavedMemberList"("memberId", "createdAt");

CREATE INDEX "SavedMemberList_listId_idx"
ON "SavedMemberList"("listId");

ALTER TABLE "SavedMemberList"
ADD CONSTRAINT "SavedMemberList_memberId_fkey"
FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SavedMemberList"
ADD CONSTRAINT "SavedMemberList_listId_fkey"
FOREIGN KEY ("listId") REFERENCES "MemberList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
