import type { ApiErrorCode } from '@consumit/contracts'

export class AnilistError extends Error {
  readonly code: ApiErrorCode
  readonly retryable: boolean
  readonly statusCode: number

  constructor(
    code: ApiErrorCode,
    message: string,
    options: { cause?: unknown; retryable?: boolean; statusCode?: number } = {},
  ) {
    super(message, { cause: options.cause })
    this.name = 'AnilistError'
    this.code = code
    this.retryable = options.retryable ?? false
    this.statusCode = options.statusCode ?? 500
  }
}

export function unavailableAnilist(): never {
  throw new AnilistError(
    'CATALOG_NOT_CONFIGURED',
    'The anime catalog is not configured on this server.',
    { statusCode: 503 },
  )
}
