import { buildApp } from '../../apps/api/src/app.ts'
import { buildPlaybackApp } from '../../apps/playback/src/app.ts'
import { loadEnv } from '../../apps/api/src/config/env.ts'
import { seedRebuildMember } from './seed.mts'
import { createFakeCatalog } from '../../apps/api/src/catalog/fake-catalog.ts'
import { movieDetail, seriesDetail } from '../../apps/web/src/test/catalog-fixtures.ts'
import { createAnilistCatalog } from '../../apps/api/src/catalog/anilist/adapter.ts'
import { createAnilistCache } from '../../apps/api/src/catalog/anilist/cache.ts'

const database = process.env.DATABASE_URL
if (!database || !new URL(database).pathname.endsWith('_test')) throw new Error('Rebuild fixtures require a dedicated test database.')
const role = process.argv[2]
if (role !== 'api' && role !== 'playback') throw new Error('Select an API or playback fixture process.')
const common = { ...process.env, NODE_ENV: 'test', AUTH_EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'fixture-unused', AUTH_EMAIL_FROM: 'Consumit <fixture@example.test>', APP_ORIGIN: 'http://127.0.0.1:28119', INTERNAL_SERVICE_SECRET: 'rebuild-fixture-internal-secret-at-least-32', PLAYBACK_ENABLED: 'true', PLAYBACK_MEDIA_CONFIG: process.env.REBUILD_PROVIDER_FILE, PLAYBACK_PROBE_INTERVAL_MINUTES: '0', BACKGROUND_JOBS_ENABLED: 'true' }
let app
if (role === 'api') {
  await seedRebuildMember(database)
  const animeCatalog = createAnilistCatalog({ client: { cache: createAnilistCache(), query: async <T>() => ({ Page: { media: [], pageInfo: { total: 0, lastPage: 0, hasNextPage: false } }, Media: null, AiringSchedule: { nodes: [], pageInfo: { total: 0, lastPage: 0, hasNextPage: false } } }) as T } })
  app = await buildApp({ env: loadEnv({ ...common, APPLICATION_MODE: 'product', INTERNAL_PLAYBACK_ORIGIN: 'http://127.0.0.1:18590' }), animeCatalog, catalog: createFakeCatalog({ titles: [movieDetail, seriesDetail].map(title => ({ ...title, posterUrl: null, backdropUrl: null, recommendations: [] })) }) })
} else {
  app = await buildPlaybackApp(loadEnv({ ...common, APPLICATION_MODE: 'playback', DATABASE_URL: undefined, INTERNAL_API_ORIGIN: 'http://127.0.0.1:18589' }), fetch, { subtitles: { search: async () => [], file: async () => null, original: async () => null } })
}
await app.listen({ host: '127.0.0.1', port: role === 'api' ? 18589 : 18590 })
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => { void app.close().then(() => process.exit(0)) })
