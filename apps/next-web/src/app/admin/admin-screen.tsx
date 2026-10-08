'use client'

import { Activity, CheckCircle, Compass, FlaskConical, Globe, LayoutDashboard, Users, XCircle } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useState } from 'react'

import { Button, EmptyState, LoadingState, SectionHeading, SegmentedControl, Select, StatusDot } from '@consumit/next-ui'

import { FilScreenShell } from '../home/filscreen-shell'
import { useSession } from '../session/session'
import { getProviderOrder, listMembers, listProviderAlerts, listProviderChanges, listProviderHealth, listProviderMetrics, listProviders, listSubtitleDiagnostics, saveProviderOrder, testSubtitleTitle, resetProviderCircuit, retestProvider, setMemberRole, type SubtitleProviderDiagnostic, type AdminMember, type AdminProvider, type ProviderAlert, type ProviderChange, type ProviderHealthRow, type ProviderKind, type ProviderMetrics, type ProviderReadinessSummary } from '@/lib/admin-browser'

import { ProvidersTab } from './provider-management'
import { OperationsDashboard } from './operations-dashboard'

const ProviderBench = dynamic(() => import('./provider-bench').then(module => module.ProviderBench), { loading: () => <LoadingState title="Opening provider bench" rows={3} /> })

type Tab = 'overview' | 'operations' | 'providers' | 'lab' | 'scout' | 'members'

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-card border border-border bg-surface p-4 ${className}`}>{children}</div>
}

export function ProviderControlSummary({ readiness }: { readiness: ProviderReadinessSummary }) {
  return (
    <section aria-label="Provider controls" className="rounded-card border border-border bg-surface p-4" role="region">
      <p className="text-sm font-semibold text-ink">{readiness.enabledRows} enabled · {readiness.configuredRows} configured</p>
      <p className="mt-1 text-xs leading-5 text-muted">Use the On control in a row, choose its role, then Save. Enabled Video source and Both providers are eligible for playback. Apogee Audio source and Both rows can supply optional added audio; other audio providers remain inactive. Saved changes apply without restarting the API.</p>
      {Boolean(readiness.removedRows) && <p className="mt-1 text-xs text-muted">{readiness.removedRows} deleted · use the Deleted filter to restore a provider.</p>}
    </section>
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
      return <tr key={`${row.id}:${row.region}`} className="border-b border-border/50 last:border-0"><td className="p-3 font-mono text-xs text-ink">{row.id}<span className="block font-sans text-muted">{row.region} · {kind}</span></td><td className="p-3"><StatusDot label={row.status} tone={row.status === 'healthy' ? 'lime' : row.status === 'down' ? 'danger' : 'neutral'} /></td><td className="p-3 text-xs text-muted">{row.probe ? `${row.probe.ok ? 'Resolved' : row.probe.code ?? 'Failed'} · ${row.probe.ms}ms · ${probeAge}m ago` : 'No probe yet'}</td><td className="p-3 text-xs text-muted">{metricsAvailable ? browserTrends.length ? `${Math.round(trend.starts)} starts · ${Math.round(trend.playbackFailures)} failures · ${Math.round(trend.buffers)} stalls` : 'No recent plays' : 'Unavailable'}{browserTiming.map(([key, value]) => { const browser = key.slice(prefix.length); const startup = value.startupP50Ms !== undefined ? `start p50/p95/p99 ${Math.round(value.startupP50Ms)}/${Math.round(value.startupP95Ms ?? 0)}/${Math.round(value.startupP99Ms ?? 0)}ms` : ''; const stalls = value.stallP50Ms !== undefined ? `stall p50/p95/p99 ${Math.round(value.stallP50Ms)}/${Math.round(value.stallP95Ms ?? 0)}/${Math.round(value.stallP99Ms ?? 0)}ms` : ''; return <span className="block" key={key}>{browser}: {[startup, stalls].filter(Boolean).join(' · ')}</span> })}</td><td className="p-3 text-xs text-muted">{row.circuit?.openUntil && row.circuit.openUntil > (updatedAt ?? 0) ? `Cooling until ${date(row.circuit.openUntil)}` : row.circuit && row.circuit.failures + row.circuit.playbackFailures > 0 ? `${row.circuit.failures} resolve · ${row.circuit.playbackFailures} playback failures` : 'Closed'}</td><td className="p-3 text-xs text-muted">{provider ? provider.deliveryMode === 'relay' ? 'Proxy' : provider.deliveryMode === 'embed' ? 'Embed' : 'Direct' : 'Unknown'}{browserTrends.length > 0 && <span className="block">{Math.round(trend.directSelections)} selections</span>}</td><td className="p-3"><div className="flex gap-2"><Button variant="secondary" size="sm" disabled={working !== null} onClick={() => void run(row.id, row.region, 'retest')}>Retest</Button><Button variant="ghost" size="sm" disabled={working !== null || !row.circuit || row.circuit.failures + row.circuit.playbackFailures === 0} onClick={() => void run(row.id, row.region, 'reset')}>Reset circuit</Button></div></td></tr>
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
      <div><h3 className="text-sm font-bold text-ink">Playback attempt order</h3><p className="mt-1 text-xs text-muted">Saved settings are shown below. Direct providers run first, then Proxy providers in their saved order. Unavailable providers are skipped.</p></div>
      <Select label="Title kind" value={kind} options={[{ label: 'Movies', value: 'movie' }, { label: 'Series', value: 'series' }, { label: 'Anime', value: 'anime' }]} onValueChange={(value) => { setBusy(true); setKind(value as ProviderKind) }} />
    </div>
    {error && <p className="mt-3 text-xs text-danger" role="alert">{error}</p>}
    <ol className="mt-4 max-h-96 space-y-1 overflow-y-auto" aria-label={`${kind} provider order`}>
      {ids.map((id, index) => {
        const provider = providers.find((entry) => entry.id === id)
        return <li key={id} draggable={!busy} onDragStart={(event) => event.dataTransfer.setData('text/plain', String(index))} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const from = Number(event.dataTransfer.getData('text/plain')); if (Number.isInteger(from)) move(from, index) }} className="flex items-center gap-2 rounded-control border border-border bg-field px-3 py-2 text-xs">
          <span className="w-5 tabular-nums text-muted">{index + 1}</span><span className="min-w-0 flex-1 truncate font-mono text-ink">{id}</span><span className="text-muted">{provider?.enabled ? provider.deliveryMode === 'relay' ? 'Proxy' : provider.deliveryMode === 'embed' ? 'Embed' : 'Direct' : 'Disabled'}</span>
          <button type="button" aria-label={`Move ${id} up`} disabled={busy || index === 0} onClick={() => move(index, index - 1)} className="min-h-9 min-w-9 rounded border border-border disabled:opacity-40">↑</button>
          <button type="button" aria-label={`Move ${id} down`} disabled={busy || index === ids.length - 1} onClick={() => move(index, index + 1)} className="min-h-9 min-w-9 rounded border border-border disabled:opacity-40">↓</button>
        </li>
      })}
    </ol>
    <div className="mt-3 flex items-center gap-2"><Button variant="accent" size="sm" disabled={busy || ids.join('|') === saved.join('|')} onClick={() => void saveOrder()}>Save order</Button><Button variant="ghost" size="sm" disabled={busy || ids.join('|') === saved.join('|')} onClick={() => setIds(saved)}>Discard</Button></div>
  </Card>
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
  { key: 'overview', label: 'Dashboard', icon: <LayoutDashboard className="size-4" /> },
  { key: 'providers', label: 'Providers', icon: <Globe className="size-4" /> },
  { key: 'lab', label: 'Playback debug', icon: <FlaskConical className="size-4" /> },
  { key: 'scout', label: 'Provider scout', icon: <Compass className="size-4" /> },
  { key: 'operations', label: 'Diagnostics', icon: <Activity className="size-4" /> },
  { key: 'members', label: 'Access', icon: <Users className="size-4" /> },
]

export function AdminScreen() {
  const [tab, setTab] = useState<Tab>('overview')
  const [visited, setVisited] = useState<Tab[]>(['overview'])
  const [debugTarget, setDebugTarget] = useState<{ id: string; kind: ProviderKind; version: number } | undefined>(undefined)
  const navigate = useCallback((next: Tab) => {
    setTab(next); setVisited(current => current.includes(next) ? current : [...current, next])
    window.history.replaceState(window.history.state, '', `#${next}`)
  }, [])
  useEffect(() => {
    const open = () => { const hash = window.location.hash.slice(1); if (tabs.some(entry => entry.key === hash)) navigate(hash as Tab) }
    const initial = setTimeout(open, 0); window.addEventListener('hashchange', open)
    return () => { clearTimeout(initial); window.removeEventListener('hashchange', open) }
  }, [navigate])

  return (
    <FilScreenShell pageHeading={undefined}>
      <main className="mx-auto w-full min-w-0 max-w-[1600px]">
        <div className="mb-6 border-b border-border pb-6">
          <h1 className="font-display text-4xl tracking-[-0.02em] text-ink">Control room<span className="text-orange">.</span></h1>
          <p className="mt-2 max-w-[70ch] text-sm leading-6 text-muted">Playback evidence, provider controls, and the next reliable source.</p>
        </div>

        <div className="grid min-w-0 gap-6 xl:grid-cols-[172px_minmax(0,1fr)]">
        <nav className="flex content-start gap-1 overflow-x-auto border-b border-border xl:block xl:border-b-0 xl:border-r xl:pr-4" aria-label="Admin sections">
          {tabs.map((t) => (
            <button
              aria-current={tab === t.key ? 'page' : undefined}
              key={t.key}
              className={`flex shrink-0 items-center gap-2 rounded-control px-3 py-3 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-orange xl:mb-1 xl:w-full ${
                tab === t.key
                  ? 'bg-orange/10 text-orange'
                  : 'text-muted hover:bg-surface hover:text-ink'
              }`}
              onClick={() => navigate(t.key)}
              type="button"
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>

        <div className="min-w-0">
        <div hidden={tab !== 'overview'}><OperationsDashboard active={tab === 'overview'} onNavigate={navigate} onDebug={(id, kind) => { setDebugTarget({ id, kind, version: Date.now() }); navigate('lab') }} /></div>
        {tab === 'operations' && <OperationsTab />}
        {visited.includes('providers') && <div hidden={tab !== 'providers'}><ProvidersTab /></div>}
        {visited.includes('lab') && <div hidden={tab !== 'lab'}><ProviderBench mode="configured" active={tab === 'lab'} target={debugTarget} onManage={() => navigate('providers')} /></div>}
        {visited.includes('scout') && <div hidden={tab !== 'scout'}><ProviderBench mode="scout" active={tab === 'scout'} onManage={() => navigate('providers')} /></div>}
        {tab === 'members' && <MembersTab />}
        </div>
        </div>
      </main>
    </FilScreenShell>
  )
}
