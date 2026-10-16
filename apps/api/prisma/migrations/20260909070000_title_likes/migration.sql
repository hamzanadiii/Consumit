CREATE TABLE "TitleLike" (
  "id" TEXT NOT NULL, "memberId" TEXT NOT NULL, "catalogKind" "CatalogKind" NOT NULL DEFAULT 'MOVIE', "tmdbId" INTEGER NOT NULL,
  "origin" "DataOrigin" NOT NULL DEFAULT 'NATIVE', "sourceKey" TEXT, "importBatchId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TitleLike_pkey" PRIMARY KEY ("id"), CONSTRAINT "TitleLike_tmdbId_check" CHECK ("tmdbId" > 0)
);
CREATE UNIQUE INDEX "TitleLike_memberId_catalogKind_tmdbId_key" ON "TitleLike"("memberId", "catalogKind", "tmdbId");
CREATE UNIQUE INDEX "TitleLike_memberId_origin_sourceKey_key" ON "TitleLike"("memberId", "origin", "sourceKey");
ALTER TABLE "TitleLike" ADD CONSTRAINT "TitleLike_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
