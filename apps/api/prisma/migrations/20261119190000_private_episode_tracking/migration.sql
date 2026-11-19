CREATE TYPE "EpisodeTracking" AS ENUM ('continue', 'watched');

ALTER TABLE "PlaybackProgress" ADD COLUMN "episodeTracking" "EpisodeTracking";
