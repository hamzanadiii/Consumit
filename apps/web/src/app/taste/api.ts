'use client'

import { IdentityApiError, identityRequest } from '@/lib/identity-browser'
import type { ZodType } from 'zod'

export function tasteRead<T>(path: string, schema: ZodType<T>, signal?: AbortSignal) {
  return identityRequest(`/v1/taste/${path}`, { method: 'GET', ...(signal ? { signal } : {}) }, schema)
}
export function tasteWrite<T = unknown>(path: string, data?: unknown, method = 'PUT', schema?: ZodType<T>) {
  return identityRequest(`/v1/taste/${path}`, { method, ...(data === undefined ? {} : { body: JSON.stringify(data) }) }, schema)
}
export function isTasteConflict(error: unknown) {
  return error instanceof IdentityApiError && error.code === 'CONFLICT'
}
export const errorText = (error: unknown) => error instanceof Error ? error.message : 'This could not be saved. Your work is still here. Try again.'
