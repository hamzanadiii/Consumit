ALTER TABLE "TasteSubscription" ADD COLUMN "updates" BOOLEAN NOT NULL DEFAULT false;
UPDATE "TasteSubscription" SET "updates" = true WHERE "muted" = false;
