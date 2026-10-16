CREATE TABLE "ReviewLike" (
  "id" TEXT NOT NULL, "reviewId" TEXT NOT NULL, "memberId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReviewLike_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReviewLike_reviewId_memberId_key" ON "ReviewLike"("reviewId", "memberId");
CREATE INDEX "ReviewLike_reviewId_idx" ON "ReviewLike"("reviewId");
ALTER TABLE "ReviewLike" ADD CONSTRAINT "ReviewLike_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewLike" ADD CONSTRAINT "ReviewLike_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
