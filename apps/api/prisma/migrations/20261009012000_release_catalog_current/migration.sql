-- Retain notification history when upstream corrects or withdraws a release.
ALTER TABLE "ReleaseEpisode" ADD COLUMN "catalogCurrent" BOOLEAN NOT NULL DEFAULT TRUE;
