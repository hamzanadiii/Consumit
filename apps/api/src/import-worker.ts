import { randomUUID } from 'node:crypto'

import { createTmdbCatalog } from './catalog/tmdb-catalog.ts'
import { loadEnv } from './config/env.ts'
import { createDbClient } from './db/client.ts'
import { createLetterboxdImporter } from './imports/letterboxd/importer.ts'
import { createPostgresLetterboxdImportRepository } from './imports/letterboxd/postgres-repository.ts'

const env = loadEnv()
if (!env.databaseUrl || !env.tmdbToken) throw new Error('DATABASE_URL and TMDB_API_READ_TOKEN are required by the Letterboxd worker.')

const db = createDbClient(env.databaseUrl, {
  ...(env.databaseSslCa ? { sslCa: env.databaseSslCa } : {}),
  sslMode: env.databaseSslMode,
})
const importer = createLetterboxdImporter({
  catalog: createTmdbCatalog({ language: env.tmdbLanguage, region: env.tmdbRegion, token: env.tmdbToken }),
  repository: createPostgresLetterboxdImportRepository(db.prisma),
})
const workerId = `letterboxd-${randomUUID()}`
let stopping = false

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => { stopping = true })
}

try {
  while (!stopping) {
    const worked = await importer.processNext(workerId)
    if (!worked) await new Promise((resolve) => setTimeout(resolve, 2_000))
  }
} finally {
  await db.close()
}
