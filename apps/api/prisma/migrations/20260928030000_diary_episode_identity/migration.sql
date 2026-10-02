-- Preserve deliberate episode logs independently of playback history.
ALTER TABLE "DiaryEntry"
  ADD COLUMN "season" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "episode" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "DiaryEntry"
  ADD CONSTRAINT "DiaryEntry_season_check" CHECK ("season" >= 0),
  ADD CONSTRAINT "DiaryEntry_episode_check" CHECK ("episode" >= 0);
