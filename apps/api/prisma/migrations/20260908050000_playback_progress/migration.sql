-- Resume positions keyed by member and title/episode, never by provider or
-- source. Season and episode default to zero (movies) so the uniqueness
-- constraint stays NULL-safe.
CREATE TABLE "PlaybackProgress" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "catalogKind" "CatalogKind" NOT NULL DEFAULT 'MOVIE',
    "tmdbId" INTEGER NOT NULL,
    "season" INTEGER NOT NULL DEFAULT 0,
    "episode" INTEGER NOT NULL DEFAULT 0,
    "positionSeconds" INTEGER NOT NULL DEFAULT 0,
    "durationSeconds" INTEGER,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaybackProgress_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PlaybackProgress_tmdbId_check" CHECK ("tmdbId" > 0),
    CONSTRAINT "PlaybackProgress_season_check" CHECK ("season" >= 0),
    CONSTRAINT "PlaybackProgress_episode_check" CHECK ("episode" >= 0),
    CONSTRAINT "PlaybackProgress_positionSeconds_check" CHECK ("positionSeconds" >= 0)
);
CREATE UNIQUE INDEX "PlaybackProgress_memberId_catalogKind_tmdbId_season_episode_key" ON "PlaybackProgress"("memberId", "catalogKind", "tmdbId", "season", "episode");
CREATE INDEX "PlaybackProgress_memberId_updatedAt_idx" ON "PlaybackProgress"("memberId", "updatedAt" DESC);
ALTER TABLE "PlaybackProgress" ADD CONSTRAINT "PlaybackProgress_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
