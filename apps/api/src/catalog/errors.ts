import type { CatalogErrorCode } from '@consumit/contracts'

export class CatalogError extends Error {
  readonly code: CatalogErrorCode
  readonly retryable: boolean
  readonly statusCode: number

  constructor(
    code: CatalogErrorCode,
    message: string,
    options: { cause?: unknown; retryable?: boolean; statusCode?: number } = {},
  ) {
    super(message, { cause: options.cause })
    this.name = 'CatalogError'
    this.code = code
    this.retryable = options.retryable ?? false
    this.statusCode = options.statusCode ?? 500
  }
}

export function unavailableCatalog(): never {
  throw new CatalogError(
    'CATALOG_NOT_CONFIGURED',
    'The catalog is not configured on this server.',
    { statusCode: 503 },
  )
}
