import {
  apiErrorResponseSchema,
  letterboxdImportDetailSchema,
  letterboxdImportHistorySchema,
  letterboxdImportSchema,
  type LetterboxdImport,
  type LetterboxdImportDetail,
  type LetterboxdMatchSelection,
} from '@consumit/contracts'
import type { ZodType } from 'zod'

import { IdentityApiError } from './identity-browser'

async function request<T>(path: string, init: RequestInit, schema?: ZodType<T>): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, { ...init, credentials: 'same-origin', headers: { accept: 'application/json', ...init.headers } })
  } catch {
    throw new IdentityApiError('The import service could not be reached.', { code: 'IMPORT_UNAVAILABLE', retryable: true, status: 503 })
  }
  if (!response.ok) {
    const parsed = apiErrorResponseSchema.safeParse(await response.json().catch(() => null))
    throw new IdentityApiError(parsed.success ? parsed.data.error.message : 'The import request failed.', {
      code: parsed.success ? parsed.data.error.code : 'IMPORT_UNAVAILABLE',
      ...(parsed.success ? { requestId: parsed.data.error.requestId } : {}),
      retryable: parsed.success ? parsed.data.error.retryable : response.status >= 500,
      status: response.status,
    })
  }
  if (!schema) return undefined as T
  const parsed = schema.safeParse(await response.json().catch(() => null))
  if (!parsed.success) throw new IdentityApiError('The import service returned an invalid response.', { code: 'IMPORT_UNAVAILABLE', retryable: true, status: 503 })
  return parsed.data
}

export function uploadLetterboxd(file: File): Promise<LetterboxdImport> {
  const form = new FormData()
  form.set('archive', file)
  return request('/v1/me/imports/letterboxd', { body: form, method: 'POST' }, letterboxdImportSchema)
}

export const getLetterboxdImports = () => request('/v1/me/imports/letterboxd', { method: 'GET' }, letterboxdImportHistorySchema)
export const getLetterboxdImport = (id: string): Promise<LetterboxdImportDetail> => request(`/v1/me/imports/letterboxd/${encodeURIComponent(id)}`, { method: 'GET' }, letterboxdImportDetailSchema)
export const selectLetterboxdMatch = (importId: string, itemId: string, selection: LetterboxdMatchSelection): Promise<LetterboxdImportDetail> => request(`/v1/me/imports/letterboxd/${encodeURIComponent(importId)}/items/${encodeURIComponent(itemId)}`, { body: JSON.stringify(selection), headers: { 'content-type': 'application/json' }, method: 'PATCH' }, letterboxdImportDetailSchema)
export const retryLetterboxdImport = (id: string): Promise<void> => request(`/v1/me/imports/letterboxd/${encodeURIComponent(id)}/retry`, { method: 'POST' })
export const confirmLetterboxdImport = (id: string): Promise<void> => request(`/v1/me/imports/letterboxd/${encodeURIComponent(id)}/confirm`, { method: 'POST' })
export const discardLetterboxdImport = (id: string): Promise<void> => request(`/v1/me/imports/letterboxd/${encodeURIComponent(id)}`, { method: 'DELETE' })
export const deleteLetterboxdData = (): Promise<void> => request('/v1/me/imports/letterboxd', { method: 'DELETE' })
