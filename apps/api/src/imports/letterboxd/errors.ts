import type { ApiErrorCode } from '@consumit/contracts'

export class LetterboxdImportError extends Error {
  readonly code: ApiErrorCode
  readonly retryable: boolean

  constructor(code: ApiErrorCode, message: string, options: { cause?: unknown; retryable?: boolean } = {}) {
    super(message, { cause: options.cause })
    this.name = 'LetterboxdImportError'
    this.code = code
    this.retryable = options.retryable ?? false
  }
}
