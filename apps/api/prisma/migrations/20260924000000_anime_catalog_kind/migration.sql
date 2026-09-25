-- Anime titles persist in their own namespace: the unique member-data keys
-- (member, kind, id) must not collide with same-numbered TMDB movies.
ALTER TYPE "CatalogKind" ADD VALUE IF NOT EXISTS 'ANIME';
