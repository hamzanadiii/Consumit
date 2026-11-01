CREATE TABLE "UserSubtitleCorrection" (
 "id" TEXT NOT NULL, "memberId" TEXT NOT NULL, "contentKey" TEXT NOT NULL,
 "videoVersion" TEXT NOT NULL, "contentChecksum" TEXT NOT NULL, "trackId" TEXT,
 "offsetMs" INTEGER NOT NULL DEFAULT 0 CHECK ("offsetMs" BETWEEN -120000 AND 120000),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "UserSubtitleCorrection_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "UserSubtitleCorrection_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "subtitle_correction_scope_key" ON "UserSubtitleCorrection"("memberId", "contentKey", "videoVersion", "contentChecksum");
