import type { FastifyError, FastifyInstance } from 'fastify'

import type { ApiErrorCode, ApiErrorResponse } from '@consumit/contracts'

import { CatalogError } from '../catalog/errors.ts'
import { IdentityError } from '../identity/errors.ts'
import { LetterboxdImportError } from '../imports/letterboxd/errors.ts'

export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly retryable: boolean

  constructor(code: ApiErrorCode, message: string, options: { cause?: unknown; retryable?: boolean } = {}) {
    super(message, { cause: options.cause })
    this.name = 'ApiError'
    this.code = code
    this.retryable = options.retryable ?? false
  }
}

const statusByCode: Record<ApiErrorCode, number> = {
  AUTH_STATE_UNAVAILABLE: 503,
  BAD_REQUEST: 400,
  CATALOG_INVALID_QUERY: 400,
  CATALOG_NOT_CONFIGURED: 503,
  CATALOG_NOT_FOUND: 404,
  CATALOG_UNAVAILABLE: 503,
  CONFLICT: 409,
  EMAIL_DELIVERY_UNAVAILABLE: 503,
  EMAIL_NOT_VERIFIED: 403,
  FORBIDDEN: 403,
  IDENTITY_NOT_CONFIGURED: 503,
  IMPORT_INVALID_ARCHIVE: 400,
  IMPORT_LIMIT_EXCEEDED: 413,
  IMPORT_NOT_FOUND: 404,
  IMPORT_NOT_READY: 409,
  IMPORT_UNAVAILABLE: 503,
  INTERNAL: 500,
  INVALID_CREDENTIALS: 401,
  INVALID_VERIFICATION_CODE: 400,
  NOT_FOUND: 404,
  PASSWORD_INVALID: 400,
  RATE_LIMITED: 429,
  UNAUTHENTICATED: 401,
  USERNAME_CHANGE_COOLDOWN: 409,
  USERNAME_UNAVAILABLE: 409,
}

export function errorEnvelope(code: ApiErrorCode, message: string, requestId: string, retryable = false): ApiErrorResponse {
  return { error: { code, message, requestId, retryable } }
}

function translate(error: FastifyError | Error, requestId: string): { body: ApiErrorResponse; statusCode: number } {
  if (error instanceof ApiError || error instanceof CatalogError || error instanceof IdentityError || error instanceof LetterboxdImportError) {
    return {
      body: errorEnvelope(error.code, error.message, requestId, error.retryable),
      statusCode: statusByCode[error.code],
    }
  }
  if ('validation' in error || (error as FastifyError).code === 'FST_ERR_VALIDATION') {
    return { body: errorEnvelope('BAD_REQUEST', 'The request could not be understood.', requestId), statusCode: 400 }
  }
  if ((error as FastifyError).statusCode === 429) {
    return { body: errorEnvelope('RATE_LIMITED', 'Too many requests. Back off and retry.', requestId, true), statusCode: 429 }
  }
  return { body: errorEnvelope('INTERNAL', 'Internal server error.', requestId), statusCode: 500 }
}

export function rateLimitExceeded(): Error {
  const error = new Error('Too many requests. Back off and retry.') as Error & { statusCode?: number }
  error.statusCode = 429
  return error
}

export function registerErrorHandlers(app: FastifyInstance) {
  app.setNotFoundHandler((request, reply) => (
    reply.code(404).send(errorEnvelope('NOT_FOUND', 'Route not found.', request.id))
  ))

  app.setErrorHandler((error, request, reply) => {
    const { body, statusCode } = translate(error as FastifyError, request.id)
    if (statusCode >= 500) request.log.error({ err: error }, 'request failed')
    void reply.code(statusCode).send(body)
  })
}
