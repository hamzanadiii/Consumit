export type ProviderMetrics = { starts: number; playbackFailures: number; buffers: number; directSelections: number; resolveSuccess: number; resolveFailures: number; startupP50Ms?: number; startupP95Ms?: number; startupP99Ms?: number; stallP50Ms?: number; stallP95Ms?: number; stallP99Ms?: number }
export type MetricsSnapshot = Record<string, ProviderMetrics>
export type ProviderAlert = { name: string; severity: string; state: string; provider?: string; kind?: string; region?: string; since: string }

const EMPTY = (): ProviderMetrics => ({ starts: 0, playbackFailures: 0, buffers: 0, directSelections: 0, resolveSuccess: 0, resolveFailures: 0 })
type Sample = { metric: Record<string, string>; value: [number, string] }
const BROWSERS = new Set(['chrome', 'edge', 'firefox', 'safari', 'other', 'unknown'])

async function query(baseUrl: string, expression: string, fetcher: typeof fetch, limit = 1000): Promise<Sample[]> {
  const endpoint = new URL('/api/v1/query', baseUrl)
  endpoint.searchParams.set('query', expression)
  const response = await fetcher(endpoint, { signal: AbortSignal.timeout(2500) })
  if (!response.ok) throw new Error('Metrics backend unavailable.')
  const body = await response.json() as { status?: string; data?: { resultType?: string; result?: Sample[] } }
  if (body.status !== 'success' || body.data?.resultType !== 'vector' || !Array.isArray(body.data.result) || body.data.result.length > limit) throw new Error('Invalid metrics response.')
  return body.data.result
}

export type ProviderComparisonRow = {
  provider: string; kind: 'movie' | 'series' | 'anime'; region: string
  browser: string; delivery: 'all' | 'direct' | 'relay' | 'embed' | 'unattributed'
  evidence: 'native' | 'resolution' | 'provider-reported'
  starts?: number; playbackFailures?: number; buffers?: number
  startupSamples?: number; stallSamples?: number
  startupP50Ms?: number; startupP95Ms?: number; stallP50Ms?: number; stallP95Ms?: number
  resolveSuccess?: number; resolveFailures?: number; resolveCancelled?: number
  failureReasons?: Record<string, number>; reportedEvents?: Record<string, number>
}

/** Interpolate within pooled cumulative buckets, as histogram_quantile does.
 * Summing bucket observations before this calculation keeps browser/delivery
 * comparisons weighted by actual samples instead of averaging percentiles. */
function percentile(buckets: Map<number, number>, quantile: number): number | undefined {
  const total = buckets.get(Infinity)
  if (!total || total <= 0) return undefined
  const ordered = [...buckets].sort(([a], [b]) => a - b)
  if (ordered.length < 2) return undefined
  const target = total * quantile
  let lower = 0; let previous = 0
  for (const [upper, rawCount] of ordered) {
    const count = Math.max(previous, rawCount)
    if (count >= target) {
      if (!Number.isFinite(upper)) return lower
      return count === previous ? upper : lower + (upper - lower) * (target - previous) / (count - previous)
    }
    lower = upper; previous = count
  }
  return undefined
}

/** Fixed aggregate queries only. Resolver counters predate browser/delivery
 * attribution, so their rows deliberately retain that missing attribution.
 * Frame reports never contribute native starts, durations, or viewing. */
