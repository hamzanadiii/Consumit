-- Member-chosen avatar tile treatment. Existing profiles keep the default
-- dusk tile, which matches the long-standing initials treatment.
ALTER TABLE "Profile" ADD COLUMN "avatarStyle" TEXT NOT NULL DEFAULT 'dusk';
