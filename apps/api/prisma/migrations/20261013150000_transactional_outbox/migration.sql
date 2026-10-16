CREATE TABLE "OutboxEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseUntil" TIMESTAMPTZ(3),
  "leaseToken" TEXT,
  "processedAt" TIMESTAMPTZ(3),
  "failedAt" TIMESTAMPTZ(3),
  "attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("attempts" >= 0),
  "lastFailure" TEXT
);
CREATE INDEX "OutboxEvent_availableAt_createdAt_idx" ON "OutboxEvent"("availableAt", "createdAt");
