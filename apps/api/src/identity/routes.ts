import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

import {
  acceptedResponseSchema,
  accountDeletionRequestSchema,
  emailRequestSchema,
  googleSignupCompletionRequestSchema,
  loginRequestSchema,
  memberExportSchema,
  passwordChangeRequestSchema,
  profileSchema,
  recoveryCompleteRequestSchema,
  recoveryConfirmRequestSchema,
  registerRequestSchema,
  sessionMemberResponseSchema,
  updateProfileRequestSchema,
  usernameAvailabilityResponseSchema,
  usernameSchema,
  verifyEmailRequestSchema,
} from '@consumit/contracts'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { normalizeIP } from '@fastify/rate-limit'
import type { ZodType } from 'zod'

import type { ApiEnv } from '../config/env.ts'
import { isAllowedOrigin } from '../http/csrf.ts'
import { ApiError } from '../http/errors.ts'
import { requestMember } from '../http/request-member.ts'
import { IdentityError } from './errors.ts'
import type { AuthStateStore, GoogleSignupClaim } from './auth-state.ts'
import type { Identity } from './identity.ts'
import { exchangeGoogleAuthorizationCode } from './google-oauth.ts'
import { googleFlowCookieOptions, googleSignupCookieName, googleStateCookieName, recoveryGrantCookieName, recoveryGrantCookieOptions, sessionCookieName, sessionCookieOptions } from './session.ts'

