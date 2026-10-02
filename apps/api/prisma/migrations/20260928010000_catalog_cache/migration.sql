CREATE TABLE "CatalogCacheEntry" (
    "key" VARCHAR(64) NOT NULL,
    "payload" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "freshUntil" TIMESTAMP(3) NOT NULL,
    "staleUntil" TIMESTAMP(3),
    CONSTRAINT "CatalogCacheEntry_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "CatalogCacheEntry_staleUntil_idx" ON "CatalogCacheEntry"("staleUntil");
