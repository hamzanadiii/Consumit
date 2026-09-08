import cookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import Fastify from 'fastify'

import type { Catalog } from './catalog/catalog.ts'
import { registerCatalogRoutes } from './catalog/routes.ts'
import { unavailableCatalogAdapter } from './catalog/unavailable-catalog.ts'
import { loadEnv, type ApiEnv } from './config/env.ts'
import { createDbClient } from './db/client.ts'
import { rateLimitExceeded, registerErrorHandlers } from './http/errors.ts'
import { registerHealthRoutes } from './http/health.ts'
import { generateRequestId, loggerOptions, registerRequestContext } from './http/request-context.ts'
import { createIdentity } from './identity/service.ts'
import { registerIdentityRoutes } from './identity/routes.ts'
import { unavailableIdentity } from './identity/unavailable-identity.ts'
import type { Identity } from './identity/identity.ts'
import { createPostgresIdentityRepository } from './identity/postgres-repository.ts'
import { createResendNotifier } from './identity/resend-notifier.ts'
import { createValkeyAuthState } from './identity/valkey-auth-state.ts'
import { createLetterboxdImporter, type LetterboxdImporter } from './imports/letterboxd/importer.ts'
import { createPostgresLetterboxdImportRepository } from './imports/letterboxd/postgres-repository.ts'
import { registerLetterboxdImportRoutes } from './imports/letterboxd/routes.ts'
import { unavailableLetterboxdImporter } from './imports/letterboxd/unavailable-importer.ts'
import type { MemberData } from './member-data/member-data.ts'
import { createPostgresMemberData } from './member-data/postgres-member-data.ts'
import { registerMemberDataRoutes } from './member-data/routes.ts'
import { unavailableMemberData } from './member-data/unavailable-member-data.ts'

type BuildAppOptions = {
  catalog?: Catalog
  env?: ApiEnv
  identity?: Identity
  letterboxdImporter?: LetterboxdImporter
  memberData?: MemberData
}

export async function buildApp({ catalog = unavailableCatalogAdapter, env = loadEnv(), identity, letterboxdImporter, memberData }: BuildAppOptions = {}) {
  const app = Fastify({
    bodyLimit: 1_048_576,
    connectionTimeout: 10_000,
    genReqId: generateRequestId,
    keepAliveTimeout: 5_000,
    logger: env.nodeEnv !== 'test' ? loggerOptions() : false,
    requestTimeout: 15_000,
    trustProxy: env.trustedProxies.length ? env.trustedProxies : false,
  })

  await app.register(helmet)
  await app.register(cookie)
  await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024, files: 1, parts: 2 } })
  await app.register(rateLimit, {
    errorResponseBuilder: () => rateLimitExceeded(),
    max: 100,
    timeWindow: '1 minute',
  })

  registerErrorHandlers(app)
  registerRequestContext(app)

  let closeIdentityResources: (() => Promise<void>) | undefined
  let resolvedIdentity = identity ?? unavailableIdentity
  let resolvedImporter = letterboxdImporter ?? unavailableLetterboxdImporter
  let resolvedMemberData = memberData ?? unavailableMemberData
  const needsDatabase = env.databaseUrl && (!identity || !letterboxdImporter || !memberData)
  const db = needsDatabase ? createDbClient(env.databaseUrl!, {
      ...(env.databaseSslCa ? { sslCa: env.databaseSslCa } : {}),
      sslMode: env.databaseSslMode,
    }) : null
  if (!identity && db && env.valkeyUrl && env.authCodePepper && env.resendApiKey && env.authEmailFrom) {
    const state = createValkeyAuthState(env.valkeyUrl, env.authCodePepper)
    resolvedIdentity = createIdentity({
      notifier: createResendNotifier({ apiKey: env.resendApiKey, from: env.authEmailFrom }),
      onNotificationError: (error) => app.log.error({ err: error }, 'authentication email was not delivered'),
      repository: createPostgresIdentityRepository(db.prisma),
      state,
    })
    closeIdentityResources = async () => {
      await Promise.allSettled([state.close(), db.close()])
    }
  }
  if (!letterboxdImporter && db) {
    resolvedImporter = createLetterboxdImporter({ catalog, repository: createPostgresLetterboxdImportRepository(db.prisma) })
    closeIdentityResources ??= async () => db.close()
  }
  if (!memberData && db) resolvedMemberData = createPostgresMemberData(db.prisma)

  app.addHook('onClose', async () => closeIdentityResources?.())
  registerHealthRoutes(app, {
    catalogConfigured: catalog !== unavailableCatalogAdapter,
    identityConfigured: resolvedIdentity !== unavailableIdentity,
  })
  registerIdentityRoutes(app, { env, identity: resolvedIdentity })
  registerLetterboxdImportRoutes(app, { env, identity: resolvedIdentity, importer: resolvedImporter })
  registerMemberDataRoutes(app, { env, identity: resolvedIdentity, memberData: resolvedMemberData })
  registerCatalogRoutes(app, catalog)

  return app
}