export async function readProviderComparisons(baseUrl: string, fetcher: typeof fetch = fetch): Promise<ProviderComparisonRow[]> {
  const [events, attempts, timings, reports] = await Promise.all([
    query(baseUrl, 'sum by (provider,kind,region,browser,delivery,event) (increase(consumit_playback_events_total[15m]))', fetcher, 10_000),
    query(baseUrl, 'sum by (provider,kind,region,outcome) (increase(consumit_provider_attempts_total[15m]))', fetcher, 10_000),
    query(baseUrl, 'sum by (provider,kind,region,browser,delivery,event,le) (increase(consumit_playback_client_duration_milliseconds_bucket{event=~"started|buffer-end"}[15m]))', fetcher, 20_000),
    query(baseUrl, 'sum by (provider,kind,region,browser,delivery,event) (increase(consumit_playback_frame_reported_total[15m]))', fetcher, 10_000),
  ])
  const rows = new Map<string, ProviderComparisonRow>()
  const histograms = new Map<ProviderComparisonRow, Map<string, Map<string, Map<number, number>>>>()
  function identity(sample: Sample) {
    const { provider, kind, region } = sample.metric ?? {}
    const value = Number(sample.value?.[1])
    if (!provider || !/^[a-z0-9-]{1,64}$/.test(provider) || !['movie', 'series', 'anime'].includes(kind ?? '') || !/^[A-Z]{2}$/.test(region ?? '') || !Number.isFinite(value) || value < 0) return null
    return { provider, kind: kind as ProviderComparisonRow['kind'], region: region!, value }
  }
  function row(sample: Sample, evidence: ProviderComparisonRow['evidence'], browser: string, delivery: ProviderComparisonRow['delivery']) {
    const id = identity(sample)
    if (!id) return null
    const key = `${id.provider}:${id.kind}:${id.region}:${browser}:${delivery}:${evidence}`
    let value = rows.get(key)
    if (!value) { value = { provider: id.provider, kind: id.kind, region: id.region, browser, delivery, evidence }; rows.set(key, value) }
    return { row: value, count: id.value }
  }
  function dimensions(sample: Sample, evidence: 'native' | 'provider-reported') {
    const delivery = sample.metric.delivery
    if (evidence === 'native' ? delivery !== 'direct' && delivery !== 'relay' : delivery !== 'embed') return []
    const browser = BROWSERS.has(sample.metric.browser ?? '') ? sample.metric.browser! : 'unknown'
    return [browser, 'all'].flatMap(family => [delivery, 'all'].map(mode => row(sample, evidence, family, mode as ProviderComparisonRow['delivery']))).filter(value => value !== null)
  }
  for (const sample of events) {
    const field = sample.metric.event === 'started' ? 'starts' : sample.metric.event === 'error' ? 'playbackFailures' : sample.metric.event === 'buffer-start' ? 'buffers' : null
    if (!field) continue
    for (const match of dimensions(sample, 'native')) match.row[field] = (match.row[field] ?? 0) + match.count
  }
  for (const sample of timings) {
    if (sample.metric.event !== 'started' && sample.metric.event !== 'buffer-end') continue
    const boundary = sample.metric.le === '+Inf' ? Infinity : Number(sample.metric.le)
    if (!(Number.isFinite(boundary) && boundary >= 0 || boundary === Infinity)) continue
    for (const match of dimensions(sample, 'native')) {
      let groups = histograms.get(match.row)
      if (!groups) { groups = new Map(); histograms.set(match.row, groups) }
      let series = groups.get(sample.metric.event)
      if (!series) { series = new Map(); groups.set(sample.metric.event, series) }
      const source = `${sample.metric.browser ?? 'unknown'}:${sample.metric.delivery}`
      let buckets = series.get(source)
      if (!buckets) { buckets = new Map(); series.set(source, buckets) }
      buckets.set(boundary, (buckets.get(boundary) ?? 0) + match.count)
    }
  }
  for (const [value, groups] of histograms) for (const [event, series] of groups) {
    // During a collector histogram-schema rollout, only shared boundaries are
    // comparable. A missing bucket must never be interpreted as zero samples.
    const sources = [...series.values()]
    const buckets = new Map([...sources[0]!.keys()].filter(boundary => sources.every(source => source.has(boundary))).map(boundary => [boundary, sources.reduce((sum, source) => sum + source.get(boundary)!, 0)]))
    const prefix = event === 'started' ? 'startup' : 'stall'
    if (buckets.has(Infinity)) value[`${prefix}Samples`] = buckets.get(Infinity)!
    for (const quantile of [0.5, 0.95]) {
      const timing = percentile(buckets, quantile)
      if (timing !== undefined) value[`${prefix}${quantile === 0.5 ? 'P50Ms' : 'P95Ms'}`] = timing
    }
  }
  for (const sample of attempts) {
    if (!['success', 'error', 'empty', 'cancelled'].includes(sample.metric.outcome ?? '')) continue
    const match = row(sample, 'resolution', 'all', 'unattributed')
    if (!match) continue
    const field = sample.metric.outcome === 'success' ? 'resolveSuccess' : sample.metric.outcome === 'cancelled' ? 'resolveCancelled' : 'resolveFailures'
    match.row[field] = (match.row[field] ?? 0) + match.count
    if (field === 'resolveFailures') { match.row.failureReasons ??= {}; match.row.failureReasons[sample.metric.outcome!] = (match.row.failureReasons[sample.metric.outcome!] ?? 0) + match.count }
  }
  const reportedEvents = new Set(['playing', 'paused', 'progress', 'ended', 'unavailable', 'error'])
  for (const sample of reports) {
    if (!reportedEvents.has(sample.metric.event ?? '')) continue
    for (const match of dimensions(sample, 'provider-reported')) { match.row.reportedEvents ??= {}; match.row.reportedEvents[sample.metric.event!] = (match.row.reportedEvents[sample.metric.event!] ?? 0) + match.count }
  }
  if (rows.size > 5000) throw new Error('Invalid metrics response.')
  return [...rows.values()]
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
