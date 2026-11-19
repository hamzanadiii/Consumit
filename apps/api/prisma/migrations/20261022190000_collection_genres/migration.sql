ALTER TABLE "MemberList" ADD COLUMN "genres" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
CREATE INDEX "MemberList_genres_idx" ON "MemberList" USING GIN ("genres");
