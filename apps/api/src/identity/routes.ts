import {
  acceptedResponseSchema,
  accountDeletionRequestSchema,
  emailRequestSchema,
  loginRequestSchema,
  memberExportSchema,
  passwordChangeRequestSchema,
  profileSchema,
  recoveryConfirmRequestSchema,
  registerRequestSchema,
  sessionMemberResponseSchema,
  updateProfileRequestSchema,
  usernameAvailabilityResponseSchema,
  usernameSchema,
  verifyEmailRequestSchema,
} from '@consumit/contracts'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { ZodType } from 'zod'

import type { ApiEnv } from '../config/env.ts'
import { isAllowedOrigin } from '../http/csrf.ts'
import { ApiError } from '../http/errors.ts'
import type { Identity } from './identity.ts'
import { sessionCookieName, sessionCookieOptions } from './session.ts'

const accepted = acceptedResponseSchema.parse({
  message: 'If the address can continue, an email is on its way.',
  status: 'accepted',
})
const credentialLimit = { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }
const codeRequestLimit = { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }
const codeConfirmLimit = { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } }

function parse<T>(schema: ZodType<T>, value: unknown, message: string): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new ApiError('BAD_REQUEST', message)
  return result.data
}

export function registerIdentityRoutes(app: FastifyInstance, deps: { env: ApiEnv; identity: Identity }) {
  const { env, identity } = deps
  const cookieName = sessionCookieName(env)
  const cookieOptions = sessionCookieOptions(env)

  function guardMutation(request: FastifyRequest) {
    if (!isAllowedOrigin(request.headers, env.appOrigin, env.nodeEnv !== 'production')) {
      throw new ApiError('FORBIDDEN', 'Cross-site requests are not allowed.')
    }
  }

  function tokenOf(request: FastifyRequest) {
    const token = request.cookies?.[cookieName]
    if (typeof token !== 'string' || token.length === 0) throw new ApiError('UNAUTHENTICATED', 'Sign in to continue.')
    return token
  }

  function setSessionCookie(reply: FastifyReply, token: string) {
    void reply.setCookie(cookieName, token, cookieOptions)
  }

  function clearSessionCookie(reply: FastifyReply) {
    void reply.clearCookie(cookieName, { httpOnly: true, path: '/', sameSite: 'lax', secure: cookieOptions.secure })
  }

  function noSharedCache(reply: FastifyReply) {
    // Member-specific responses must never sit in a shared cache.
    void reply.header('cache-control', 'private, no-store')
  }

  app.post('/v1/auth/register', codeRequestLimit, async (request, reply) => {
    guardMutation(request)
    const body = parse(registerRequestSchema, request.body, 'Use a valid email and a password of 12 to 128 characters.')
    await identity.register(body)
    return reply.code(202).send(accepted)
  })

  app.get('/v1/usernames/:username/availability', async (request) => {
    const username = parse(usernameSchema, (request.params as { username?: unknown }).username, 'Use a valid username.')
    return usernameAvailabilityResponseSchema.parse(await identity.usernameAvailability(username))
  })

  app.post('/v1/auth/verification/request', codeRequestLimit, async (request, reply) => {
    guardMutation(request)
    const body = parse(emailRequestSchema, request.body, 'Use a valid email address.')
    await identity.requestVerification(body.email)
    return reply.code(202).send(accepted)
  })

  app.post('/v1/auth/verify-email', codeConfirmLimit, async (request, reply) => {
    guardMutation(request)
    const body = parse(verifyEmailRequestSchema, request.body, 'Use a valid email address and six-digit code.')
    const result = await identity.verifyEmail(body)
    setSessionCookie(reply, result.sessionToken)
    return reply.send(sessionMemberResponseSchema.parse({ member: result.member }))
  })

  app.post('/v1/auth/login', credentialLimit, async (request, reply) => {
    guardMutation(request)
    const body = parse(loginRequestSchema, request.body, 'Use a valid email address and password.')
    const previous = request.cookies?.[cookieName]
    const result = await identity.login(body)
    if (previous) await identity.logout(previous)
    setSessionCookie(reply, result.sessionToken)
    return reply.send(sessionMemberResponseSchema.parse({ member: result.member }))
  })

  app.post('/v1/auth/logout', async (request, reply) => {
    guardMutation(request)
    const token = request.cookies?.[cookieName]
    if (typeof token === 'string' && token) await identity.logout(token)
    clearSessionCookie(reply)
    return reply.code(204).send()
  })

  app.post('/v1/auth/logout-all', async (request, reply) => {
    guardMutation(request)
    await identity.logoutAll(tokenOf(request))
    clearSessionCookie(reply)
    return reply.code(204).send()
  })

  app.post('/v1/auth/recovery/request', codeRequestLimit, async (request, reply) => {
    guardMutation(request)
    const body = parse(emailRequestSchema, request.body, 'Use a valid email address.')
    await identity.requestRecovery(body.email)
    return reply.code(202).send(accepted)
  })

  app.post('/v1/auth/recovery/confirm', codeConfirmLimit, async (request, reply) => {
    guardMutation(request)
    const body = parse(recoveryConfirmRequestSchema, request.body, 'Use a valid email, six-digit code, and new password.')
    await identity.recoverPassword(body)
    return reply.code(204).send()
  })

  app.post('/v1/auth/password/change', credentialLimit, async (request, reply) => {
    guardMutation(request)
    const body = parse(passwordChangeRequestSchema, request.body, 'Use valid current and new passwords.')
    const result = await identity.changePassword(tokenOf(request), body)
    setSessionCookie(reply, result.sessionToken)
    return reply.code(204).send()
  })

  app.get('/v1/me', async (request, reply) => {
    noSharedCache(reply)
    const member = await identity.getSession(tokenOf(request))
    if (!member) throw new ApiError('UNAUTHENTICATED', 'Sign in to continue.')
    return sessionMemberResponseSchema.parse({ member })
  })

  app.get('/v1/me/profile', async (request, reply) => {
    noSharedCache(reply)
    return profileSchema.parse(await identity.getOwnProfile(tokenOf(request)))
  })

  app.patch('/v1/me/profile', async (request, reply) => {
    guardMutation(request)
    noSharedCache(reply)
    const body = parse(updateProfileRequestSchema, request.body, 'Use valid profile details.')
    return profileSchema.parse(await identity.updateProfile(tokenOf(request), body))
  })

  app.get('/v1/me/export', async (request, reply) => {
    noSharedCache(reply)
    const exported = memberExportSchema.parse(await identity.exportMember(tokenOf(request)))
    void reply.header('content-disposition', 'attachment; filename="consumit-member-export.json"')
    return exported
  })

  app.delete('/v1/me', credentialLimit, async (request, reply) => {
    guardMutation(request)
    const body = parse(accountDeletionRequestSchema, request.body, 'Confirm account deletion with your password.')
    await identity.deleteAccount(tokenOf(request), body.password)
    clearSessionCookie(reply)
    return reply.code(204).send()
  })
}
