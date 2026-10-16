import type { ApiErrorCode } from '@consumit/contracts'

type SubtitleErrorCode = Extract<ApiErrorCode, 'SUBTITLES_NOT_FOUND' | 'SUBTITLES_UNAVAILABLE'>

export class SubtitleError extends Error {
  readonly code: SubtitleErrorCode
  readonly retryable: boolean

  constructor(code: SubtitleErrorCode, message: string, options: { cause?: unknown; retryable?: boolean } = {}) {
    super(message, { cause: options.cause })
    this.name = 'SubtitleError'
    this.code = code
    this.retryable = options.retryable ?? false
  }
}
