import { experiencePatchSchema, experienceResponseSchema } from '@consumit/contracts'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { ApiEnv } from '../config/env.ts'
import type { Identity } from '../identity/identity.ts'
import { sessionCookieName } from '../identity/session.ts'
import { requestMember } from '../http/request-member.ts'
import { isAllowedOrigin } from '../http/csrf.ts'
import { ApiError } from '../http/errors.ts'
import type { ExperienceRepository } from './repository.ts'

export function registerExperienceRoutes(app: FastifyInstance, deps: { env: ApiEnv; identity: Identity; repository?: ExperienceRepository | undefined }) {
  async function owner(request: FastifyRequest, mutation = false) {
    if (mutation && !isAllowedOrigin(request.headers, deps.env.appOrigin, deps.env.nodeEnv !== 'production')) throw new ApiError('FORBIDDEN', 'This request is not allowed.')
    const member = await requestMember(request, deps.identity, sessionCookieName(deps.env))
    if (!member) throw new ApiError('UNAUTHENTICATED', 'Sign in to save your preferences.')
    return member.id
  }
  function repository() {
    if (!deps.repository) throw new ApiError('INTERNAL', 'Preferences are temporarily unavailable. Try again.', { retryable: true })
    return deps.repository
  }
  app.get('/v1/me/experience-preferences', async (request, reply) => {
    reply.header('cache-control', 'private, no-store')
    const memberId = await owner(request)
    return experienceResponseSchema.parse(await repository().read(memberId))
  })
  app.patch('/v1/me/experience-preferences', async (request, reply) => {
    reply.header('cache-control', 'private, no-store')
    const memberId = await owner(request, true)
    const parsed = experiencePatchSchema.safeParse(request.body)
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Choose valid viewing preferences.')
    return experienceResponseSchema.parse(await repository().patch(memberId, parsed.data))
  })
}
