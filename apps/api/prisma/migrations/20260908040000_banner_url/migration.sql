-- Member-chosen profile banner artwork address. Only TMDB artwork CDN
-- addresses are accepted, enforced at the API boundary. Null means the
-- favorites artwork (then the plain surface) applies.
ALTER TABLE "Profile" ADD COLUMN "bannerUrl" TEXT;
