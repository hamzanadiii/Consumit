import { describe, expect, it, vi } from 'vitest'
import { aggregateProviderMetrics, readProviderMetrics } from './provider-metrics.ts'

describe('provider metrics', () => {
  it('maps only bounded aggregate labels and never returns URLs or tokens', async () => {
    const fetcher = vi.fn(async (input: unknown) => {
      const expression = new URL(String(input)).searchParams.get('query') ?? ''
      const result = expression.includes('playback_events_total')
        ? [
          { metric: { provider: 'direct', kind: 'movie', region: 'US', event: 'started' }, value: [1, '12'] },
          { metric: { provider: 'direct', kind: 'movie', region: 'US', event: 'error' }, value: [1, '2'] },
        ]
        : expression.includes('source_selected_total')
          ? [{ metric: { provider: 'direct', kind: 'movie', region: 'US', delivery: 'direct', url: 'https://secret.example/t' }, value: [1, '14'] }]
          : expression.includes('provider_attempts_total')
            ? [{ metric: { provider: 'direct', kind: 'movie', region: 'US', outcome: 'success' }, value: [1, '14'] }]
            : [{ metric: { provider: 'direct', kind: 'movie', region: 'US', browser: 'firefox' }, value: [1, String(expression.includes('0.99') ? 2200 : expression.includes('0.95') ? 1850 : 1200)] }]
      return new Response(JSON.stringify({ status: 'success', data: { resultType: 'vector', result } }), { status: 200 })
    }) as unknown as typeof fetch
    const metrics = await readProviderMetrics('http://prometheus:9090', fetcher)
    expect(metrics['direct:movie:US:unknown']).toMatchObject({ starts: 12, playbackFailures: 2, directSelections: 14, resolveSuccess: 14 })
    expect(metrics['direct:movie:US:firefox']).toMatchObject({ startupP50Ms: 1200, startupP95Ms: 1850, startupP99Ms: 2200, stallP50Ms: 1200, stallP95Ms: 1850, stallP99Ms: 2200 })
    expect(aggregateProviderMetrics(metrics, 'direct', 'movie', 'US')).toMatchObject({ starts: 12, playbackFailures: 2, directSelections: 14 })
    expect(JSON.stringify(metrics)).not.toContain('secret.example')
    expect(fetcher).toHaveBeenCalledTimes(9)
  })
})
