import { metrics } from '@opentelemetry/api'
import type { PlaybackStore } from './state.ts'
import { ApiError } from '../http/errors.ts'
export type PlaybackVerification = { verify(owner: string, token?: string): Promise<void> }
const failures = metrics.getMeter('consumit-playback').createCounter('consumit.playback.verification_failures')
export function createPlaybackVerification(store: PlaybackStore, config: { secret: string; hostname: string }, request: (input: string, init: RequestInit) => Promise<Response> = fetch): PlaybackVerification {
  return {
    async verify(owner, token) {
      if (await store.get(`verified:${owner}`)) return
      if (!token) throw new ApiError('PLAYBACK_VERIFICATION_REQUIRED', 'Verify your browser to start playback.', { retryable: true })
      let valid = false
      try {
        const response = await request('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
          method: 'POST', body: new URLSearchParams({ secret: config.secret, response: token }), signal: AbortSignal.timeout(5000),
        })
        const result: unknown = await response.json()
        if (response.ok && result && typeof result === 'object' && 'success' in result && 'hostname' in result && 'action' in result) {
          valid = result.success === true && result.hostname === config.hostname && result.action === 'playback'
        }
      } catch { failures.add(1, { reason: 'unavailable' }); throw new ApiError('PLAYBACK_UNAVAILABLE', 'Browser verification is temporarily unavailable. Try again.', { retryable: true }) }
      if (!valid) { failures.add(1, { reason: 'invalid' }); throw new ApiError('PLAYBACK_VERIFICATION_REQUIRED', 'Browser verification expired or failed. Try again.', { retryable: true }) }
      await store.set(`verified:${owner}`, 'verified', 4 * 3600)
    },
  }
}
