-- Previously stored public flags were treated as private by the application.
-- Keep that effective visibility until each member explicitly publishes again.
UPDATE "Profile" SET visibility = 'private' WHERE visibility <> 'private';
UPDATE "MemberList" SET visibility = 'private' WHERE visibility <> 'private';
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "Profile_public_username_trgm_idx" ON "Profile" USING GIN (username gin_trgm_ops) WHERE visibility = 'public';
CREATE INDEX "Profile_public_display_name_trgm_idx" ON "Profile" USING GIN ("displayName" gin_trgm_ops) WHERE visibility = 'public';
