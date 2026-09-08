import 'server-only'

import {
  apiErrorResponseSchema,
  memberLibrarySchema,
  memberListDetailSchema,
  memberProfileDataSchema,
  type MemberLibrary,
  type MemberListDetail,
  type MemberProfileData,
} from '@consumit/contracts'
import { cookies } from 'next/headers'
import type { ZodType } from 'zod'

export class MemberApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) { super(message); this.name = 'MemberApiError'; this.status = status }
}

function baseUrl() {
  return (process.env.CONSUMIT_API_URL ?? 'http://127.0.0.1:3001').replace(/\/$/, '')
}

async function request<T>(path: string, schema: ZodType<T>): Promise<T> {
  const store = await cookies()
  const cookie = store.get('__Host-consumit_session') ?? store.get('consumit_session')
  const response = await fetch(`${baseUrl()}${path}`, {
    cache: 'no-store',
    headers: { accept: 'application/json', ...(cookie ? { cookie: `${cookie.name}=${cookie.value}` } : {}) },
    signal: AbortSignal.timeout(6_000),
  })
  if (!response.ok) {
    const error = apiErrorResponseSchema.safeParse(await response.json().catch(() => null))
    throw new MemberApiError(error.success ? error.data.error.message : 'Member data is temporarily unavailable.', response.status)
  }
  const parsed = schema.safeParse(await response.json().catch(() => null))
  if (!parsed.success) throw new MemberApiError('The member service returned an invalid response.', 503)
  return parsed.data
}

export const getPublicProfile = (username: string): Promise<MemberProfileData> => request(`/v1/profiles/${encodeURIComponent(username)}`, memberProfileDataSchema)
export const getMemberLibrary = (): Promise<MemberLibrary> => request('/v1/me/library', memberLibrarySchema)
export const getMemberList = (slug: string): Promise<MemberListDetail> => request(`/v1/lists/${encodeURIComponent(slug)}`, memberListDetailSchema)
