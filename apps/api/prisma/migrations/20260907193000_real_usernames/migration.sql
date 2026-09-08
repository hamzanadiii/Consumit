-- Username is the product term. Existing generated values are preserved and
-- retain a NULL change timestamp so migrated members receive one immediate edit.
ALTER TABLE "Profile" RENAME COLUMN "handle" TO "username";
ALTER INDEX "Profile_handle_key" RENAME TO "Profile_username_key";
ALTER TABLE "Profile" ADD COLUMN "location" TEXT;
ALTER TABLE "Profile" ADD COLUMN "usernameChangedAt" TIMESTAMP(3);

CREATE TABLE "UsernameAlias" (
    "username" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UsernameAlias_pkey" PRIMARY KEY ("username")
);

CREATE INDEX "UsernameAlias_memberId_idx" ON "UsernameAlias"("memberId");
ALTER TABLE "UsernameAlias" ADD CONSTRAINT "UsernameAlias_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
