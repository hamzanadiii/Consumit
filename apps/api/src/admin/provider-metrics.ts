export type ProviderMetrics = { starts: number; playbackFailures: number; buffers: number; directSelections: number; resolveSuccess: number; resolveFailures: number; startupP50Ms?: number; startupP95Ms?: number; startupP99Ms?: number; stallP50Ms?: number; stallP95Ms?: number; stallP99Ms?: number }
export type MetricsSnapshot = Record<string, ProviderMetrics>
export type ProviderAlert = { name: string; severity: string; state: string; provider?: string; kind?: string; region?: string; since: string }

const EMPTY = (): ProviderMetrics => ({ starts: 0, playbackFailures: 0, buffers: 0, directSelections: 0, resolveSuccess: 0, resolveFailures: 0 })
type Sample = { metric: Record<string, string>; value: [number, string] }
const BROWSERS = new Set(['chrome', 'edge', 'firefox', 'safari', 'other', 'unknown'])

async function query(baseUrl: string, expression: string, fetcher: typeof fetch): Promise<Sample[]> {
  const endpoint = new URL('/api/v1/query', baseUrl)
  endpoint.searchParams.set('query', expression)
  const response = await fetcher(endpoint, { signal: AbortSignal.timeout(2500) })
  if (!response.ok) throw new Error('Metrics backend unavailable.')
  const body = await response.json() as { status?: string; data?: { resultType?: string; result?: Sample[] } }
  if (body.status !== 'success' || body.data?.resultType !== 'vector' || !Array.isArray(body.data.result) || body.data.result.length > 1000) throw new Error('Invalid metrics response.')
  return body.data.result
}

/** Only aggregate, fixed PromQL expressions cross this interface. No member
 * identifiers, media URLs, tokens, or request-driven query strings. */
export async function readProviderMetrics(baseUrl: string, fetcher: typeof fetch = fetch): Promise<MetricsSnapshot> {
  const quantiles = [0.5, 0.95, 0.99] as const
  const timingQueries = quantiles.flatMap((quantile) => (['started', 'buffer-end'] as const).map((event) => ({ quantile, event })))
  const [playback, selections, resolves, ...timing] = await Promise.all([
    query(baseUrl, 'sum by (provider,kind,region,event) (increase(consumit_playback_events_total[15m]))', fetcher),
    query(baseUrl, 'sum by (provider,kind,region,delivery) (increase(consumit_playback_source_selected_total[15m]))', fetcher),
    query(baseUrl, 'sum by (provider,kind,region,outcome) (increase(consumit_provider_attempts_total[15m]))', fetcher),
    ...timingQueries.map(({ quantile, event }) => query(baseUrl,
      `histogram_quantile(${quantile}, sum by (provider,kind,region,browser,event,le) (rate(consumit_playback_client_duration_milliseconds_bucket{event="${event}"}[15m])))`, fetcher)),
  ])
  const result: MetricsSnapshot = {}
  const rowFor = (sample: Sample) => {
    const { provider, kind, region } = sample.metric
    if (!provider || !kind || !region || !['movie', 'series', 'anime'].includes(kind) || !/^[A-Z]{2}$/.test(region)) return null
    const count = Number(sample.value?.[1])
    if (!Number.isFinite(count) || count < 0) return null
    const browser = BROWSERS.has(sample.metric.browser ?? '') ? sample.metric.browser! : 'unknown'
    const key = `${provider}:${kind}:${region}:${browser}`
    return { row: result[key] ??= EMPTY(), count }
  }
  for (const sample of playback) {
    const match = rowFor(sample)
    if (!match) continue
    if (sample.metric.event === 'started') match.row.starts += match.count
    if (sample.metric.event === 'error') match.row.playbackFailures += match.count
    if (sample.metric.event === 'buffer-start') match.row.buffers += match.count
  }
  for (const sample of selections) {
    const match = rowFor(sample)
    if (!match) continue
    if (sample.metric.delivery === 'direct') match.row.directSelections += match.count
  }
  for (const sample of resolves) {
    const match = rowFor(sample)
    if (!match) continue
    if (sample.metric.outcome === 'success') match.row.resolveSuccess += match.count
    if (sample.metric.outcome === 'error' || sample.metric.outcome === 'empty') match.row.resolveFailures += match.count
  }
  for (const [index, samples] of timing.entries()) {
    const { quantile, event } = timingQueries[index]!
    const suffix = quantile === 0.5 ? 'P50Ms' : quantile === 0.95 ? 'P95Ms' : 'P99Ms'
    const field = event === 'started' ? `startup${suffix}` as const : `stall${suffix}` as const
    for (const sample of samples) {
      const match = rowFor(sample)
      if (match) match.row[field] = match.count
    }
  }
  return result
}

/** Combine bounded browser families only for provider-wide health decisions. */
export function aggregateProviderMetrics(snapshot: MetricsSnapshot, provider: string, kind: string, region: string): ProviderMetrics | null {
  const rows = Object.entries(snapshot).filter(([key]) => key.startsWith(`${provider}:${kind}:${region}:`)).map(([, value]) => value)
  if (!rows.length) return null
  return rows.reduce((total, row) => ({
    starts: total.starts + row.starts,
    playbackFailures: total.playbackFailures + row.playbackFailures,
    buffers: total.buffers + row.buffers,
    directSelections: total.directSelections + row.directSelections,
    resolveSuccess: total.resolveSuccess + row.resolveSuccess,
    resolveFailures: total.resolveFailures + row.resolveFailures,
  }), EMPTY())
}

export async function readProviderAlerts(baseUrl: string, fetcher: typeof fetch = fetch): Promise<ProviderAlert[]> {
  const endpoint = new URL('/api/v1/alerts', baseUrl)
  const response = await fetcher(endpoint, { signal: AbortSignal.timeout(2500) })
  if (!response.ok) throw new Error('Metrics backend unavailable.')
  const body = await response.json() as { status?: string; data?: { alerts?: Array<{ labels: Record<string, string>; state: string; activeAt: string }> } }
  if (body.status !== 'success' || !Array.isArray(body.data?.alerts) || body.data.alerts.length > 100) throw new Error('Invalid alert response.')
  const names = new Set(['ProviderPlaybackFailure'])
  return body.data.alerts.filter((alert) => Boolean(alert.labels.alertname && names.has(alert.labels.alertname))).map((alert) => ({
    name: alert.labels.alertname!, severity: alert.labels.severity ?? 'warning', state: alert.state,
    ...(alert.labels.provider ? { provider: alert.labels.provider } : {}),
    ...(alert.labels.kind ? { kind: alert.labels.kind } : {}),
    ...(alert.labels.region ? { region: alert.labels.region } : {}),
    since: alert.activeAt,
  }))
}
