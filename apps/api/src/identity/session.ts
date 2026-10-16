import { createHash, randomBytes } from 'node:crypto'

import type { ApiEnv } from '../config/env.ts'

/** 30-day idle sessions with a 90-day absolute ceiling. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
export const SESSION_ABSOLUTE_TTL_MS = 90 * 24 * 60 * 60 * 1000

const PRODUCTION_COOKIE = '__Host-consumit_session'
const DEVELOPMENT_COOKIE = 'consumit_session'

export function newSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function sessionExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + SESSION_TTL_MS)
}

export function isSessionExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime()
}

/**
 * Extend only when more than half the lifetime has burned, so steady
 * activity costs one write per ~15 days instead of one per request.
 */
export function extendedExpiry(expiresAt: Date, absoluteExpiresAt: Date, now: Date = new Date()): Date | null {
  if (expiresAt.getTime() - now.getTime() < SESSION_TTL_MS / 2) {
    return new Date(Math.min(now.getTime() + SESSION_TTL_MS, absoluteExpiresAt.getTime()))
  }
  return null
}

export function sessionCookieName(env: Pick<ApiEnv, 'nodeEnv'>): string {
  return env.nodeEnv === 'production' ? PRODUCTION_COOKIE : DEVELOPMENT_COOKIE
}

export type SessionCookieOptions = {
  httpOnly: boolean
  maxAge: number
  path: string
  sameSite: 'lax'
  secure: boolean
}

export function sessionCookieOptions(env: Pick<ApiEnv, 'nodeEnv'>): SessionCookieOptions {
  return {
    httpOnly: true,
    maxAge: SESSION_TTL_MS / 1000,
    path: '/',
    sameSite: 'lax',
    // __Host- cookies require Secure; localhost development is plain HTTP,
    // so only production sets it.
    secure: env.nodeEnv === 'production',
  }
}
