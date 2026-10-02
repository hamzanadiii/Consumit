'use client'

import { Activity, CheckCircle, Database, FlaskConical, Globe, Play, Server, Users, XCircle } from 'lucide-react'
import Link from 'next/link'
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'

import { Button, EmptyState, Input, Label, LoadingState, SectionHeading, SegmentedControl, Select, StatusDot } from '@consumit/ui'

import { FilScreenShell } from '../home/filscreen-shell'
import { useSession } from '../session/session'
import { checkHealth, getProviderOrder, listMembers, listProviderAlerts, listProviderChanges, listProviderHealth, listProviderMetrics, listProviders, listSubtitleDiagnostics, saveProviderOrder, testSubtitleTitle, resetProviderCircuit, retestProvider, setMemberRole, testProvider, type SubtitleProviderDiagnostic, type AdminMember, type AdminProvider, type HealthResult, type ProviderAlert, type ProviderChange, type ProviderHealthRow, type ProviderKind, type ProviderMetrics, type ProviderReadinessSummary, type ProviderTestResult } from '@/lib/admin-browser'

import { ProvidersTab } from './provider-management'

type Tab = 'overview' | 'operations' | 'providers' | 'lab' | 'members'

function Badge({ ok }: { ok: boolean }) {
  return ok
    ? <span className="inline-flex items-center gap-1 text-xs font-bold text-lime"><CheckCircle className="size-3" /> OK</span>
    : <span className="inline-flex items-center gap-1 text-xs font-bold text-danger"><XCircle className="size-3" /> Error</span>
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-card border border-border bg-surface p-4 ${className}`}>{children}</div>
}

export function ProviderControlSummary({ readiness }: { readiness: ProviderReadinessSummary }) {
  return (
    <section aria-label="Provider controls" className="rounded-card border border-border bg-surface p-4" role="region">
      <p className="text-sm font-semibold text-ink">{readiness.enabledRows} enabled · {readiness.configuredRows} configured</p>
      <p className="mt-1 text-xs leading-5 text-muted">Use the On control in a row, then Save, to make that provider eligible for playback. Saved changes apply without restarting the API.</p>
      {Boolean(readiness.removedRows) && <p className="mt-1 text-xs text-muted">{readiness.removedRows} deleted · use the Deleted filter to restore a provider.</p>}
    </section>
  )
}

// --- Overview Tab ---

function OverviewTab() {
  const [health, setHealth] = useState<HealthResult | null>(null)
  const [providers, setProviders] = useState<AdminProvider[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([checkHealth(), listProviders()]).then(([h, p]) => {
      setHealth(h); setProviders(p.providers); setError(null)
    }).catch((cause) => setError(cause instanceof Error ? cause.message : 'Control room data could not be loaded.')).finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingState title="Checking health" rows={3} />

  return (
    <div className="space-y-6">
      <SectionHeading title="At a glance." description="API, store, and the loaded fleet." />
      {error && <p className="text-sm text-danger" role="alert">{error} Refresh this page to retry.</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <div className="flex items-center gap-2 text-sm font-bold text-ink"><Server className="size-4" /> API</div>
          <div className="mt-2"><Badge ok={health?.api === 'ok'} /></div>
        </Card>
        <Card>
          <div className="flex items-center gap-2 text-sm font-bold text-ink"><Database className="size-4" /> Store</div>
          <div className="mt-2"><Badge ok={health?.store === 'ok'} /></div>
        </Card>
      </div>
      <Card>
        <h3 className="text-sm font-bold text-ink">Providers Loaded</h3>
        <p className="mt-2 text-2xl font-bold text-orange">{providers.length}</p>
        <p className="text-xs text-muted">Configured adapters, including those turned off in Admin</p>
      </Card>
    </div>
  )
}

// --- Providers Tab ---

function OperationsTab() {
  const [kind, setKind] = useState<'movie' | 'series' | 'anime'>('movie')
  const [health, setHealth] = useState<Record<'movie' | 'series' | 'anime', ProviderHealthRow[]> | null>(null)
  const [providers, setProviders] = useState<AdminProvider[]>([])
  const [metrics, setMetrics] = useState<Record<string, ProviderMetrics>>({})
  const [metricsAvailable, setMetricsAvailable] = useState(false)
  const [changes, setChanges] = useState<ProviderChange[]>([])
  const [alerts, setAlerts] = useState<ProviderAlert[]>([])
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const [subtitleProviders, setSubtitleProviders] = useState<SubtitleProviderDiagnostic[]>([])
  const [subtitleTestId, setSubtitleTestId] = useState('')
  const [subtitleTestSeason, setSubtitleTestSeason] = useState('1')
  const [subtitleTestEpisode, setSubtitleTestEpisode] = useState('1')
  const [subtitleTestWorking, setSubtitleTestWorking] = useState(false)
  const [subtitleTestResult, setSubtitleTestResult] = useState<string | null>(null)
  const refresh = useCallback(async () => {
    try {
      const [nextHealth, nextProviders, nextMetrics, nextChanges, nextAlerts, nextSubtitles] = await Promise.all([listProviderHealth(), listProviders(), listProviderMetrics().catch(() => ({ available: false, metrics: {} })), listProviderChanges().catch(() => ({ changes: [] })), listProviderAlerts().catch(() => ({ alerts: [] })), listSubtitleDiagnostics().catch(() => ({ providers: [] }))])
      setHealth(nextHealth); setProviders(nextProviders.providers); setMetrics(nextMetrics.metrics); setMetricsAvailable(nextMetrics.available); setChanges(nextChanges.changes); setAlerts(nextAlerts.alerts); setSubtitleProviders(nextSubtitles.providers); setUpdatedAt(Date.now()); setError(null)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Provider health could not be loaded.') }
  }, [])
  useEffect(() => {
    const initial = setTimeout(() => void refresh(), 0)
    const timer = setInterval(() => void refresh(), 30_000)
    return () => {
      clearTimeout(initial)
      clearInterval(timer)
    }
  }, [refresh])
  async function run(id: string, region: string, action: 'retest' | 'reset') {
    setWorking(`${id}:${region}`); setError(null)
    try {
      if (action === 'retest') await retestProvider(id, kind, region)
      else await resetProviderCircuit(id, kind)
      await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The provider action failed.') }
    finally { setWorking(null) }
  }
  const rows = health?.[kind] ?? []
  // Explicit locale + timezone so SSR and hydration always agree.
  const date = (stamp: number) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' }).format(stamp)
  async function runSubtitleTest() {
    const id = Number(subtitleTestId)
    if (!Number.isInteger(id) || id <= 0) { setSubtitleTestResult('Enter a valid title ID.'); return }
    setSubtitleTestWorking(true); setSubtitleTestResult(null)
    try {
      const result = await testSubtitleTitle(kind === 'movie' ? { kind, id } : kind === 'anime' ? { kind, id, episode: Number(subtitleTestEpisode) } : { kind, id, season: Number(subtitleTestSeason), episode: Number(subtitleTestEpisode) })
      setSubtitleProviders(result.providers)
      setSubtitleTestResult(`${result.tracks} candidates across ${result.languages} languages.`)
    } catch (cause) { setSubtitleTestResult(cause instanceof Error ? cause.message : 'Subtitle test failed.') }
    finally { setSubtitleTestWorking(false) }
  }
  return <div className="space-y-5">
    <SectionHeading title="Provider operations." description="Probes and viewer playback are different signals. A green probe found a source; it does not prove video played. Circuit state is shared across regions." action={<Button variant="secondary" size="sm" onClick={() => void refresh()}>Refresh</Button>} />
    <div className="flex flex-wrap items-center justify-between gap-3">
      <SegmentedControl legend="Title kind" name="operations-kind" value={kind} onValueChange={(value) => setKind(value as typeof kind)} options={[{ value: 'movie', label: 'Movies' }, { value: 'series', label: 'Series' }, { value: 'anime', label: 'Anime' }]} />
      <p className="text-xs text-muted" role="status">{updatedAt ? `Updated ${date(updatedAt)}` : 'Waiting for health data'}</p>
    </div>
    {error && <p className="text-sm text-danger" role="alert">{error}</p>}
    {alerts.filter((alert) => alert.state === 'firing').length > 0 && <div className="rounded-card border border-danger/50 bg-surface p-4" role="alert"><h3 className="text-sm font-bold text-danger">Playback alerts</h3><ul className="mt-2 space-y-1 text-xs text-ink">{alerts.filter((alert) => alert.state === 'firing').map((alert, index) => <li key={`${alert.name}:${index}`}>Provider playback failures{alert.provider ? ` · ${alert.provider}` : ''}{alert.kind ? ` · ${alert.kind}` : ''}{alert.region ? ` · ${alert.region}` : ''}</li>)}</ul></div>}
    {!health && !error && <LoadingState title="Loading provider health" rows={3} />}
    {health && rows.length === 0 && <EmptyState title="No providers for this title kind." description="Deploy a configured adapter before it can be monitored." icon={<Globe className="size-5" />} />}
    {health && !metricsAvailable && <p className="text-xs text-muted" role="note">Playback trends are unavailable until the metrics backend is connected. Probe and circuit status remain visible.</p>}
    {health && rows.length > 0 && <div className="overflow-x-auto rounded-card border border-border bg-surface"><table className="w-full min-w-[980px] text-left text-sm"><thead><tr className="border-b border-border text-xs text-muted"><th className="p-3">Provider</th><th className="p-3">Status</th><th className="p-3">Last probe</th><th className="p-3">Playback · 15m</th><th className="p-3">Circuit</th><th className="p-3">Delivery</th><th className="p-3">Actions</th></tr></thead><tbody>{rows.map((row) => {
      const provider = providers.find((entry) => entry.id === row.id)
      const probeAge = row.probe ? Math.max(0, Math.floor(((updatedAt ?? 0) - row.probe.at) / 60_000)) : null
      const prefix = `${row.id}:${kind}:${row.region}:`
      const browserTrends = Object.entries(metrics).filter(([key]) => key.startsWith(prefix))
      const trend = browserTrends.reduce((total, [, value]) => ({
        starts: total.starts + value.starts, playbackFailures: total.playbackFailures + value.playbackFailures,
        buffers: total.buffers + value.buffers, directSelections: total.directSelections + value.directSelections,
      }), { starts: 0, playbackFailures: 0, buffers: 0, directSelections: 0 })
      const browserTiming = browserTrends.filter(([, value]) => value.startupP50Ms !== undefined || value.stallP50Ms !== undefined)
      return <tr key={`${row.id}:${row.region}`} className="border-b border-border/50 last:border-0"><td className="p-3 font-mono text-xs text-ink">{row.id}<span className="block font-sans text-muted">{row.region} · {kind}</span></td><td className="p-3"><StatusDot label={row.status} tone={row.status === 'healthy' ? 'lime' : row.status === 'down' ? 'danger' : 'neutral'} /></td><td className="p-3 text-xs text-muted">{row.probe ? `${row.probe.ok ? 'Resolved' : row.probe.code ?? 'Failed'} · ${row.probe.ms}ms · ${probeAge}m ago` : 'No probe yet'}</td><td className="p-3 text-xs text-muted">{metricsAvailable ? browserTrends.length ? `${Math.round(trend.starts)} starts · ${Math.round(trend.playbackFailures)} failures · ${Math.round(trend.buffers)} stalls` : 'No recent plays' : 'Unavailable'}{browserTiming.map(([key, value]) => { const browser = key.slice(prefix.length); const startup = value.startupP50Ms !== undefined ? `start p50/p95/p99 ${Math.round(value.startupP50Ms)}/${Math.round(value.startupP95Ms ?? 0)}/${Math.round(value.startupP99Ms ?? 0)}ms` : ''; const stalls = value.stallP50Ms !== undefined ? `stall p50/p95/p99 ${Math.round(value.stallP50Ms)}/${Math.round(value.stallP95Ms ?? 0)}/${Math.round(value.stallP99Ms ?? 0)}ms` : ''; return <span className="block" key={key}>{browser}: {[startup, stalls].filter(Boolean).join(' · ')}</span> })}</td><td className="p-3 text-xs text-muted">{row.circuit?.openUntil && row.circuit.openUntil > (updatedAt ?? 0) ? `Cooling until ${date(row.circuit.openUntil)}` : row.circuit && row.circuit.failures + row.circuit.playbackFailures > 0 ? `${row.circuit.failures} resolve · ${row.circuit.playbackFailures} playback failures` : 'Closed'}</td><td className="p-3 text-xs text-muted">{provider ? 'Direct' : 'Unknown'}{browserTrends.length > 0 && <span className="block">{Math.round(trend.directSelections)} selections</span>}</td><td className="p-3"><div className="flex gap-2"><Button variant="secondary" size="sm" disabled={working !== null} onClick={() => void run(row.id, row.region, 'retest')}>Retest</Button><Button variant="ghost" size="sm" disabled={working !== null || !row.circuit || row.circuit.failures + row.circuit.playbackFailures === 0} onClick={() => void run(row.id, row.region, 'reset')}>Reset circuit</Button></div></td></tr>
    })}</tbody></table></div>}
    {changes.length > 0 && <section aria-labelledby="provider-changes-heading" className="space-y-2"><h3 id="provider-changes-heading" className="text-sm font-bold text-ink">Recent configuration changes</h3><ul className="divide-y divide-border rounded-card border border-border bg-surface px-4">{changes.slice(0, 10).map((change, index) => <li key={`${change.createdAt}:${change.providerId}:${index}`} className="flex flex-wrap items-center justify-between gap-2 py-3 text-xs"><span className="font-mono text-ink">{change.providerId}</span><span className="text-muted">{change.after ? `${change.after.removed ? 'Deleted' : change.before?.removed ? 'Restored (disabled)' : change.after.enabled === false ? 'Disabled' : change.after.order ? 'Order updated' : 'Settings updated'}` : 'Override reset'} by {change.actorId}</span><time className="text-faint" dateTime={change.createdAt}>{new Date(change.createdAt).toLocaleString('en-US', { timeZone: 'UTC' })}</time></li>)}</ul></section>}
    <section aria-labelledby="subtitle-operations-heading" className="space-y-3">
      <SectionHeading title="Subtitle providers." description="Last search and file preparation outcomes. Missing credentials and failed providers do not hide tracks from healthy providers." />
      <div className="flex flex-wrap items-end gap-2 rounded-card border border-border bg-surface p-3">
        <label className="space-y-1 text-xs text-muted">Title ID<input aria-label="Subtitle test title ID" className="block w-28 rounded-control border border-border bg-canvas p-2 text-ink" onChange={(event) => setSubtitleTestId(event.target.value)} type="number" min="1" value={subtitleTestId} /></label>
        {kind !== 'movie' ? <><label className="space-y-1 text-xs text-muted">Season<input aria-label="Subtitle test season" className="block w-20 rounded-control border border-border bg-canvas p-2 text-ink" onChange={(event) => setSubtitleTestSeason(event.target.value)} type="number" min="1" value={subtitleTestSeason} /></label><label className="space-y-1 text-xs text-muted">Episode<input aria-label="Subtitle test episode" className="block w-20 rounded-control border border-border bg-canvas p-2 text-ink" onChange={(event) => setSubtitleTestEpisode(event.target.value)} type="number" min="1" value={subtitleTestEpisode} /></label></> : null}
        <Button disabled={subtitleTestWorking} onClick={() => void runSubtitleTest()} size="sm" variant="secondary">{subtitleTestWorking ? 'Testing…' : 'Test this title / episode'}</Button>
        {subtitleTestResult ? <span className="text-xs text-muted" role="status">{subtitleTestResult}</span> : null}
      </div>
      <div className="overflow-x-auto rounded-card border border-border bg-surface"><table className="w-full min-w-[600px] text-left text-xs"><thead><tr className="border-b border-border text-muted"><th className="p-3">Provider</th><th className="p-3">Configuration</th><th className="p-3">Last search</th><th className="p-3">Results</th><th className="p-3">Failure</th></tr></thead><tbody>{subtitleProviders.map((provider) => <tr className="border-b border-border/50 last:border-0" key={provider.id}><td className="p-3 font-medium text-ink">{provider.name}</td><td className="p-3 text-muted">{provider.configured ? 'Configured' : `Credentials required: ${provider.requirement}`}</td><td className="p-3 text-muted">{provider.last ? `${provider.last.state} · ${provider.last.durationMs}ms` : 'Not searched yet'}</td><td className="p-3 tabular-nums text-ink">{provider.last?.found ?? '—'}</td><td className="p-3 text-muted">{provider.last?.failure ?? '—'}</td></tr>)}</tbody></table></div>
    </section>
  </div>
}

// --- Providers Tab ---

export function ProviderOrderEditor({ providers }: { providers: AdminProvider[] }) {
  const [kind, setKind] = useState<ProviderKind>('movie')
  const [ids, setIds] = useState<string[]>([])
  const [saved, setSaved] = useState<string[]>([])
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    void getProviderOrder(kind).then((order) => { if (active) { setIds(order.providerIds); setSaved(order.providerIds); setRevision(order.revision); setError(null) } })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Provider order could not be loaded.') })
      .finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [kind, providers])
  function move(from: number, to: number) {
    if (to < 0 || to >= ids.length || from === to) return
    setIds((current) => { const next = [...current]; next.splice(to, 0, next.splice(from, 1)[0]!); return next })
  }
  async function saveOrder() {
    setBusy(true)
    try {
      const result = await saveProviderOrder(kind, ids, revision)
      setIds(result.providerIds); setSaved(result.providerIds); setRevision(result.revision); setError(null)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Provider order was not saved.') }
    finally { setBusy(false) }
  }
  return <Card>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="text-sm font-bold text-ink">Playback attempt order</h3><p className="mt-1 text-xs text-muted">Providers are tried in your saved order. Unavailable providers are skipped.</p></div>
      <Select label="Title kind" value={kind} options={[{ label: 'Movies', value: 'movie' }, { label: 'Series', value: 'series' }, { label: 'Anime', value: 'anime' }]} onValueChange={(value) => { setBusy(true); setKind(value as ProviderKind) }} />
    </div>
    {error && <p className="mt-3 text-xs text-danger" role="alert">{error}</p>}
    <ol className="mt-4 max-h-96 space-y-1 overflow-y-auto" aria-label={`${kind} provider order`}>
      {ids.map((id, index) => {
        const provider = providers.find((entry) => entry.id === id)
        return <li key={id} draggable={!busy} onDragStart={(event) => event.dataTransfer.setData('text/plain', String(index))} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const from = Number(event.dataTransfer.getData('text/plain')); if (Number.isInteger(from)) move(from, index) }} className="flex items-center gap-2 rounded-control border border-border bg-field px-3 py-2 text-xs">
          <span className="w-5 tabular-nums text-muted">{index + 1}</span><span className="min-w-0 flex-1 truncate font-mono text-ink">{id}</span><span className="text-muted">{provider?.enabled ? 'Direct' : 'Disabled'}</span>
          <button type="button" aria-label={`Move ${id} up`} disabled={busy || index === 0} onClick={() => move(index, index - 1)} className="min-h-9 min-w-9 rounded border border-border disabled:opacity-40">↑</button>
          <button type="button" aria-label={`Move ${id} down`} disabled={busy || index === ids.length - 1} onClick={() => move(index, index + 1)} className="min-h-9 min-w-9 rounded border border-border disabled:opacity-40">↓</button>
        </li>
      })}
    </ol>
    <div className="mt-3 flex items-center gap-2"><Button variant="accent" size="sm" disabled={busy || ids.join('|') === saved.join('|')} onClick={() => void saveOrder()}>Save order</Button><Button variant="ghost" size="sm" disabled={busy || ids.join('|') === saved.join('|')} onClick={() => setIds(saved)}>Discard</Button></div>
  </Card>
}

// --- Provider Lab ---

type LabKind = 'movie' | 'series' | 'anime'
type LabRow = { id: string; status: 'running' | 'ok' | 'fail'; ms?: number | undefined; result?: ProviderTestResult | undefined }

function LabTab() {
  const [providers, setProviders] = useState<AdminProvider[]>([])
  const [loading, setLoading] = useState(true)
  const [kind, setKind] = useState<LabKind>('movie')
  const [titleId, setTitleId] = useState('969681')
  const [season, setSeason] = useState('1')
  const [episode, setEpisode] = useState('1')
  const [audio, setAudio] = useState('en')
  const [scope, setScope] = useState('enabled')
  const [formError, setFormError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [rows, setRows] = useState<LabRow[]>([])
  const [ranRef, setRanRef] = useState<{ kind: LabKind; id: number; season?: number; episode?: number } | null>(null)
  const seqRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => () => { seqRef.current++; abortRef.current?.abort() }, [])

  const refresh = useCallback(() => {
    listProviders().then((result) => { setProviders(result.providers); setLoading(false) }).catch(() => setLoading(false))
  }, [])
  useEffect(() => { refresh() }, [refresh])

  function buildRef(): { kind: LabKind; id: number; season?: number; episode?: number } | null {
    const id = Number(titleId)
    if (!Number.isSafeInteger(id) || id <= 0) { setFormError('Enter a valid catalog ID.'); return null }
    if (kind === 'movie') return { kind, id }
    const ep = Number(episode)
    if (!Number.isSafeInteger(ep) || ep <= 0) { setFormError('Enter a valid episode number.'); return null }
    if (kind === 'anime') return { kind, id, episode: ep }
    const sn = Number(season)
    if (!Number.isSafeInteger(sn) || sn <= 0) { setFormError('Enter a valid season number.'); return null }
    return { kind, id, season: sn, episode: ep }
  }

  async function run(e: FormEvent) {
    e.preventDefault()
    if (running) return
    const ref = buildRef()
    if (!ref) return
    setFormError(null)
    const targets = (scope === 'all' ? [...providers] : scope === 'enabled' ? providers.filter((p) => p.enabled) : providers.filter((p) => p.id === scope))
      .filter((p) => !p.removed && p.mediaKinds.includes(kind))
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    if (targets.length === 0) { setFormError('No provider in scope.'); return }
    const seq = ++seqRef.current
    const controller = new AbortController()
    abortRef.current = controller
    setRunning(true)
    setRanRef(ref)
    setRows(targets.map((p) => ({ id: p.id, status: 'running' as const })))
    for (const p of targets) {
      const started = performance.now()
      const ms = () => Math.round(performance.now() - started)
      try {
        const result = await testProvider(p.id, ref, audio.trim() || undefined, controller.signal)
        if (seqRef.current !== seq) return
        setRows((prev) => prev.map((r) => r.id === p.id ? { ...r, status: result.ok ? 'ok' as const : 'fail' as const, ms: ms(), result } : r))
      } catch (err) {
        if (seqRef.current !== seq) return
        const message = err instanceof Error ? err.message : 'Unknown error'
        setRows((prev) => prev.map((r) => r.id === p.id
          ? { ...r, status: 'fail' as const, ms: ms(), result: { providerId: p.id, ok: false, code: 'error', error: message } }
          : r))
      }
    }
    if (seqRef.current === seq) { setRunning(false); abortRef.current = null }
  }

  function stop() {
    seqRef.current++
    abortRef.current?.abort()
    abortRef.current = null
    setRunning(false)
    setRows((current) => current.map((row) => row.status === 'running' ? { ...row, status: 'fail', result: { providerId: row.id, ok: false, code: 'stopped' } } : row))
  }

  const answered = rows.filter((r) => r.status === 'ok').length
  const sourceTotal = rows.reduce((sum, r) => sum + (r.result?.ok ? r.result.sourceCount ?? 0 : 0), 0)

  // Play a result through the real Watch flow, pinned to that provider:
  // resolve lands normally, then Watch switches once to the pinned source.
  function playHref(providerId: string): string | null {
    if (!ranRef) return null
    const pin = `provider=${encodeURIComponent(providerId)}`
    if (ranRef.kind === 'movie') return `/watch/movie/${ranRef.id}?${pin}`
    if (ranRef.kind === 'series' && ranRef.season && ranRef.episode) {
      return `/watch/series/${ranRef.id}?season=${ranRef.season}&episode=${ranRef.episode}&${pin}`
    }
    if (ranRef.kind === 'anime' && ranRef.episode) return `/watch/anime/${ranRef.id}?episode=${ranRef.episode}&${pin}`
    return null
  }

  if (loading) return <LoadingState title="Loading providers" rows={4} />

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Provider lab."
        description="Resolve one title across the fleet. Results show validated source metadata; open the real player to verify playback."
      />
      <Card>
        <form className="flex flex-wrap items-end gap-4" onSubmit={run}>
          <SegmentedControl
            legend="Title kind"
            name="lab-kind"
            onValueChange={(v) => setKind(v as LabKind)}
            options={[{ value: 'movie', label: 'Movie' }, { value: 'series', label: 'Series' }, { value: 'anime', label: 'Anime' }]}
            value={kind}
          />
          <div>
            <Label className="text-xs" htmlFor="lab-scope">Provider scope</Label>
            <Select
              id="lab-scope"
              label="Provider scope"
              hideLabel
              onValueChange={setScope}
              options={[{ value: 'enabled', label: 'Enabled providers' }, { value: 'all', label: 'Every configured provider' }, ...providers.filter((p) => !p.removed && p.mediaKinds.includes(kind)).map((p) => ({ value: p.id, label: p.id }))]}
              value={scope}
            />
          </div>
          <div>
            <Label className="text-xs" htmlFor="lab-id">{kind === 'anime' ? 'AniList ID' : 'TMDB ID'}</Label>
            <Input className="mt-1 w-32" id="lab-id" inputMode="numeric" onChange={(e) => setTitleId(e.target.value)} placeholder="969681" value={titleId} />
          </div>
          {kind === 'series' && (
            <div>
              <Label className="text-xs" htmlFor="lab-season">Season</Label>
              <Input className="mt-1 w-20" id="lab-season" inputMode="numeric" onChange={(e) => setSeason(e.target.value)} value={season} />
            </div>
          )}
          {kind !== 'movie' && (
            <div>
              <Label className="text-xs" htmlFor="lab-episode">Episode</Label>
              <Input className="mt-1 w-20" id="lab-episode" inputMode="numeric" onChange={(e) => setEpisode(e.target.value)} value={episode} />
            </div>
          )}
          <div>
            <Label className="text-xs" htmlFor="lab-audio">Audio</Label>
            <Input className="mt-1 w-20" id="lab-audio" maxLength={8} onChange={(e) => setAudio(e.target.value)} value={audio} />
          </div>
          <Button variant="accent" size="sm" type="submit" loading={running}>
            <Play className="size-3" /> Run
          </Button>
          {running && <Button onClick={stop} size="sm" type="button" variant="secondary">Stop</Button>}
        </form>
        {formError && <p className="mt-3 text-xs text-danger" role="alert">{formError}</p>}
      </Card>

      {rows.length === 0 ? (
        <EmptyState
          title="Name a title to probe the fleet."
          description="Run one title across every provider. Each row reports validated sources and latency."
          icon={<FlaskConical className="size-5" />}
        />
      ) : (
        <Card>
          <p className="text-xs text-muted" role="status">
            {running ? 'Probing…' : `${answered} of ${rows.length} answered · ${sourceTotal} source(s)`}
          </p>
          <ul className="mt-3 space-y-2">
            {rows.map((row) => {
              const provider = providers.find((p) => p.id === row.id)
              return (
                <li key={row.id} className="rounded-control border border-border bg-field px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <StatusDot
                      tone={row.status === 'ok' ? 'lime' : row.status === 'fail' ? 'danger' : 'neutral'}
                      label={row.status === 'ok'
                        ? `${row.result?.sourceCount ?? 0} source(s)${row.ms !== undefined ? ` · ${row.ms}ms` : ''}`
                        : row.status === 'fail'
                          ? row.result?.code ?? 'failed'
                          : 'Probing…'}
                    />
                    <span className="font-mono text-sm font-bold text-ink">{row.id}</span>
                    {provider?.mediaKinds.map((k) => (
                      <span key={k} className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-bold ${k === 'anime' ? 'bg-orange/10 text-orange' : 'bg-sky/10 text-sky'}`}>
                        {k}
                      </span>
                    ))}
                    <span className="ml-auto flex items-center gap-2">
                      {row.result && !row.result.ok && row.result.error && (
                        <span className="max-w-64 truncate text-xs text-danger" title={row.result.error}>{row.result.error}</span>
                      )}
                      {row.status === 'ok' && provider?.enabled && playHref(row.id) && (
                        <Link
                          className="inline-flex h-9 items-center gap-1.5 rounded-control bg-ink px-3 text-[0.8125rem] font-medium text-canvas transition-colors hover:bg-white"
                          href={playHref(row.id)!}
                          target="_blank"
                          title={`Play this title pinned to ${row.id}`}
                        >
                          <Play className="size-3" /> Play
                        </Link>
                      )}
                    </span>
                  </div>
                  {row.result?.ok && row.result.sources && row.result.sources.length > 0 && (
                    <details className="mt-2 text-xs">
                      <summary className="cursor-pointer text-muted hover:text-ink">Sources ({row.result.sources.length})</summary>
                      <ul className="mt-2 space-y-1.5">
                        {row.result.sources.map((s, i) => (
                          <li key={i} className="rounded-micro border border-border/50 px-2 py-1.5">
                            <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted">
                              <span className="font-mono text-ink">{s.key}</span>
                              <span>{s.type}</span>
                              <span>{s.language}</span>
                              {s.qualityHint && <span className="text-orange">{s.qualityHint}</span>}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              )
            })}
          </ul>
        </Card>
      )}
    </div>
  )
}

