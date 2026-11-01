CREATE TYPE "TasteRecommendationResponse" AS ENUM ('SAVED', 'ALREADY_SEEN', 'NOT_INTERESTED');

CREATE TABLE "TasteRecommendation" (
  "id" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "catalogKind" "CatalogKind" NOT NULL,
  "tmdbId" INTEGER NOT NULL,
  "response" "TasteRecommendationResponse",
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "respondedAt" TIMESTAMP(3),
  CONSTRAINT "TasteRecommendation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TasteRecommendation_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TasteRecommendation_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TasteRecommendation_senderId_recipientId_catalogKind_tmdbId_key"
  ON "TasteRecommendation"("senderId", "recipientId", "catalogKind", "tmdbId");
CREATE INDEX "TasteRecommendation_recipientId_createdAt_id_idx"
  ON "TasteRecommendation"("recipientId", "createdAt" DESC, "id");
