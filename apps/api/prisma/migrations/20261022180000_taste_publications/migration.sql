ALTER TABLE "Member" ADD COLUMN "tasteRestricted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Review" ADD COLUMN "spoiler" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "season" INTEGER, ADD COLUMN "episode" INTEGER,
  ADD COLUMN "ratingAtPublication" INTEGER, ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "removedAt" TIMESTAMP(3);
ALTER TABLE "MemberList" ADD COLUMN "removedAt" TIMESTAMP(3);
CREATE TABLE "TasteDocument" (
 "id" TEXT PRIMARY KEY, "memberId" TEXT NOT NULL REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "kind" TEXT NOT NULL, "key" TEXT NOT NULL, "data" JSONB NOT NULL, "published" JSONB,
 "revision" INTEGER NOT NULL DEFAULT 0, "publishedAt" TIMESTAMP(3), "removedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 UNIQUE("memberId", "kind", "key")
);
CREATE INDEX "TasteDocument_kind_publishedAt_id_idx" ON "TasteDocument"("kind", "publishedAt", "id");
CREATE TABLE "TasteComment" (
 "id" TEXT PRIMARY KEY, "memberId" TEXT NOT NULL REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "targetKind" TEXT NOT NULL, "targetId" TEXT NOT NULL, "parentId" TEXT,
 "body" TEXT NOT NULL, "spoiler" BOOLEAN NOT NULL DEFAULT false, "revision" INTEGER NOT NULL DEFAULT 0,
 "idempotencyKey" TEXT NOT NULL, "deleted" BOOLEAN NOT NULL DEFAULT false,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 UNIQUE("memberId", "idempotencyKey")
);
CREATE INDEX "TasteComment_targetKind_targetId_createdAt_id_idx" ON "TasteComment"("targetKind", "targetId", "createdAt", "id");
CREATE TABLE "TasteBlock" (
 "actorId" TEXT NOT NULL REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "targetId" TEXT NOT NULL REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY("actorId", "targetId")
);
CREATE TABLE "TasteSubscription" (
 "memberId" TEXT NOT NULL REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "targetKind" TEXT NOT NULL, "targetId" TEXT NOT NULL, "muted" BOOLEAN NOT NULL DEFAULT false,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY("memberId", "targetKind", "targetId")
);
CREATE TABLE "TasteEvent" (
 "id" TEXT PRIMARY KEY, "memberId" TEXT NOT NULL REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "targetKind" TEXT NOT NULL, "targetId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("targetKind", "targetId")
);
CREATE INDEX "TasteEvent_createdAt_id_idx" ON "TasteEvent"("createdAt", "id");
CREATE TABLE "TasteNotification" (
 "id" TEXT PRIMARY KEY, "memberId" TEXT NOT NULL REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "actorId" TEXT NOT NULL REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "targetKind" TEXT NOT NULL, "targetId" TEXT NOT NULL, "text" TEXT NOT NULL,
 "read" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("memberId", "actorId", "targetKind", "targetId")
);
CREATE INDEX "TasteNotification_memberId_createdAt_id_idx" ON "TasteNotification"("memberId", "createdAt", "id");
CREATE TABLE "TasteReport" (
 "id" TEXT PRIMARY KEY, "reporterId" TEXT NOT NULL REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "targetKind" TEXT NOT NULL, "targetId" TEXT NOT NULL, "commentId" TEXT, "reason" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'open', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "TasteReport_status_createdAt_idx" ON "TasteReport"("status", "createdAt");
CREATE TABLE "TasteModeration" (
 "id" TEXT PRIMARY KEY, "reportId" TEXT NOT NULL, "actorId" TEXT NOT NULL,
 "action" TEXT NOT NULL, "note" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "TasteMutation" (
 "memberId" TEXT NOT NULL REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE, "key" TEXT NOT NULL,
 "fingerprint" TEXT NOT NULL, "result" JSONB NOT NULL,
 PRIMARY KEY("memberId", "key")
);
