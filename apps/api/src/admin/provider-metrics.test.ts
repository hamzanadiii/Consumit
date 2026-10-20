import { describe, expect, it, vi } from 'vitest'
import { aggregateProviderMetrics, readProviderComparisons, readProviderMetrics } from './provider-metrics.ts'

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

  it('pools histogram buckets before percentiles and keeps unattributed resolution and frame reports separate', async () => {
    const sample = (metric: Record<string, string>, count: number | string) => ({ metric: { provider: 'primary', kind: 'movie', region: 'US', ...metric }, value: [1, String(count)] })
    const expressions: string[] = []
    const fetcher = vi.fn(async (input: unknown) => {
      const expression = new URL(String(input)).searchParams.get('query') ?? ''
      expressions.push(expression)
      const result = expression.includes('client_duration') ? [
        ...[['1000', 9], ['2000', 9], ['+Inf', 9]].map(([le, count]) => sample({ browser: 'chrome', delivery: 'direct', event: 'started', le: String(le) }, count!)),
        ...[['1000', 0], ['2000', 1], ['+Inf', 1]].map(([le, count]) => sample({ browser: 'firefox', delivery: 'direct', event: 'started', le: String(le) }, count!)),
        ...[['1000', 0], ['2000', 0], ['4000', 1], ['+Inf', 1]].map(([le, count]) => sample({ browser: 'chrome', delivery: 'relay', event: 'started', le: String(le) }, count!)),
      ] : expression.includes('provider_attempts') ? [sample({ outcome: 'success' }, 12), sample({ outcome: 'empty' }, 2), sample({ outcome: 'error' }, 1), sample({ outcome: 'cancelled' }, 1)]
        : expression.includes('frame_reported') ? [sample({ provider: 'vidriftframe', browser: 'chrome', delivery: 'embed', event: 'playing' }, 3), sample({ provider: 'vidriftframe', browser: 'chrome', delivery: 'embed', event: 'error' }, 1), sample({ provider: 'vidriftframe', browser: 'chrome', delivery: 'embed', event: 'unreviewed' }, 999)]
          : [sample({ browser: 'chrome', delivery: 'direct', event: 'started' }, 9), sample({ browser: 'firefox', delivery: 'direct', event: 'started' }, 1), sample({ browser: 'chrome', delivery: 'relay', event: 'error' }, 1), sample({ browser: 'chrome', delivery: 'embed', event: 'started' }, 999), sample({ provider: 'https://private.example/token', delivery: 'direct', event: 'started' }, 999)]
      return Response.json({ status: 'success', data: { resultType: 'vector', result } })
    }) as unknown as typeof fetch
    const rows = await readProviderComparisons('http://prometheus:9090', fetcher)
    const direct = rows.find(row => row.provider === 'primary' && row.browser === 'all' && row.delivery === 'direct' && row.evidence === 'native')!
    expect(direct).toMatchObject({ starts: 10, startupSamples: 10 })
    expect(direct.startupP50Ms).toBeCloseTo(1000 * 5 / 9)
    expect(direct.startupP95Ms).toBeCloseTo(1500)
    expect(direct.stallP50Ms).toBeUndefined()
    const pooled = rows.find(row => row.provider === 'primary' && row.browser === 'all' && row.delivery === 'all' && row.evidence === 'native')!
    expect(pooled.startupSamples).toBe(11)
    expect(pooled.startupP50Ms).toBeCloseTo(1000 * 5.5 / 9)
    expect(rows.find(row => row.evidence === 'resolution')).toMatchObject({ browser: 'all', delivery: 'unattributed', resolveSuccess: 12, resolveFailures: 3, resolveCancelled: 1, failureReasons: { empty: 2, error: 1 } })
    const frame = rows.find(row => row.provider === 'vidriftframe' && row.browser === 'all' && row.delivery === 'embed')!
    expect(frame).toMatchObject({ evidence: 'provider-reported', reportedEvents: { playing: 3, error: 1 } })
    expect(frame.starts).toBeUndefined()
    expect(frame.startupSamples).toBeUndefined()
    expect(JSON.stringify(rows)).not.toMatch(/private.example|unreviewed/)
    expect(rows.every(row => row.starts !== 999)).toBe(true)
    expect(expressions).toHaveLength(4)
    expect(expressions.find(expression => expression.includes('client_duration'))).toContain('sum by (provider,kind,region,browser,delivery,event,le) (increase(')
    expect(expressions.every(expression => !expression.includes('histogram_quantile'))).toBe(true)
  })

  it('rejects failed or unbounded comparison backends instead of returning invented zeros', async () => {
    await expect(readProviderComparisons('http://prometheus:9090', vi.fn(async () => new Response('', { status: 503 })) as unknown as typeof fetch)).rejects.toThrow('Metrics backend unavailable')
    await expect(readProviderComparisons('http://prometheus:9090', vi.fn(async () => Response.json({ status: 'success', data: { resultType: 'vector', result: Array(20_001).fill({ metric: {}, value: [1, '1'] }) } })) as unknown as typeof fetch)).rejects.toThrow('Invalid metrics response')
  })
})
