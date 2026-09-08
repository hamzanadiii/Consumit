-- Member-chosen avatar image address (http(s) only, validated at the API
-- boundary). Null means the generated tile treatment applies.
ALTER TABLE "Profile" ADD COLUMN "avatarUrl" TEXT;
