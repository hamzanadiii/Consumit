import type { FastifyError, FastifyInstance, FastifyReply } from 'fastify'

import type { CatalogErrorCode, CatalogErrorResponse } from '@consumit/contracts'

export class ApiError extends Error {
  readonly code: CatalogErrorCode
  readonly retryable: boolean
  readonly statusCode: number

  constructor(
    code: CatalogErrorCode,
    message: string,
    options: { cause?: unknown; retryable?: boolean; statusCode?: number } = {},
  ) {
    super(message, { cause: options.cause })
    this.name = 'ApiError'
    this.code = code
    this.retryable = options.retryable ?? false
    this.statusCode = options.statusCode ?? 500
  }
}

function envelope(code: CatalogErrorCode, message: string, retryable: boolean): CatalogErrorResponse {
  return { error: { code, message, retryable } }
}

function translate(error: FastifyError | Error): { body: CatalogErrorResponse; statusCode: number } {
  if (error instanceof ApiError) {
    return { body: envelope(error.code, error.message, error.retryable), statusCode: error.statusCode }
  }
  if ('validation' in error || (error as FastifyError).code === 'FST_ERR_VALIDATION') {
    return { body: envelope('BAD_REQUEST', 'The request could not be understood.', false), statusCode: 400 }
  }
  if ((error as FastifyError).statusCode === 429) {
    return { body: envelope('RATE_LIMITED', 'Too many requests. Back off and retry.', true), statusCode: 429 }
  }
  return { body: envelope('INTERNAL', 'Internal server error.', false), statusCode: 500 }
}

/**
 * Builds the 429 failure the rate-limit plugin throws into the global error
 * handler, which translates it to the stable envelope. The builder must
 * return an error (not the envelope body) — the plugin throws its return
 * value; see @fastify/rate-limit `throw params.errorResponseBuilder(...)`.
 */
export function rateLimitExceeded(): Error {
  const error = new Error('Too many requests. Back off and retry.') as Error & { statusCode?: number }
  error.statusCode = 429
  return error
}

/**
 * One global translation point: every failure leaves the API as the stable
 * envelope. Unknown internals become a safe message; the original error is
 * logged with the request id by the caller (see request context).
 */
export function registerErrorHandlers(app: FastifyInstance) {
  app.setNotFoundHandler((_request, reply) => (
    reply.code(404).send(envelope('NOT_FOUND', 'Route not found.', false))
  ))

  app.setErrorHandler((error, request, reply: FastifyReply) => {
    const { body, statusCode } = translate(error as FastifyError)
    if (statusCode >= 500) request.log.error({ err: error }, 'unhandled request failure')
    void reply.code(statusCode).send(body)
  })
}