const accepted = acceptedResponseSchema.parse({
  message: 'If the address can continue, an email is on its way.',
  status: 'accepted',
})
// Credentials and challenge attempts are not authenticated by the incoming
// cookie. Use the trusted client address so arbitrary cookies cannot create
// fresh buckets for brute-force attempts or email delivery.
const credentialKey = (request: FastifyRequest) => normalizeIP(request.ip, 64)
const credentialLimit = { config: { rateLimit: { keyGenerator: credentialKey, max: 10, timeWindow: '15 minutes' } } }
const codeRequestLimit = { config: { rateLimit: { keyGenerator: credentialKey, max: 20, timeWindow: '1 hour' } } }
const codeConfirmLimit = { config: { rateLimit: { keyGenerator: credentialKey, max: 30, timeWindow: '1 hour' } } }
const googleStartLimit = { config: { rateLimit: { keyGenerator: credentialKey, max: 10, timeWindow: '15 minutes' } } }
function internalNextPath(raw: unknown, appOrigin: string): string {
  if (typeof raw !== 'string' || raw.length > 2048 || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return '/'
  try {
    const parsed = new URL(raw, appOrigin)
    if (parsed.origin !== appOrigin) return '/'
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return '/'
  }
}

function equalState(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

function signInRedirect(auth: string, nextPath: string): string {
  const params = new URLSearchParams({ auth, ...(nextPath !== '/' ? { next: nextPath } : {}) })
  return `/sign-in?${params}`
}

function parse<T>(schema: ZodType<T>, value: unknown, message: string): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new ApiError('BAD_REQUEST', message)
  return result.data
}

export function registerIdentityRoutes(app: FastifyInstance, deps: { authState?: AuthStateStore | undefined; env: ApiEnv; identity: Identity }) {
  const { authState, env, identity } = deps
  const cookieName = sessionCookieName(env)
  const cookieOptions = sessionCookieOptions(env)
  const recoveryCookieName = recoveryGrantCookieName(env)
  const recoveryCookieOptions = recoveryGrantCookieOptions(env)

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

  function setSessionCookie(reply: FastifyReply, token: string, rememberMe = true) {
    void reply.setCookie(cookieName, token, sessionCookieOptions(env, rememberMe))
  }

  function clearSessionCookie(reply: FastifyReply) {
    void reply.clearCookie(cookieName, { httpOnly: true, path: '/', sameSite: 'lax', secure: cookieOptions.secure })
  }

  function setRecoveryCookie(reply: FastifyReply, token: string) {
    void reply.setCookie(recoveryCookieName, token, recoveryCookieOptions)
  }

  function clearRecoveryCookie(reply: FastifyReply) {
    void reply.clearCookie(recoveryCookieName, recoveryCookieOptions)
  }

  function noSharedCache(reply: FastifyReply) {
    // Member-specific responses must never sit in a shared cache.
    void reply.header('cache-control', 'private, no-store')
  }

  function authRedirect(reply: FastifyReply, path: string) {
    void reply.header('cache-control', 'private, no-store').header('referrer-policy', 'no-referrer')
    return reply.redirect(new URL(path, env.appOrigin).toString(), 302)
  }

  function clearGoogleCookie(reply: FastifyReply, name: string) {
    const options = googleFlowCookieOptions(env)
    void reply.clearCookie(name, { httpOnly: true, path: '/', sameSite: 'lax', secure: options.secure })
  }

  async function replaceSessionCookie(request: FastifyRequest, reply: FastifyReply, token: string) {
    const previous = request.cookies?.[cookieName]
    if (previous && previous !== token) await identity.logout(previous)
    setSessionCookie(reply, token)
  }

  app.get('/v1/auth/google/start', googleStartLimit, async (request, reply) => {
    const query = request.query as { next?: unknown }
    const nextPath = internalNextPath(query.next, env.appOrigin)
    const config = env.googleOAuth
    if (!config || !authState) return authRedirect(reply, signInRedirect('google-unavailable', nextPath))

    const state = randomBytes(32).toString('base64url')
    const nonce = randomBytes(32).toString('base64url')
    const codeVerifier = randomBytes(32).toString('base64url')
    try {
      await authState.storeGoogleAttempt(state, { codeVerifier, nextPath, nonce })
    } catch {
      return authRedirect(reply, signInRedirect('google-unavailable', nextPath))
    }
    void reply.setCookie(googleStateCookieName(env), state, googleFlowCookieOptions(env))
    const authorization = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    authorization.search = new URLSearchParams({
      client_id: config.clientId,
      code_challenge: createHash('sha256').update(codeVerifier).digest('base64url'),
      code_challenge_method: 'S256',
      nonce,
      prompt: 'select_account',
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
    }).toString()
    void reply.header('cache-control', 'private, no-store').header('referrer-policy', 'no-referrer')
    return reply.redirect(authorization.toString(), 302)
  })

  app.get('/v1/auth/google/callback', googleStartLimit, async (request, reply) => {
    const query = request.query as { code?: unknown; error?: unknown; state?: unknown }
    const stateCookie = request.cookies?.[googleStateCookieName(env)]
    const returnedState = typeof query.state === 'string' ? query.state : ''
    clearGoogleCookie(reply, googleStateCookieName(env))
    if (!authState || !env.googleOAuth || !stateCookie || !returnedState || !equalState(stateCookie, returnedState)) {
      return authRedirect(reply, signInRedirect('google-failed', '/'))
    }
    let attempt
    try {
      attempt = await authState.consumeGoogleAttempt(returnedState)
    } catch {
      return authRedirect(reply, signInRedirect('google-failed', '/'))
    }
    if (!attempt) return authRedirect(reply, signInRedirect('google-failed', '/'))
    if (typeof query.error === 'string') {
      return authRedirect(reply, signInRedirect(query.error === 'access_denied' ? 'google-cancelled' : 'google-failed', attempt.nextPath))
    }
    if (typeof query.code !== 'string' || query.code.length < 1 || query.code.length > 4096) {
      return authRedirect(reply, signInRedirect('google-failed', attempt.nextPath))
    }

    try {
      const verified = await exchangeGoogleAuthorizationCode({
        audience: env.googleOAuth.clientId,
        clientId: env.googleOAuth.clientId,
        clientSecret: env.googleOAuth.clientSecret,
        code: query.code,
        codeVerifier: attempt.codeVerifier,
        nonce: attempt.nonce,
        redirectUri: env.googleOAuth.redirectUri,
      })
      const member = await identity.loginWithGoogle(verified)
      if (member) {
        await replaceSessionCookie(request, reply, member.sessionToken)
        return authRedirect(reply, attempt.nextPath)
      }
      const ticket = randomBytes(32).toString('base64url')
      const claim: GoogleSignupClaim = { ...verified, nextPath: attempt.nextPath }
      await authState.storeGoogleSignup(ticket, claim)
      void reply.setCookie(googleSignupCookieName(env), ticket, googleFlowCookieOptions(env))
      const params = new URLSearchParams(attempt.nextPath === '/' ? {} : { next: attempt.nextPath })
      return authRedirect(reply, `/sign-up/google${params.size ? `?${params}` : ''}`)
    } catch (error) {
      const auth = error instanceof IdentityError && error.code === 'CONFLICT'
        ? 'google-account-exists'
        : 'google-failed'
      return authRedirect(reply, signInRedirect(auth, attempt.nextPath))
    }
  })

  app.get('/v1/auth/google/pending', googleStartLimit, async (request, reply) => {
    noSharedCache(reply)
    if (!authState) throw new ApiError('IDENTITY_NOT_CONFIGURED', 'Google sign-up is unavailable.')
    const ticket = request.cookies?.[googleSignupCookieName(env)]
    const claim = typeof ticket === 'string' ? await authState.getGoogleSignup(ticket) : null
    if (!claim) throw new ApiError('UNAUTHENTICATED', 'Restart Google sign-up to continue.')
    return { email: claim.email, name: claim.name }
  })

  app.post('/v1/auth/google/complete', codeConfirmLimit, async (request, reply) => {
    guardMutation(request)
    noSharedCache(reply)
    if (!authState) throw new ApiError('IDENTITY_NOT_CONFIGURED', 'Google sign-up is unavailable.')
    const input = parse(googleSignupCompletionRequestSchema, request.body, 'Choose a valid username and accept the Terms and Privacy Policy.')
    const ticket = request.cookies?.[googleSignupCookieName(env)]
    const claim = typeof ticket === 'string' ? await authState.getGoogleSignup(ticket) : null
    if (!claim) throw new ApiError('UNAUTHENTICATED', 'Restart Google sign-up to continue.')
    const result = await identity.registerWithGoogle({
      email: claim.email,
      emailAuthoritative: claim.emailAuthoritative,
      googleSubject: claim.googleSubject,
      name: claim.name,
      ...(input.displayName ? { displayName: input.displayName } : {}),
      username: input.username,
    })
    await authState.deleteGoogleSignup(ticket!)
    clearGoogleCookie(reply, googleSignupCookieName(env))
    if (result.kind === 'verification-required') {
      return reply.code(202).send({ email: claim.email, status: 'verification-required' })
    }
    await replaceSessionCookie(request, reply, result.authenticated.sessionToken)
    return reply.send({ member: result.authenticated.member, status: 'complete' })
  })

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
    setSessionCookie(reply, result.sessionToken, body.rememberMe ?? true)
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

  app.post('/v1/auth/recovery/verify', codeConfirmLimit, async (request, reply) => {
    guardMutation(request)
    noSharedCache(reply)
    const body = parse(verifyEmailRequestSchema, request.body, 'Use a valid email address and six-digit code.')
    const recoveryToken = await identity.verifyRecoveryCode(body)
    setRecoveryCookie(reply, recoveryToken)
    return reply.code(204).send()
  })

  app.post('/v1/auth/recovery/complete', codeConfirmLimit, async (request, reply) => {
    guardMutation(request)
    noSharedCache(reply)
    const body = parse(recoveryCompleteRequestSchema, request.body, 'Use a valid new password.')
    const recoveryToken = request.cookies?.[recoveryCookieName]
    await identity.completePasswordRecovery({
      newPassword: body.newPassword,
      recoveryToken: typeof recoveryToken === 'string' ? recoveryToken : '',
    })
    clearRecoveryCookie(reply)
    return reply.code(204).send()
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
    const member = await requestMember(request, identity, cookieName)
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
