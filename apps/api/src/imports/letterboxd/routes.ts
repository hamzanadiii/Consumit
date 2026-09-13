import {
  letterboxdImportDetailSchema,
  letterboxdImportHistorySchema,
  letterboxdImportSchema,
  letterboxdMatchSelectionSchema,
} from '@consumit/contracts'
import type { FastifyInstance, FastifyRequest } from 'fastify'

import type { ApiEnv } from '../../config/env.ts'
import { isAllowedOrigin } from '../../http/csrf.ts'
import { ApiError } from '../../http/errors.ts'
import type { Identity } from '../../identity/identity.ts'
import { sessionCookieName } from '../../identity/session.ts'
import { LetterboxdImportError } from './errors.ts'
import type { LetterboxdImporter } from './importer.ts'
import { LETTERBOXD_UPLOAD_LIMIT } from './parser.ts'

function idParam(request: FastifyRequest): string {
  const id = (request.params as { id?: unknown }).id
  if (typeof id !== 'string' || id.length < 1 || id.length > 128) throw new ApiError('BAD_REQUEST', 'Use a valid import identifier.')
  return id
}

export function registerLetterboxdImportRoutes(app: FastifyInstance, deps: { env: ApiEnv; identity: Identity; importer: LetterboxdImporter }) {
  const cookieName = sessionCookieName(deps.env)

  function guardMutation(request: FastifyRequest) {
    if (!isAllowedOrigin(request.headers, deps.env.appOrigin, deps.env.nodeEnv !== 'production')) throw new ApiError('FORBIDDEN', 'Cross-site requests are not allowed.')
  }

  async function memberId(request: FastifyRequest) {
    const token = request.cookies?.[cookieName]
    if (!token) throw new ApiError('UNAUTHENTICATED', 'Sign in to continue.')
    const member = await deps.identity.getSession(token)
    if (!member) throw new ApiError('UNAUTHENTICATED', 'Sign in to continue.')
    return member.id
  }

  app.post('/v1/me/imports/letterboxd', async (request, reply) => {
    guardMutation(request)
    const ownerId = await memberId(request)
    let file
    try {
      file = await request.file({ limits: { fileSize: LETTERBOXD_UPLOAD_LIMIT, files: 1 } })
    } catch (error) {
      throw new LetterboxdImportError('IMPORT_LIMIT_EXCEEDED', 'The Letterboxd upload exceeds 25 MiB.', { cause: error })
    }
    if (!file) throw new LetterboxdImportError('IMPORT_INVALID_ARCHIVE', 'Choose a Letterboxd ZIP or CSV file.')
    let bytes: Buffer
    try {
      bytes = await file.toBuffer()
    } catch (error) {
      throw new LetterboxdImportError('IMPORT_LIMIT_EXCEEDED', 'The Letterboxd upload exceeds 25 MiB.', { cause: error })
    }
    const imported = await deps.importer.upload(ownerId, file.filename, bytes)
    return reply.code(202).send(letterboxdImportSchema.parse(imported))
  })

  app.get('/v1/me/imports/letterboxd', async (request, reply) => {
    void reply.header('cache-control', 'private, no-store')
    return letterboxdImportHistorySchema.parse({ imports: await deps.importer.history(await memberId(request)) })
  })

  app.delete('/v1/me/imports/letterboxd', async (request, reply) => {
    guardMutation(request)
    await deps.importer.removeImportedData(await memberId(request))
    return reply.code(204).send()
  })

  app.get('/v1/me/imports/letterboxd/:id', async (request, reply) => {
    void reply.header('cache-control', 'private, no-store')
    return letterboxdImportDetailSchema.parse(await deps.importer.detail(await memberId(request), idParam(request)))
  })

  app.patch('/v1/me/imports/letterboxd/:id/items/:itemId', async (request) => {
    guardMutation(request)
    const itemId = (request.params as { itemId?: unknown }).itemId
    if (typeof itemId !== 'string' || !itemId || itemId.length > 128) throw new ApiError('BAD_REQUEST', 'Use a valid import item identifier.')
    const parsed = letterboxdMatchSelectionSchema.safeParse(request.body)
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Choose a TMDB movie or skip this row.')
    const member = await memberId(request)
    await deps.importer.select(member, idParam(request), itemId, parsed.data)
    return letterboxdImportDetailSchema.parse(await deps.importer.detail(member, idParam(request)))
  })

  app.post('/v1/me/imports/letterboxd/:id/retry', async (request, reply) => {
    guardMutation(request)
    await deps.importer.retry(await memberId(request), idParam(request))
    return reply.code(202).send()
  })

  app.post('/v1/me/imports/letterboxd/:id/confirm', async (request, reply) => {
    guardMutation(request)
    await deps.importer.confirm(await memberId(request), idParam(request))
    return reply.code(204).send()
  })

  app.delete('/v1/me/imports/letterboxd/:id', async (request, reply) => {
    guardMutation(request)
    await deps.importer.discard(await memberId(request), idParam(request))
    return reply.code(204).send()
  })
}
