import { AnimeError } from '../../anime/errors.ts'

export function kitsuUnavailable(cause?: unknown): never {
  throw new AnimeError('ANILIST_UNAVAILABLE', 'Episode artwork is temporarily unavailable.', {
    cause,
    retryable: true,
  })
}
