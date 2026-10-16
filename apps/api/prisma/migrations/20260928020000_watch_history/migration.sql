-- Private completion events, independent of playback sources and public diary.
CREATE TABLE "WatchHistoryEntry" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "catalogKind" "CatalogKind" NOT NULL,
    "tmdbId" INTEGER NOT NULL,
    "season" INTEGER NOT NULL DEFAULT 0,
    "episode" INTEGER NOT NULL DEFAULT 0,
    "completionId" UUID NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WatchHistoryEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WatchHistoryEntry_tmdbId_check" CHECK ("tmdbId" > 0),
    CONSTRAINT "WatchHistoryEntry_season_check" CHECK ("season" >= 0),
    CONSTRAINT "WatchHistoryEntry_episode_check" CHECK ("episode" >= 0)
);

CREATE UNIQUE INDEX "WatchHistoryEntry_memberId_catalogKind_tmdbId_season_episode_completionId_key"
ON "WatchHistoryEntry"("memberId", "catalogKind", "tmdbId", "season", "episode", "completionId");
CREATE INDEX "WatchHistoryEntry_memberId_completedAt_id_idx"
ON "WatchHistoryEntry"("memberId", "completedAt" DESC, "id" DESC);
ALTER TABLE "WatchHistoryEntry" ADD CONSTRAINT "WatchHistoryEntry_memberId_fkey"
FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
