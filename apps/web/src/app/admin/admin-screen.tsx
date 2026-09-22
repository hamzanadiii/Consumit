'use client'

import { Activity, CheckCircle, Database, FlaskConical, Globe, Play, Server, Shield, Users, XCircle } from 'lucide-react'
import Link from 'next/link'
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'

import { Button, EmptyState, Input, Label, LoadingState, SectionHeading, SegmentedControl, Select, StatusDot } from '@consumit/ui'

import { ScreenShell } from '../screens/screen-shell'
import { useSession } from '../session/session'
import { addDomain, checkHealth, getProviderConfig, listDomains, listMembers, listProviders, removeDomain, resetProviderConfig, setMemberRole, testProvider, updateProviderConfig, type AdminMember, type AdminProvider, type HealthResult, type ProviderOverridePatch, type ProviderTestResult } from '@/lib/admin-browser'

type Tab = 'overview' | 'providers' | 'lab' | 'domains' | 'members'

function Badge({ ok }: { ok: boolean }) {
  return ok
    ? <span className="inline-flex items-center gap-1 text-xs font-bold text-lime"><CheckCircle className="size-3" /> OK</span>
    : <span className="inline-flex items-center gap-1 text-xs font-bold text-danger"><XCircle className="size-3" /> Error</span>
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-card border border-border bg-surface p-4 ${className}`}>{children}</div>
}

// --- Overview Tab ---

function OverviewTab() {
  const [health, setHealth] = useState<HealthResult | null>(null)
  const [providers, setProviders] = useState<AdminProvider[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([checkHealth().catch(() => null), listProviders().catch(() => ({ providers: [] }))]).then(([h, p]) => {
      setHealth(h)
      setProviders(p.providers)
      setLoading(false)
    })
  }, [])

  if (loading) return <LoadingState title="Checking health" rows={3} />

  return (
    <div className="space-y-6">
      <SectionHeading title="At a glance." description="API, edge, store, and the loaded fleet." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <div className="flex items-center gap-2 text-sm font-bold text-ink"><Server className="size-4" /> API</div>
          <div className="mt-2"><Badge ok={health?.api === 'ok'} /></div>
        </Card>
        <Card>
          <div className="flex items-center gap-2 text-sm font-bold text-ink"><Globe className="size-4" /> Worker</div>
          <div className="mt-2">
            {health?.worker
              ? <Badge ok={health.worker.status === 'ok'} />
              : <span className="text-xs text-muted">Not configured</span>}
          </div>
          {health?.worker?.latencyMs !== undefined && <p className="mt-1 text-xs text-muted">{health.worker.latencyMs}ms</p>}
        </Card>
        <Card>
          <div className="flex items-center gap-2 text-sm font-bold text-ink"><Database className="size-4" /> Store</div>
          <div className="mt-2"><Badge ok={health?.store === 'ok'} /></div>
        </Card>
      </div>
      <Card>
        <h3 className="text-sm font-bold text-ink">Providers Loaded</h3>
        <p className="mt-2 text-2xl font-bold text-orange">{providers.length}</p>
        <p className="text-xs text-muted">Active provider adapters in configuration</p>
      </Card>
    </div>
  )
}

// --- Providers Tab ---

function ProvidersTab() {
  const [providers, setProviders] = useState<AdminProvider[]>([])
  const [overrides, setOverrides] = useState<Record<string, ProviderOverridePatch>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  const refresh = useCallback(() => {
    Promise.all([listProviders().catch(() => ({ providers: [] as AdminProvider[] })), getProviderConfig().catch(() => ({ overrides: {} }))])
      .then(([p, c]) => { setProviders(p.providers); setOverrides(c.overrides); setLoading(false) })
  }, [])
  useEffect(() => { refresh() }, [refresh])

  function getEffective(p: AdminProvider) {
    const o = overrides[p.id]
    return {
      enabled: o?.enabled ?? p.enabled,
      proxy: o?.proxy ?? p.proxy,
      priority: o?.priority ?? p.priority,
      regions: o?.regions ?? p.regions,
      requestsPerMinute: o?.requestsPerMinute ?? p.requestsPerMinute,
      concurrency: o?.concurrency ?? p.concurrency,
      hasOverride: !!o && (o.enabled !== undefined || o.proxy !== undefined || o.priority !== undefined
        || o.regions !== undefined || o.requestsPerMinute !== undefined || o.concurrency !== undefined),
    }
  }

  async function patch(id: string, patch: ProviderOverridePatch) {
    setSaving(id)
    try {
      await updateProviderConfig(id, patch)
      refresh()
    } catch { /* ignore */ } finally { setSaving(null) }
  }

  async function resetConfig(id: string) {
    setSaving(id)
    try {
      await resetProviderConfig(id)
      refresh()
    } catch { /* ignore */ } finally { setSaving(null) }
  }

  if (loading) return <LoadingState title="Loading providers" rows={4} />

  return (
    <div className="space-y-6">
      <SectionHeading
        title="The fleet."
        description="Tune which providers answer, how they deliver, and how hard each one may try. Changes apply immediately."
        action={Object.keys(overrides).length > 0
          ? <span className="text-xs font-bold text-orange">{Object.keys(overrides).length} override(s) active</span>
          : undefined}
      />
      <Card>
        <p className="text-xs text-muted">{providers.length} providers in configuration</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="pb-2 pr-3">ID</th>
                <th className="pb-2 pr-3">Kind</th>
                <th className="pb-2 pr-3 text-center">On</th>
                <th className="pb-2 pr-3 text-center">Proxy</th>
                <th className="pb-2 pr-3">Priority</th>
                <th className="pb-2 pr-3">Regions</th>
                <th className="pb-2 pr-3">RPM</th>
                <th className="pb-2 pr-3">Conc.</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {[...providers].sort((a, b) => getEffective(b).priority - getEffective(a).priority).map((p) => {
                const eff = getEffective(p)
                return (
                  <tr key={p.id} className={`border-b border-border/50 ${eff.hasOverride ? 'bg-surface-raised/50' : ''}`}>
                    <td className="py-2 pr-3 font-mono text-ink">{p.id}</td>
                    <td className="py-2 pr-3">
                      {p.mediaKinds.map((k) => (
                        <span key={k} className={`mr-1 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-bold ${k === 'anime' ? 'bg-orange/10 text-orange' : 'bg-sky/10 text-sky'}`}>
                          {k}
                        </span>
                      ))}
                    </td>
                    <td className="py-2 pr-3 text-center">
                      <button
                        className={`inline-flex size-6 items-center justify-center rounded-full transition-colors ${eff.enabled ? 'bg-lime/20 text-lime' : 'bg-surface text-muted'}`}
                        disabled={saving === p.id}
                        onClick={() => patch(p.id, { enabled: !eff.enabled })}
                        title={eff.enabled ? 'Disable' : 'Enable'}
                        type="button"
                      >
                        {eff.enabled ? '✓' : '—'}
                      </button>
                    </td>
                    <td className="py-2 pr-3 text-center">
                      <button
                        className={`inline-flex size-6 items-center justify-center rounded-full transition-colors ${eff.proxy ? 'bg-orange/20 text-orange' : 'bg-surface text-muted'}`}
                        disabled={saving === p.id}
                        onClick={() => patch(p.id, { proxy: !eff.proxy })}
                        title={eff.proxy ? 'Proxy enabled — click to use direct' : 'Direct — click to enable proxy'}
                        type="button"
                      >
                        {eff.proxy ? 'P' : 'D'}
                      </button>
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        className="w-12 rounded-control border border-border bg-field px-1.5 py-0.5 text-center text-xs text-ink"
                        defaultValue={eff.priority}
                        disabled={saving === p.id}
                        onBlur={(e) => { const n = parseInt(e.target.value, 10); if (Number.isFinite(n) && n >= 0 && n <= 100) patch(p.id, { priority: n }) }}
                        type="number"
                        min={0}
                        max={100}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        className="w-24 rounded-control border border-border bg-field px-1.5 py-0.5 text-xs text-ink"
                        defaultValue={eff.regions.join(', ')}
                        disabled={saving === p.id}
                        onBlur={(e) => {
                          const regions = e.target.value.split(',').map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z]{2}$/.test(s))
                          if (regions.length > 0) patch(p.id, { regions })
                        }}
                        placeholder="US, IT"
                        title="Comma-separated 2-letter country codes"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        className="w-12 rounded-control border border-border bg-field px-1.5 py-0.5 text-center text-xs text-ink"
                        defaultValue={eff.requestsPerMinute}
                        disabled={saving === p.id}
                        onBlur={(e) => { const n = parseInt(e.target.value, 10); if (Number.isFinite(n) && n >= 1 && n <= 120) patch(p.id, { requestsPerMinute: n }) }}
                        type="number"
                        min={1}
                        max={120}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        className="w-10 rounded-control border border-border bg-field px-1.5 py-0.5 text-center text-xs text-ink"
                        defaultValue={eff.concurrency}
                        disabled={saving === p.id}
                        onBlur={(e) => { const n = parseInt(e.target.value, 10); if (Number.isFinite(n) && n >= 1 && n <= 4) patch(p.id, { concurrency: n }) }}
                        type="number"
                        min={1}
                        max={4}
                      />
                    </td>
                    <td className="py-2">
                      {eff.hasOverride && (
                        <Button variant="ghost" size="sm" onClick={() => resetConfig(p.id)} disabled={saving === p.id}>
                          <XCircle className="mr-1 size-3" /> Reset
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

// --- Provider Lab ---

type LabKind = 'movie' | 'series' | 'anime'
type LabRow = { id: string; status: 'running' | 'ok' | 'fail'; ms?: number | undefined; result?: ProviderTestResult | undefined }

function LabTab() {
  const [providers, setProviders] = useState<AdminProvider[]>([])
  const [overrides, setOverrides] = useState<Record<string, ProviderOverridePatch>>({})
  const [loading, setLoading] = useState(true)
  const [kind, setKind] = useState<LabKind>('movie')
  const [titleId, setTitleId] = useState('969681')
  const [season, setSeason] = useState('1')
  const [episode, setEpisode] = useState('1')
  const [audio, setAudio] = useState('en')
  const [scope, setScope] = useState('all')
  const [formError, setFormError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [rows, setRows] = useState<LabRow[]>([])
  const [ranRef, setRanRef] = useState<{ kind: LabKind; id: number; season?: number; episode?: number } | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const seqRef = useRef(0)

  const refresh = useCallback(() => {
    Promise.all([listProviders().catch(() => ({ providers: [] as AdminProvider[] })), getProviderConfig().catch(() => ({ overrides: {} as Record<string, ProviderOverridePatch> }))])
      .then(([p, c]) => { setProviders(p.providers); setOverrides(c.overrides); setLoading(false) })
  }, [])
  useEffect(() => { refresh() }, [refresh])

  function effectiveProxy(p: AdminProvider) {
    return overrides[p.id]?.proxy ?? p.proxy
  }

  async function toggleProxy(p: AdminProvider) {
    setToggling(p.id)
    try {
      await updateProviderConfig(p.id, { proxy: !effectiveProxy(p) })
      const c = await getProviderConfig().catch(() => ({ overrides }))
      setOverrides(c.overrides)
    } catch { /* keep last known state */ } finally { setToggling(null) }
  }

  function buildRef(): { kind: LabKind; id: number; season?: number; episode?: number } | null {
    const id = parseInt(titleId, 10)
    if (!Number.isFinite(id) || id <= 0) { setFormError('Enter a valid catalog ID.'); return null }
    if (kind === 'movie') return { kind, id }
    const ep = parseInt(episode, 10)
    if (!Number.isFinite(ep) || ep <= 0) { setFormError('Enter a valid episode number.'); return null }
    if (kind === 'anime') return { kind, id, episode: ep }
    const sn = parseInt(season, 10)
    if (!Number.isFinite(sn) || sn <= 0) { setFormError('Enter a valid season number.'); return null }
    return { kind, id, season: sn, episode: ep }
  }

  async function run(e: FormEvent) {
    e.preventDefault()
    if (running) return
    const ref = buildRef()
    if (!ref) return
    setFormError(null)
    const targets = (scope === 'all' ? [...providers] : providers.filter((p) => p.id === scope))
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    if (targets.length === 0) { setFormError('No provider in scope.'); return }
    const seq = ++seqRef.current
    setRunning(true)
    setRanRef(ref)
    setRows(targets.map((p) => ({ id: p.id, status: 'running' as const })))
    await Promise.all(targets.map(async (p) => {
      const started = performance.now()
      const ms = () => Math.round(performance.now() - started)
      try {
        const result = await testProvider(p.id, ref, audio.trim() || undefined)
        if (seqRef.current !== seq) return
        setRows((prev) => prev.map((r) => r.id === p.id ? { ...r, status: 'ok' as const, ms: ms(), result } : r))
      } catch (err) {
        if (seqRef.current !== seq) return
        const message = err instanceof Error ? err.message : 'Unknown error'
        setRows((prev) => prev.map((r) => r.id === p.id
          ? { ...r, status: 'fail' as const, ms: ms(), result: { providerId: p.id, ok: false, code: 'error', error: message } }
          : r))
      }
    }))
    if (seqRef.current === seq) setRunning(false)
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
        description="Resolve one title across the fleet and tune delivery from the results. Resolution only — no media bytes cross the API."
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
              options={[{ value: 'all', label: 'Every provider' }, ...providers.map((p) => ({ value: p.id, label: p.id }))]}
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
        </form>
        {formError && <p className="mt-3 text-xs text-danger" role="alert">{formError}</p>}
      </Card>

      {rows.length === 0 ? (
        <EmptyState
          title="Name a title to probe the fleet."
          description="Run one title across every provider. Each row reports sources, latency, and a one-click proxy switch."
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
              const proxied = provider ? effectiveProxy(provider) : true
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
                      {row.status === 'ok' && playHref(row.id) && (
                        <Link
                          className="inline-flex h-9 items-center gap-1.5 rounded-control bg-ink px-3 text-[0.8125rem] font-medium text-canvas transition-colors hover:bg-white"
                          href={playHref(row.id)!}
                          target="_blank"
                          title={`Play this title pinned to ${row.id}`}
                        >
                          <Play className="size-3" /> Play
                        </Link>
                      )}
                      {provider && (
                        <Button
                          variant="secondary"
                          size="sm"
                          loading={toggling === provider.id}
                          onClick={() => void toggleProxy(provider)}
                          title={proxied ? 'Deliver through the Worker proxy' : 'Deliver direct from upstream'}
                        >
                          {proxied ? 'Proxy on' : 'Direct'}
                        </Button>
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
                            <p className="mt-1 break-all font-mono text-[11px] text-faint">{s.url}</p>
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

// --- Domains Tab ---

function DomainsTab() {
  const [domains, setDomains] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [newDomain, setNewDomain] = useState('')
  const [saving, setSaving] = useState(false)

  const refresh = useCallback(() => { listDomains().then((d) => { setDomains(d.domains); setLoading(false) }).catch(() => setLoading(false)) }, [])
  useEffect(() => { refresh() }, [refresh])

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!newDomain.trim()) return
    setSaving(true)
    try {
      await addDomain(newDomain.trim())
      setNewDomain('')
      refresh()
    } catch { /* ignore */ } finally { setSaving(false) }
  }

  async function handleRemove(domain: string) {
    await removeDomain(domain)
    refresh()
  }

  if (loading) return <p className="text-muted text-sm">Loading...</p>

  return (
    <div className="space-y-6">
      <SectionHeading title="Allowed origins." description="Browsers that may embed playback." />
      <Card>
        <h3 className="text-sm font-bold text-ink">Add Allowed Domain</h3>
        <form className="mt-3 flex items-end gap-3" onSubmit={handleAdd}>
          <div className="flex-1">
            <Label className="text-xs">Domain</Label>
            <Input className="mt-1" value={newDomain} onChange={(e) => setNewDomain(e.target.value)} placeholder="example.com" />
          </div>
          <Button variant="accent" size="sm" type="submit" disabled={saving || !newDomain.trim()}>Add</Button>
        </form>
      </Card>

      <Card>
        <h3 className="text-sm font-bold text-ink">Allowed Domains ({domains.length})</h3>
        {domains.length === 0 ? (
          <p className="mt-3 text-xs text-muted">No domains configured.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {domains.map((d) => (
              <li key={d} className="flex items-center justify-between rounded-control border border-border bg-field px-3 py-2">
                <span className="font-mono text-sm text-ink">{d}</span>
                <Button variant="danger" size="sm" onClick={() => handleRemove(d)}>Remove</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
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
  const pageSize = 50

  const refresh = useCallback(() => {
    listMembers(pageSize, page * pageSize).then((r) => { setMembers(r.members); setTotal(r.total); setLoading(false) }).catch(() => setLoading(false))
  }, [page])
  useEffect(() => { refresh() }, [refresh])

  async function toggleRole(member: AdminMember) {
    if (member.id === session.member?.id) return
    const newRole = member.role === 'admin' ? 'member' : 'admin'
    await setMemberRole(member.id, newRole)
    refresh()
  }

  if (loading) return <p className="text-muted text-sm">Loading...</p>

  return (
    <div className="space-y-6">
      <SectionHeading title="Membership." description="Promote operators, demote back to members." />
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
                      <Button variant="ghost" size="sm" onClick={() => toggleRole(m)}>
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
  { key: 'providers', label: 'Providers', icon: <Globe className="size-4" /> },
  { key: 'lab', label: 'Lab', icon: <FlaskConical className="size-4" /> },
  { key: 'domains', label: 'Domains', icon: <Shield className="size-4" /> },
  { key: 'members', label: 'Members', icon: <Users className="size-4" /> },
]

export function AdminScreen() {
  const [tab, setTab] = useState<Tab>('overview')

  return (
    <ScreenShell activeHref="/admin" withFooter={false}>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6">
          <h1 className="font-display text-4xl tracking-[-0.02em] text-ink">Control room<span className="text-orange">.</span></h1>
          <p className="mt-2 max-w-[62ch] text-sm leading-6 text-muted">Probe providers, tune the fleet, and manage access.</p>
        </div>

        <nav className="mb-8 flex gap-1 overflow-x-auto border-b border-border" aria-label="Admin sections">
          {tabs.map((t) => (
            <button
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
        {tab === 'providers' && <ProvidersTab />}
        {tab === 'lab' && <LabTab />}
        {tab === 'domains' && <DomainsTab />}
        {tab === 'members' && <MembersTab />}
      </main>
    </ScreenShell>
  )
}
