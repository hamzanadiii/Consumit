-- CreateTable
CREATE TABLE "UserSubtitlePreference" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "kind" "SubtitleKind" NOT NULL,
    "tmdbId" INTEGER NOT NULL DEFAULT 0,
    "anilistId" INTEGER NOT NULL DEFAULT 0,
    "season" INTEGER NOT NULL DEFAULT 0,
    "episode" INTEGER NOT NULL DEFAULT 0,
    "trackId" TEXT,
    "offsetMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSubtitlePreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserSubtitlePreference_memberId_idx" ON "UserSubtitlePreference"("memberId");

-- CreateIndex
CREATE INDEX "UserSubtitlePreference_kind_tmdbId_anilistId_season_episode_idx" ON "UserSubtitlePreference"("kind", "tmdbId", "anilistId", "season", "episode");

-- CreateIndex
CREATE UNIQUE INDEX "UserSubtitlePreference_memberId_kind_tmdbId_anilistId_seaso_key" ON "UserSubtitlePreference"("memberId", "kind", "tmdbId", "anilistId", "season", "episode");

-- AddForeignKey
ALTER TABLE "UserSubtitlePreference" ADD CONSTRAINT "UserSubtitlePreference_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
