CREATE TABLE "ReleaseTracking" (
  "memberId" TEXT NOT NULL REFERENCES "Member"("id") ON DELETE CASCADE,
  "catalogKind" "CatalogKind" NOT NULL CHECK ("catalogKind" IN ('SERIES','ANIME')),
  "tmdbId" INTEGER NOT NULL, "trackedSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("memberId", "catalogKind", "tmdbId")
);
CREATE INDEX "ReleaseTracking_catalogKind_tmdbId_idx" ON "ReleaseTracking"("catalogKind", "tmdbId");
CREATE TABLE "NotificationPreference" (
  "memberId" TEXT PRIMARY KEY REFERENCES "Member"("id") ON DELETE CASCADE, "enabledAt" TIMESTAMP(3)
);
CREATE TABLE "ReleaseTitle" (
  "catalogKind" "CatalogKind" NOT NULL, "tmdbId" INTEGER NOT NULL,
  "refreshAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "leaseUntil" TIMESTAMP(3), "leaseToken" TEXT,
  "failed" BOOLEAN NOT NULL DEFAULT FALSE, PRIMARY KEY ("catalogKind", "tmdbId")
);
CREATE INDEX "ReleaseTitle_refreshAfter_idx" ON "ReleaseTitle"("refreshAfter");
CREATE TABLE "ReleaseEpisode" (
  "id" TEXT PRIMARY KEY, "catalogKind" "CatalogKind" NOT NULL, "tmdbId" INTEGER NOT NULL,
  "season" INTEGER NOT NULL, "episode" INTEGER NOT NULL CHECK ("episode" > 0), "title" TEXT NOT NULL,
  "episodeTitle" TEXT, "imageUrl" TEXT, "releasedAt" TIMESTAMP(3) NOT NULL, "datePrecision" TEXT NOT NULL,
  "verifyAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "providerCursor" INTEGER NOT NULL DEFAULT 0,
  "checkedAt" TIMESTAMP(3), "providerId" TEXT, "revision" TEXT, "region" TEXT, "audioLanguage" TEXT,
  UNIQUE ("catalogKind", "tmdbId", "season", "episode"),
  CHECK (("catalogKind"='SERIES' AND "season">0) OR ("catalogKind"='ANIME' AND "season"=0)),
  CHECK ("datePrecision" IN ('date','instant'))
);
CREATE INDEX "ReleaseEpisode_verifyAfter_idx" ON "ReleaseEpisode"("verifyAfter");
CREATE INDEX "ReleaseEpisode_catalogKind_tmdbId_releasedAt_idx" ON "ReleaseEpisode"("catalogKind", "tmdbId", "releasedAt");
CREATE TABLE "ReleaseCheck" (
  "id" TEXT PRIMARY KEY, "episodeId" TEXT NOT NULL REFERENCES "ReleaseEpisode"("id") ON DELETE CASCADE,
  "leaseToken" TEXT NOT NULL, "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "leaseUntil" TIMESTAMP(3) NOT NULL,
  "finishedAt" TIMESTAMP(3), "attempts" INTEGER NOT NULL DEFAULT 0,
  "providerId" TEXT, "revision" TEXT, "region" TEXT, "audioLanguage" TEXT,
  "passed" BOOLEAN NOT NULL DEFAULT FALSE, "failure" TEXT
);
CREATE INDEX "ReleaseCheck_startedAt_idx" ON "ReleaseCheck"("startedAt");
CREATE INDEX "ReleaseCheck_leaseUntil_finishedAt_idx" ON "ReleaseCheck"("leaseUntil", "finishedAt");
CREATE TABLE "ReleaseNotification" (
  "id" TEXT PRIMARY KEY, "memberId" TEXT NOT NULL REFERENCES "Member"("id") ON DELETE CASCADE,
  "episodeId" TEXT NOT NULL REFERENCES "ReleaseEpisode"("id") ON DELETE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "checkedAt" TIMESTAMP(3) NOT NULL, "readAt" TIMESTAMP(3),
  UNIQUE ("memberId", "episodeId")
);
CREATE INDEX "ReleaseNotification_memberId_createdAt_id_idx" ON "ReleaseNotification"("memberId", "createdAt" DESC, "id" DESC);
-- Existing titles start tracking at rollout, preventing historical alert backfill.
INSERT INTO "ReleaseTracking" ("memberId", "catalogKind", "tmdbId")
SELECT "memberId", "catalogKind", "tmdbId" FROM "SavedTitle" WHERE "catalogKind" IN ('SERIES','ANIME')
UNION SELECT "memberId", "catalogKind", "tmdbId" FROM "Favorite" WHERE "catalogKind" IN ('SERIES','ANIME');
INSERT INTO "ReleaseTitle" ("catalogKind", "tmdbId") SELECT DISTINCT "catalogKind", "tmdbId" FROM "ReleaseTracking";
