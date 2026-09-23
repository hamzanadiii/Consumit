-- CreateEnum
CREATE TYPE "SubtitleKind" AS ENUM ('MOVIE', 'SERIES', 'ANIME');

-- CreateEnum
CREATE TYPE "SubtitleFormat" AS ENUM ('VTT', 'SRT', 'ASS', 'SSA');

-- CreateTable
CREATE TABLE "SubtitleTrack" (
    "id" TEXT NOT NULL,
    "kind" "SubtitleKind" NOT NULL,
    "tmdbId" INTEGER NOT NULL DEFAULT 0,
    "anilistId" INTEGER NOT NULL DEFAULT 0,
    "season" INTEGER NOT NULL DEFAULT 0,
    "episode" INTEGER NOT NULL DEFAULT 0,
    "language" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "format" "SubtitleFormat" NOT NULL DEFAULT 'VTT',
    "provider" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalExt" TEXT,
    "checksum" TEXT NOT NULL,
    "cueCount" INTEGER,
    "durationMs" INTEGER,
    "hi" BOOLEAN NOT NULL DEFAULT false,
    "rating" DOUBLE PRECISION,
    "releaseTag" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubtitleTrack_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubtitleTrack_kind_tmdbId_anilistId_season_episode_language_idx" ON "SubtitleTrack"("kind", "tmdbId", "anilistId", "season", "episode", "language");

-- CreateIndex
CREATE INDEX "SubtitleTrack_checksum_idx" ON "SubtitleTrack"("checksum");

-- CreateIndex
CREATE UNIQUE INDEX "SubtitleTrack_kind_tmdbId_anilistId_season_episode_language_key" ON "SubtitleTrack"("kind", "tmdbId", "anilistId", "season", "episode", "language", "provider", "storageKey");
