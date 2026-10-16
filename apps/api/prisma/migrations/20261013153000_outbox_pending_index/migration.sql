CREATE INDEX "OutboxEvent_pending_idx" ON "OutboxEvent"("createdAt") WHERE "processedAt" IS NULL AND "failedAt" IS NULL;
