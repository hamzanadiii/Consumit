CREATE TABLE "ProviderOverride" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "configJson" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "ProviderConfigRevision" (
  "id" INTEGER NOT NULL PRIMARY KEY,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "ProviderChange" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "providerId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "beforeJson" TEXT NOT NULL,
  "afterJson" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "ProviderChange_providerId_createdAt_idx" ON "ProviderChange"("providerId", "createdAt" DESC);
