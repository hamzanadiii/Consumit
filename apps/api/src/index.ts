import { buildApp } from './app.ts'
import { createTmdbCatalog } from './catalog/tmdb-catalog.ts'
import { loadEnv } from './config/env.ts'

const env = loadEnv()
const catalog = env.tmdbToken
  ? createTmdbCatalog({
    language: env.tmdbLanguage,
    region: env.tmdbRegion,
    token: env.tmdbToken,
  })
  : undefined
const app = await buildApp(catalog ? { catalog, env } : { env })

if (!env.tmdbToken) {
  app.log.warn('TMDB_API_READ_TOKEN is missing; catalog routes will return 503.')
}

// Let in-flight requests drain before the process exits. Queues, pools, and
// workers join this shutdown path as they arrive (never mid-write).
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void app.close().then(
      () => process.exit(0),
      (error: unknown) => {
        app.log.error(error)
        process.exit(1)
      },
    )
  })
}

try {
  await app.listen({ host: '0.0.0.0', port: env.port })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
