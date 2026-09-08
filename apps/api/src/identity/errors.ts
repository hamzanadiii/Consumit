import type { ApiErrorCode } from '@consumit/contracts'

/** Domain failure only. HTTP status selection belongs to the global translator. */
export class IdentityError extends Error {
  readonly code: ApiErrorCode
  readonly retryable: boolean

  constructor(code: ApiErrorCode, message: string, options: { cause?: unknown; retryable?: boolean } = {}) {
    super(message, { cause: options.cause })
    this.name = 'IdentityError'
    this.code = code
    this.retryable = options.retryable ?? false
  }
}
