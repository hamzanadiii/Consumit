ALTER TABLE "DiaryEntry" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "DiaryEntry_memberId_origin_idempotencyKey_key"
ON "DiaryEntry"("memberId", "origin", "idempotencyKey");
