ALTER TABLE "PlaybackProgress" ADD COLUMN "hiddenFromContinueAt" TIMESTAMP(3);
CREATE INDEX "PlaybackProgress_memberId_catalogKind_tmdbId_updatedAt_idx" ON "PlaybackProgress"("memberId", "catalogKind", "tmdbId", "updatedAt" DESC);
CREATE TABLE "RecommendationDismissal" (
  "memberId" TEXT NOT NULL,
  "catalogKind" "CatalogKind" NOT NULL,
  "tmdbId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecommendationDismissal_pkey" PRIMARY KEY ("memberId", "catalogKind", "tmdbId"),
  CONSTRAINT "RecommendationDismissal_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
