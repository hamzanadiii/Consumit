import { metrics } from '@opentelemetry/api'
import { ApiError } from '../http/errors.ts'

/** Low-cardinality operational measurements; never record a query or member identity. */
export function createSocialTelemetry() {
  const meter = metrics.getMeter('consumit.members')
  const search = meter.createHistogram('consumit.members.search.duration', { unit: 's', description: 'Public member search latency including database work' })
  const writes = meter.createCounter('consumit.members.follow.writes', { description: 'Follow and unfollow results' })
  return async function observe<T>(operation: 'search' | 'follow' | 'unfollow', action: () => Promise<T>): Promise<T> {
    const start = performance.now()
    let outcome = 'success'
    try { return await action() }
    catch (error) { outcome = error instanceof ApiError && !error.retryable && ['BAD_REQUEST', 'NOT_FOUND', 'FORBIDDEN'].includes(error.code) ? 'rejected' : 'failed'; throw error }
    finally {
      if (operation === 'search') search.record((performance.now() - start) / 1000, { outcome })
      else writes.add(1, { operation, outcome })
    }
  }
}
