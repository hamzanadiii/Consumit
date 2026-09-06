import { createTmdbCatalog } from './tmdb-catalog.ts'

const token = process.env.TMDB_API_READ_TOKEN?.trim()
if (!token) {
  throw new Error('TMDB_API_READ_TOKEN is required for the opt-in live smoke test.')
}

const catalog = createTmdbCatalog({
  language: process.env.TMDB_LANGUAGE ?? 'en-US',
  region: process.env.TMDB_REGION ?? 'US',
  token,
})

const [dune, dark] = await Promise.all([
  catalog.title('movie', 693134),
  catalog.title('series', 70523),
])

if (dune.item.kind !== 'movie' || dune.item.title !== 'Dune: Part Two') {
  throw new Error('TMDB live smoke test returned an unexpected movie response.')
}
if (dark.item.kind !== 'series' || dark.item.title !== 'Dark') {
  throw new Error('TMDB live smoke test returned an unexpected series response.')
}

console.info('TMDB live smoke passed:', dune.item.title, 'and', dark.item.title)
