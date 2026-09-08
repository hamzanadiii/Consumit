CREATE TYPE "CatalogKind" AS ENUM ('MOVIE', 'SERIES');
CREATE TYPE "DataOrigin" AS ENUM ('NATIVE', 'LETTERBOXD');
CREATE TYPE "ImportBatchStatus" AS ENUM ('UPLOADED', 'PROCESSING', 'NEEDS_REVIEW', 'READY', 'CONFIRMED', 'FAILED');
CREATE TYPE "ImportMatchStatus" AS ENUM ('EXACT', 'CONFIDENT', 'NEEDS_REVIEW', 'UNMATCHED', 'SKIPPED');
CREATE TYPE "ImportRowKind" AS ENUM ('PROFILE', 'WATCHED', 'DIARY', 'RATING', 'REVIEW', 'WATCHLIST', 'FAVORITE', 'LIST_ITEM');

ALTER TABLE "Profile"
  ADD COLUMN "bioOrigin" "DataOrigin" NOT NULL DEFAULT 'NATIVE',
  ADD COLUMN "displayNameOrigin" "DataOrigin" NOT NULL DEFAULT 'NATIVE',
  ADD COLUMN "locationOrigin" "DataOrigin" NOT NULL DEFAULT 'NATIVE';

CREATE TABLE "WatchedTitle" (
  "id" TEXT NOT NULL, "memberId" TEXT NOT NULL, "catalogKind" "CatalogKind" NOT NULL DEFAULT 'MOVIE',
  "tmdbId" INTEGER NOT NULL, "origin" "DataOrigin" NOT NULL DEFAULT 'NATIVE', "sourceKey" TEXT,
  "importBatchId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WatchedTitle_pkey" PRIMARY KEY ("id"), CONSTRAINT "WatchedTitle_tmdbId_check" CHECK ("tmdbId" > 0)
);
CREATE TABLE "DiaryEntry" (
  "id" TEXT NOT NULL, "memberId" TEXT NOT NULL, "catalogKind" "CatalogKind" NOT NULL DEFAULT 'MOVIE', "tmdbId" INTEGER NOT NULL,
  "watchedOn" DATE NOT NULL, "rewatch" BOOLEAN NOT NULL DEFAULT false, "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "origin" "DataOrigin" NOT NULL DEFAULT 'NATIVE', "sourceKey" TEXT, "importBatchId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DiaryEntry_pkey" PRIMARY KEY ("id"), CONSTRAINT "DiaryEntry_tmdbId_check" CHECK ("tmdbId" > 0)
);
CREATE TABLE "Rating" (
  "id" TEXT NOT NULL, "memberId" TEXT NOT NULL, "catalogKind" "CatalogKind" NOT NULL DEFAULT 'MOVIE', "tmdbId" INTEGER NOT NULL,
  "value" INTEGER NOT NULL, "origin" "DataOrigin" NOT NULL DEFAULT 'NATIVE', "sourceKey" TEXT, "importBatchId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Rating_pkey" PRIMARY KEY ("id"), CONSTRAINT "Rating_value_check" CHECK ("value" BETWEEN 1 AND 10),
  CONSTRAINT "Rating_tmdbId_check" CHECK ("tmdbId" > 0)
);
CREATE TABLE "Review" (
  "id" TEXT NOT NULL, "memberId" TEXT NOT NULL, "catalogKind" "CatalogKind" NOT NULL DEFAULT 'MOVIE', "tmdbId" INTEGER NOT NULL,
  "body" TEXT NOT NULL, "reviewedOn" DATE, "tags" TEXT[] DEFAULT ARRAY[]::TEXT[], "origin" "DataOrigin" NOT NULL DEFAULT 'NATIVE',
  "sourceKey" TEXT, "importBatchId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Review_pkey" PRIMARY KEY ("id"), CONSTRAINT "Review_tmdbId_check" CHECK ("tmdbId" > 0)
);
CREATE TABLE "SavedTitle" (
  "id" TEXT NOT NULL, "memberId" TEXT NOT NULL, "catalogKind" "CatalogKind" NOT NULL DEFAULT 'MOVIE', "tmdbId" INTEGER NOT NULL,
  "origin" "DataOrigin" NOT NULL DEFAULT 'NATIVE', "sourceKey" TEXT, "importBatchId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SavedTitle_pkey" PRIMARY KEY ("id"), CONSTRAINT "SavedTitle_tmdbId_check" CHECK ("tmdbId" > 0)
);
CREATE TABLE "Favorite" (
  "id" TEXT NOT NULL, "memberId" TEXT NOT NULL, "position" INTEGER NOT NULL, "catalogKind" "CatalogKind" NOT NULL DEFAULT 'MOVIE',
  "tmdbId" INTEGER NOT NULL, "origin" "DataOrigin" NOT NULL DEFAULT 'NATIVE', "sourceKey" TEXT, "importBatchId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id"), CONSTRAINT "Favorite_position_check" CHECK ("position" BETWEEN 1 AND 4),
  CONSTRAINT "Favorite_tmdbId_check" CHECK ("tmdbId" > 0)
);
CREATE TABLE "MemberList" (
  "id" TEXT NOT NULL, "memberId" TEXT NOT NULL, "name" TEXT NOT NULL, "slug" TEXT NOT NULL, "description" TEXT,
  "visibility" TEXT NOT NULL DEFAULT 'private', "origin" "DataOrigin" NOT NULL DEFAULT 'NATIVE', "sourceKey" TEXT,
  "importBatchId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MemberList_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ListItem" (
  "id" TEXT NOT NULL, "listId" TEXT NOT NULL, "position" INTEGER NOT NULL, "catalogKind" "CatalogKind" NOT NULL DEFAULT 'MOVIE',
  "tmdbId" INTEGER NOT NULL, "note" TEXT, "origin" "DataOrigin" NOT NULL DEFAULT 'NATIVE', "sourceKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ListItem_pkey" PRIMARY KEY ("id"), CONSTRAINT "ListItem_position_check" CHECK ("position" > 0),
  CONSTRAINT "ListItem_tmdbId_check" CHECK ("tmdbId" > 0)
);
CREATE TABLE "ImportBatch" (
  "id" TEXT NOT NULL, "memberId" TEXT NOT NULL, "status" "ImportBatchStatus" NOT NULL DEFAULT 'UPLOADED',
  "archiveSha256" TEXT NOT NULL, "sourceFilename" TEXT NOT NULL, "profileDraft" JSONB,
  "totalCount" INTEGER NOT NULL DEFAULT 0, "exactCount" INTEGER NOT NULL DEFAULT 0, "confidentCount" INTEGER NOT NULL DEFAULT 0,
  "reviewCount" INTEGER NOT NULL DEFAULT 0, "unmatchedCount" INTEGER NOT NULL DEFAULT 0, "skippedCount" INTEGER NOT NULL DEFAULT 0,
  "failedReason" TEXT, "workerId" TEXT, "claimedAt" TIMESTAMP(3), "attempts" INTEGER NOT NULL DEFAULT 0,
  "confirmedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ImportStagedRecord" (
  "id" TEXT NOT NULL, "importBatchId" TEXT NOT NULL, "rowKind" "ImportRowKind" NOT NULL, "sourceKey" TEXT NOT NULL,
  "sourceFile" TEXT NOT NULL, "rowNumber" INTEGER NOT NULL, "payload" JSONB NOT NULL, "title" TEXT,
  "normalizedTitle" TEXT, "year" INTEGER, "tmdbId" INTEGER, "imdbId" TEXT,
  "matchStatus" "ImportMatchStatus" NOT NULL DEFAULT 'UNMATCHED', "selectedTmdbId" INTEGER, "candidates" JSONB,
  "matchedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ImportStagedRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WatchedTitle_memberId_catalogKind_tmdbId_key" ON "WatchedTitle"("memberId", "catalogKind", "tmdbId");
CREATE UNIQUE INDEX "WatchedTitle_memberId_origin_sourceKey_key" ON "WatchedTitle"("memberId", "origin", "sourceKey");
CREATE INDEX "DiaryEntry_memberId_watchedOn_idx" ON "DiaryEntry"("memberId", "watchedOn");
CREATE UNIQUE INDEX "DiaryEntry_memberId_origin_sourceKey_key" ON "DiaryEntry"("memberId", "origin", "sourceKey");
CREATE UNIQUE INDEX "Rating_memberId_catalogKind_tmdbId_key" ON "Rating"("memberId", "catalogKind", "tmdbId");
CREATE UNIQUE INDEX "Rating_memberId_origin_sourceKey_key" ON "Rating"("memberId", "origin", "sourceKey");
CREATE INDEX "Review_memberId_reviewedOn_idx" ON "Review"("memberId", "reviewedOn");
CREATE UNIQUE INDEX "Review_memberId_origin_sourceKey_key" ON "Review"("memberId", "origin", "sourceKey");
CREATE UNIQUE INDEX "SavedTitle_memberId_catalogKind_tmdbId_key" ON "SavedTitle"("memberId", "catalogKind", "tmdbId");
CREATE UNIQUE INDEX "SavedTitle_memberId_origin_sourceKey_key" ON "SavedTitle"("memberId", "origin", "sourceKey");
CREATE UNIQUE INDEX "Favorite_memberId_position_key" ON "Favorite"("memberId", "position");
CREATE UNIQUE INDEX "Favorite_memberId_catalogKind_tmdbId_key" ON "Favorite"("memberId", "catalogKind", "tmdbId");
CREATE UNIQUE INDEX "MemberList_slug_key" ON "MemberList"("slug");
CREATE INDEX "MemberList_memberId_idx" ON "MemberList"("memberId");
CREATE UNIQUE INDEX "MemberList_memberId_origin_sourceKey_key" ON "MemberList"("memberId", "origin", "sourceKey");
CREATE UNIQUE INDEX "ListItem_listId_position_key" ON "ListItem"("listId", "position");
CREATE UNIQUE INDEX "ListItem_listId_origin_sourceKey_key" ON "ListItem"("listId", "origin", "sourceKey");
CREATE INDEX "ImportBatch_memberId_createdAt_idx" ON "ImportBatch"("memberId", "createdAt");
CREATE INDEX "ImportBatch_status_claimedAt_idx" ON "ImportBatch"("status", "claimedAt");
CREATE INDEX "ImportStagedRecord_importBatchId_matchStatus_idx" ON "ImportStagedRecord"("importBatchId", "matchStatus");
CREATE UNIQUE INDEX "ImportStagedRecord_importBatchId_rowKind_sourceKey_key" ON "ImportStagedRecord"("importBatchId", "rowKind", "sourceKey");

ALTER TABLE "WatchedTitle" ADD CONSTRAINT "WatchedTitle_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiaryEntry" ADD CONSTRAINT "DiaryEntry_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavedTitle" ADD CONSTRAINT "SavedTitle_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemberList" ADD CONSTRAINT "MemberList_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ListItem" ADD CONSTRAINT "ListItem_listId_fkey" FOREIGN KEY ("listId") REFERENCES "MemberList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImportStagedRecord" ADD CONSTRAINT "ImportStagedRecord_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
