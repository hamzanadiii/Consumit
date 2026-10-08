'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Download, RefreshCw, RotateCcw, Search, TriangleAlert } from 'lucide-react'
import { Button, EmptyState, Input, LoadingState, Select, StatusDot } from '@consumit/next-ui'
import { checkHealth, listProviderAlerts, listProviderChanges, listProviderHealth, listProviderMetrics, listProviders, resetProviderCircuit,
  type AdminProvider, type HealthResult, type ProviderAlert, type ProviderChange, type ProviderHealthRow, type ProviderKind, type ProviderMetrics } from '@/lib/admin-browser'
import { downloadAdminReport } from './admin-report'

type Snapshot = { services: HealthResult | null; providers: AdminProvider[]; health: Record<ProviderKind, ProviderHealthRow[]> | null;
  metrics: Record<string, ProviderMetrics>; metricsAvailable: boolean; window: number; alerts: ProviderAlert[]; alertsAvailable: boolean; changes: ProviderChange[]; failures: string[]; at: number }
const kinds: ProviderKind[] = ['movie', 'series', 'anime']
const labels = { movie: 'Movies', series: 'Series', anime: 'Anime' }
const time = (stamp: number | string) => new Date(stamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })

export function OperationsDashboard({ active, onNavigate, onDebug }: { active: boolean; onNavigate: (section: 'providers' | 'operations' | 'scout') => void; onDebug: (id: string, kind: ProviderKind) => void }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [auto, setAuto] = useState(true)
  const [kind, setKind] = useState<ProviderKind>('movie')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [working, setWorking] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const inFlight = useRef<AbortController | null>(null)
  const refresh = useCallback(async () => {
    if (inFlight.current) return
    const controller = new AbortController(); inFlight.current = controller
    const timer = setTimeout(() => controller.abort(), 10000)
    setRefreshing(true)
    const requests = [checkHealth(controller.signal), listProviders(controller.signal), listProviderHealth(controller.signal), listProviderMetrics(controller.signal), listProviderAlerts(controller.signal), listProviderChanges(controller.signal)] as const
    const [services, fleet, health, metrics, alerts, changes] = await Promise.allSettled(requests)
    if (inFlight.current !== controller) { clearTimeout(timer); return }
    const failures = ['Services', 'Roster', 'Provider health', 'Playback metrics', 'Alerts', 'Change history'].filter((_, i) => [services, fleet, health, metrics, alerts, changes][i]?.status === 'rejected')
    setSnapshot({ services: services.status === 'fulfilled' ? services.value : null,
      providers: fleet.status === 'fulfilled' ? fleet.value.providers : [], health: health.status === 'fulfilled' ? health.value : null,
      metrics: metrics.status === 'fulfilled' ? metrics.value.metrics : {}, metricsAvailable: metrics.status === 'fulfilled' && metrics.value.available,
      window: metrics.status === 'fulfilled' ? metrics.value.windowMinutes : 15, alerts: alerts.status === 'fulfilled' ? alerts.value.alerts : [], alertsAvailable: alerts.status === 'fulfilled' && alerts.value.available,
      changes: changes.status === 'fulfilled' ? changes.value.changes : [], failures, at: Date.now() })
    clearTimeout(timer); inFlight.current = null; setRefreshing(false)
  }, [])
  useEffect(() => {
    if (!active) return
    const initial = setTimeout(() => void refresh(), 0)
    const tick = setInterval(() => { if (auto && document.visibilityState === 'visible') void refresh() }, 30000)
    return () => { clearTimeout(initial); clearInterval(tick); inFlight.current?.abort(); inFlight.current = null }
  }, [active, auto, refresh])
  async function reset(id: string) {
    if (working) return
    setWorking(id); setActionError(null)
    try { await resetProviderCircuit(id, kind); await refresh() }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Circuit reset failed. Retry.') }
    finally { setWorking(null) }
  }
  if (!snapshot) return <LoadingState title="Reading playback operations" rows={5} />
  const allRows = snapshot.health?.[kind] ?? []
  const rows = allRows.filter(row => (!query || row.id.includes(query.toLowerCase()) || row.region.toLowerCase().includes(query.toLowerCase())) && (filter === 'all' || filter === 'attention' ? filter !== 'attention' || row.status === 'down' || row.status === 'degraded' : row.status === filter))
  const total = Object.values(snapshot.metrics).reduce((sum, metric) => ({ starts: sum.starts + metric.starts, failures: sum.failures + metric.playbackFailures, stalls: sum.stalls + metric.buffers }), { starts: 0, failures: 0, stalls: 0 })
  const attention = kinds.flatMap(k => (snapshot.health?.[k] ?? []).filter(row => row.enabled && (row.status === 'down' || row.status === 'degraded')).map(row => ({ ...row, kind: k })))
  const firing = snapshot.alerts.filter(alert => alert.state === 'firing')
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-xl font-semibold text-ink">Playback overview</h2><p className="mt-1 text-xs text-muted">Updated {time(snapshot.at)} UTC · {snapshot.providers.filter(p => p.enabled && !p.removed).length} enabled providers</p></div>
      <div className="flex items-center gap-2"><label className="flex items-center gap-2 text-xs text-muted"><input checked={auto} className="accent-orange" onChange={event => setAuto(event.target.checked)} type="checkbox" /> Live · 30s</label><Button size="sm" variant="secondary" loading={refreshing} onClick={() => void refresh()}><RefreshCw className="size-3.5" /> Refresh</Button><Button size="sm" variant="ghost" onClick={() => downloadAdminReport('consumit-operations.json', { capturedAt: new Date(snapshot.at).toISOString(), health: snapshot.health, metrics: snapshot.metricsAvailable ? snapshot.metrics : null, unavailable: snapshot.failures })}><Download className="size-3.5" /> Export</Button></div>
    </div>
    {snapshot.failures.length > 0 && <p className="rounded-control border border-border p-3 text-sm text-copy" role="alert">Could not load: {snapshot.failures.join(', ')}. Other sections remain available. Use Refresh to retry.</p>}
    {actionError && <p className="text-sm text-danger" role="alert">{actionError}</p>}
    <div className="grid grid-cols-3 border-y border-border py-1">
      {kinds.map(k => { const eligible = snapshot.providers.filter(p => p.enabled && !p.removed && p.role !== 'audio' && p.mediaKinds.includes(k)).length; const bad = attention.filter(row => row.kind === k).length
        return <button type="button" key={k} aria-pressed={kind === k} onClick={() => setKind(k)} className={`min-w-0 px-4 py-4 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-orange ${kind === k ? 'bg-orange/10 text-ink' : 'text-muted hover:bg-surface'}`}><span className="flex items-center justify-between gap-2 text-sm font-semibold">{labels[k]}<span className={kind === k ? 'text-orange' : 'text-muted'}>{eligible} enabled for video</span></span><span className="mt-1 block text-xs text-muted">{bad ? `${bad} region checks need attention` : snapshot.health ? 'No degraded or down region checks' : 'Health unavailable'}</span></button>
      })}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4 text-xs text-muted"><p>Last {snapshot.window} minutes <span className="ml-3 text-ink">{snapshot.metricsAvailable ? `${Math.round(total.starts)} starts · ${Math.round(total.failures)} playback failures · ${Math.round(total.stalls)} stalls` : 'Playback metrics unavailable'}</span></p><Button size="sm" variant="ghost" onClick={() => onNavigate('operations')}>Detailed diagnostics <ArrowUpRight className="size-3.5" /></Button></div>
    <div className="grid min-w-0 gap-6 2xl:grid-cols-[minmax(0,1fr)_290px]">
      <section aria-label="Provider fleet" className="min-w-0">
        <div className="mb-3 flex items-end justify-between gap-3"><div><h3 className="text-base font-semibold text-ink">{labels[kind]} fleet</h3><p className="mt-1 text-xs text-muted">Resolution probes and member playback are separate evidence.</p></div><Button size="sm" variant="ghost" onClick={() => onNavigate('providers')}>Manage <ArrowUpRight className="size-3.5" /></Button></div>
        <div className="mb-3 flex flex-wrap items-center gap-3"><div className="flex min-w-40 flex-1 items-center gap-2"><Search className="size-4 text-muted" /><Input aria-label="Search provider health" placeholder="Find provider or region" value={query} onChange={event => setQuery(event.target.value)} /></div><Select label="Health filter" hideLabel value={filter} onValueChange={setFilter} options={[{ value: 'all', label: 'All states' }, { value: 'attention', label: 'Needs attention' }, { value: 'healthy', label: 'Healthy' }, { value: 'unknown', label: 'Unknown' }, { value: 'disabled', label: 'Disabled' }]} /></div>
        {!snapshot.health ? <EmptyState title="Provider health unavailable" description="Refresh to reconnect. Provider controls remain available." /> : rows.length === 0 ? <EmptyState title="No matching providers" description="Change the search or health filter." /> : <div className="overflow-x-auto rounded-card border border-border"><table className="w-full min-w-[650px] text-left text-xs"><thead className="bg-surface text-muted"><tr>{['Provider / region', 'State', 'Last resolution', 'Playback / 15m', 'Actions'].map(text => <th key={text} className="px-3 py-3 font-medium">{text}</th>)}</tr></thead><tbody>{rows.map(row => {
          const values = Object.entries(snapshot.metrics).filter(([key]) => key.startsWith(`${row.id}:${kind}:${row.region}:`)).map(([, value]) => value)
          const starts = values.reduce((sum, value) => sum + value.starts, 0); const failures = values.reduce((sum, value) => sum + value.playbackFailures, 0)
          const open = row.circuit && row.circuit.openUntil > snapshot.at
          return <tr key={`${row.id}:${row.region}`} className="border-t border-border hover:bg-surface/60"><td className="px-3 py-4"><span className="font-medium text-ink">{row.id}</span><span className="ml-2 text-muted">{row.region}</span>{open && <span className="mt-1 block text-orange">Cooling until {time(row.circuit!.openUntil)} UTC</span>}</td><td className="px-3 py-4"><StatusDot label={row.status} tone={row.status === 'healthy' ? 'lime' : row.status === 'down' ? 'danger' : 'neutral'} /></td><td className="px-3 py-4 tabular-nums text-muted">{row.probe ? <><span className="block text-copy">{row.probe.ok ? 'Source found' : row.probe.code ?? 'Failed'} · {row.probe.ms}ms</span>{Math.max(0, Math.floor((snapshot.at - row.probe.at) / 60000))}m ago</> : 'Untested'}</td><td className="px-3 py-4 tabular-nums text-copy">{snapshot.metricsAvailable ? values.length ? `${Math.round(starts)} starts · ${Math.round(failures)} errors` : 'No recent plays' : 'Unavailable'}</td><td className="px-3 py-4"><div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => onDebug(row.id, kind)}>Debug</Button>{row.circuit && row.circuit.failures + row.circuit.playbackFailures > 0 && <Button size="sm" variant="ghost" disabled={working !== null} loading={working === row.id} aria-label={`Reset circuit for ${row.id}`} onClick={() => void reset(row.id)}><RotateCcw className="size-3.5" /></Button>}</div></td></tr>
        })}</tbody></table></div>}
      </section>
      <aside className="grid content-start gap-6 xl:grid-cols-2 2xl:grid-cols-1">
        <section aria-labelledby="attention-heading"><h3 id="attention-heading" className="mb-3 flex items-center gap-2 text-base font-semibold text-ink"><TriangleAlert className="size-4 text-orange" /> Needs attention</h3><div className="border-y border-border py-3">{attention.length === 0 && firing.length === 0 ? <p className="text-sm text-copy">{snapshot.health ? 'No current provider incidents.' : 'Incident status unavailable.'}</p> : <ul className="space-y-3">{attention.slice(0, 5).map(row => <li key={`${row.id}:${row.kind}:${row.region}`}><button className="text-left text-sm font-medium text-ink hover:text-orange focus-visible:outline-2 focus-visible:outline-orange" onClick={() => onDebug(row.id, row.kind)} type="button">{row.id} · {labels[row.kind]}</button><p className="mt-1 text-xs text-muted">{row.region} · {row.status} · {row.probe?.code ?? 'Inspect playback and circuit'}</p></li>)}{firing.slice(0, 3).map((alert, index) => <li key={`${alert.name}:${index}`} className="text-xs text-copy">{alert.name} · {alert.provider ?? 'Fleet'} · {alert.severity}</li>)}</ul>}<p className="mt-3 text-xs text-muted">{snapshot.alertsAvailable ? `${firing.length} firing alerts` : 'Alert service unavailable'} · Unknown states need evidence.</p></div></section>
        <section aria-labelledby="service-heading"><h3 id="service-heading" className="mb-3 text-base font-semibold text-ink">Services</h3><dl className="divide-y divide-border border-y border-border text-xs">{[['API', snapshot.services?.api], ['Playback store', snapshot.services?.store], ['Playback metrics', snapshot.metricsAvailable ? 'ok' : undefined], ['Alert service', snapshot.alertsAvailable ? 'ok' : undefined]].map(([label, status]) => <div key={label} className="flex items-center justify-between gap-3 py-3"><dt className="text-copy">{label}</dt><dd><StatusDot tone={status === 'ok' ? 'lime' : status === 'error' ? 'danger' : 'neutral'} label={status === 'ok' ? 'Connected' : status === 'error' ? 'Error' : 'Unavailable'} /></dd></div>)}</dl></section>
        <section className="xl:col-span-2 2xl:col-span-1"><h3 className="mb-2 text-base font-semibold text-ink">Find the next reliable source</h3><p className="text-xs leading-5 text-muted">Compare reviewed candidates on the same title, then verify decoding and seeking in your browser.</p><Button className="mt-3" size="sm" variant="secondary" onClick={() => onNavigate('scout')}>Open provider scout <ArrowUpRight className="size-3.5" /></Button></section>
      </aside>
    </div>
    <section aria-labelledby="changes-heading" className="border-t border-border pt-5"><h3 id="changes-heading" className="mb-3 text-base font-semibold text-ink">Recent changes</h3>{snapshot.changes.length === 0 ? <p className="text-xs text-muted">{snapshot.failures.includes('Change history') ? 'Change history unavailable. Refresh to retry.' : 'No saved provider changes yet.'}</p> : <ul className="divide-y divide-border">{snapshot.changes.slice(0, 6).map((change, index) => <li key={`${change.createdAt}:${index}`} className="flex items-start justify-between gap-4 py-3 text-xs"><div><span className="font-medium text-ink">{change.providerId}</span><span className="ml-3 text-muted">{change.after ? Object.entries(change.after).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(change.before?.[key as keyof typeof change.before])).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : typeof value === 'object' ? 'updated' : String(value)}`).join(' · ') || 'Configuration saved' : 'Overrides reset'}</span></div><time className="shrink-0 tabular-nums text-muted" dateTime={change.createdAt}>{time(change.createdAt)} UTC</time></li>)}</ul>}</section>
  </div>
}
