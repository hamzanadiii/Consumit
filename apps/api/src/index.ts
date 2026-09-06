import { buildApp } from './app.ts'
import { createTmdbCatalog } from './catalog/tmdb-catalog.ts'

const token = process.env.TMDB_API_READ_TOKEN?.trim()
const catalog = token
  ? createTmdbCatalog({
    language: process.env.TMDB_LANGUAGE ?? 'en-US',
    region: process.env.TMDB_REGION ?? 'US',
    token,
  })
  : undefined
const app = buildApp(catalog ? { catalog } : {})
const port = Number(process.env.PORT ?? 3001)

if (!token) {
  app.log.warn('TMDB_API_READ_TOKEN is missing; catalog routes will return 503.')
}

try {
  await app.listen({ host: '0.0.0.0', port })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
