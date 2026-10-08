import 'server-only'

import { apiErrorResponseSchema, profileSchema, sessionMemberResponseSchema, type MemberProfile, type SafeMember } from '@consumit/contracts'
import { cookies } from 'next/headers'
import { cache } from 'react'

export type ServerSession =
  | { member: SafeMember; status: 'authenticated' }
  | { member: null; status: 'anonymous' | 'unavailable' }

function apiBaseUrl() {
  return (process.env.CONSUMIT_API_URL ?? 'http://127.0.0.1:3001').replace(/\/$/, '')
}

const loadServerSession = async (): Promise<ServerSession> => {
  const store = await cookies()
  const cookie = store.get('__Host-consumit_session') ?? store.get('consumit_session')
  if (!cookie) return { member: null, status: 'anonymous' }
  try {
    const response = await fetch(`${apiBaseUrl()}/v1/me`, {
      cache: 'no-store',
      headers: { accept: 'application/json', cookie: `${cookie.name}=${cookie.value}` },
      signal: AbortSignal.timeout(6_000),
    })
    if (response.status === 401) return { member: null, status: 'anonymous' }
    if (!response.ok) {
      apiErrorResponseSchema.safeParse(await response.json().catch(() => null))
      return { member: null, status: 'unavailable' }
    }
    const parsed = sessionMemberResponseSchema.safeParse(await response.json().catch(() => null))
    return parsed.success
      ? { member: parsed.data.member, status: 'authenticated' }
      : { member: null, status: 'unavailable' }
  } catch {
    return { member: null, status: 'unavailable' }
  }
}

export const getServerSession = cache(loadServerSession)

export type ServerProfile =
  | { profile: MemberProfile; status: 'available' }
  | { profile: null; status: 'anonymous' | 'unavailable' }

const loadServerProfile = async (): Promise<ServerProfile> => {
  const store = await cookies()
  const cookie = store.get('__Host-consumit_session') ?? store.get('consumit_session')
  if (!cookie) return { profile: null, status: 'anonymous' }
  try {
    const response = await fetch(`${apiBaseUrl()}/v1/me/profile`, { cache: 'no-store', headers: { accept: 'application/json', cookie: `${cookie.name}=${cookie.value}` }, signal: AbortSignal.timeout(6_000) })
    if (response.status === 401) return { profile: null, status: 'anonymous' }
    if (!response.ok) return { profile: null, status: 'unavailable' }
    const parsed = profileSchema.safeParse(await response.json().catch(() => null))
    return parsed.success ? { profile: parsed.data, status: 'available' } : { profile: null, status: 'unavailable' }
  } catch {
    return { profile: null, status: 'unavailable' }
  }
}

export const getServerProfile = cache(loadServerProfile)