// --- Members Tab ---

function MembersTab() {
  const session = useSession()
  const [members, setMembers] = useState<AdminMember[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState<string | null>(null)
  const pageSize = 50

  const refresh = useCallback(() => {
    listMembers(pageSize, page * pageSize).then((r) => { setMembers(r.members); setTotal(r.total); setError(null); setLoading(false) }).catch((cause) => { setError(cause instanceof Error ? cause.message : 'Members could not be loaded.'); setLoading(false) })
  }, [page])
  useEffect(() => { refresh() }, [refresh])

  async function toggleRole(member: AdminMember) {
    if (member.id === session.member?.id) return
    const newRole = member.role === 'admin' ? 'member' : 'admin'
    setWorking(member.id)
    try { await setMemberRole(member.id, newRole); refresh() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Member role could not be changed.') }
    finally { setWorking(null) }
  }

  if (loading) return <LoadingState title="Loading members" rows={4} />

  return (
    <div className="space-y-6">
      <SectionHeading title="Membership." description="Promote operators, demote back to members." />
      {error && <p className="text-sm text-danger" role="alert">{error} <Button onClick={refresh} size="sm" variant="ghost">Try again</Button></p>}
      <Card>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-ink">Members ({total})</h3>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <span className="text-xs text-muted">Page {page + 1} / {Math.ceil(total / pageSize) || 1}</span>
            <Button variant="ghost" size="sm" disabled={(page + 1) * pageSize >= total} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="pb-2 pr-4">Username</th>
                <th className="pb-2 pr-4">Email</th>
                <th className="pb-2 pr-4">Role</th>
                <th className="pb-2 pr-4">Verified</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b border-border/50">
                  <td className="py-2 pr-4 font-mono text-ink">{m.username}</td>
                  <td className="py-2 pr-4 text-muted">{m.email}</td>
                  <td className="py-2 pr-4">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${m.role === 'admin' ? 'bg-orange/10 text-orange' : 'bg-surface-raised text-muted'}`}>
                      {m.role}
                    </span>
                  </td>
                  <td className="py-2 pr-4">{m.emailVerified ? <CheckCircle className="size-3 text-lime" /> : <XCircle className="size-3 text-muted" />}</td>
                  <td className="py-2">
                    {m.id !== session.member?.id && (
                      <Button disabled={working !== null} loading={working === m.id} variant="ghost" size="sm" onClick={() => void toggleRole(m)}>
                        {m.role === 'admin' ? 'Demote' : 'Promote'}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

// --- Main Admin Screen ---

const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'overview', label: 'Overview', icon: <Activity className="size-4" /> },
  { key: 'operations', label: 'Operations', icon: <Activity className="size-4" /> },
  { key: 'providers', label: 'Providers', icon: <Globe className="size-4" /> },
  { key: 'lab', label: 'Lab', icon: <FlaskConical className="size-4" /> },
  { key: 'members', label: 'Members', icon: <Users className="size-4" /> },
]

export function AdminScreen() {
  const [tab, setTab] = useState<Tab>('overview')

  return (
    <FilScreenShell pageHeading={undefined}>
      <main className="mx-auto max-w-6xl">
        <div className="mb-6">
          <h1 className="font-display text-4xl tracking-[-0.02em] text-ink">Control room<span className="text-orange">.</span></h1>
          <p className="mt-2 max-w-[62ch] text-sm leading-6 text-muted">Probe providers, tune the fleet, and manage access.</p>
        </div>

        <nav className="mb-8 flex gap-1 overflow-x-auto border-b border-border" aria-label="Admin sections">
          {tabs.map((t) => (
            <button
              aria-current={tab === t.key ? 'page' : undefined}
              key={t.key}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-bold transition-colors ${
                tab === t.key
                  ? 'border-orange text-orange'
                  : 'border-transparent text-muted hover:text-ink'
              }`}
              onClick={() => setTab(t.key)}
              type="button"
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>

        {tab === 'overview' && <OverviewTab />}
        {tab === 'operations' && <OperationsTab />}
        {tab === 'providers' && <ProvidersTab />}
        {tab === 'lab' && <LabTab />}
        {tab === 'members' && <MembersTab />}
      </main>
    </FilScreenShell>
  )
}
