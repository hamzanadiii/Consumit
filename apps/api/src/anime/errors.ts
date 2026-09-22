import type { ApiErrorCode } from '@consumit/contracts'

type AnimeErrorCode = Extract<ApiErrorCode, 'ANIME_NOT_FOUND' | 'ANILIST_UNAVAILABLE'>

export class AnimeError extends Error {
  readonly code: AnimeErrorCode
  readonly retryable: boolean

  constructor(code: AnimeErrorCode, message: string, options: { cause?: unknown; retryable?: boolean } = {}) {
    super(message, { cause: options.cause })
    this.name = 'AnimeError'
    this.code = code
    this.retryable = options.retryable ?? false
  }
}
