'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Clock3, Download, FlaskConical, Play, RefreshCw, Search, Square, Waves } from 'lucide-react'
import { playbackRefSchema, type CatalogTitleSummary, type PlaybackRef } from '@consumit/contracts'
import { Button, ConsumitPlayer, EmptyState, Input, Label, LoadingState, SegmentedControl, Select } from '@consumit/ui'
import { browserSearchCatalog } from '@/lib/catalog-browser'
import { AdminApiError, getScoutRecipe, inspectProvider, listProviders, listScoutCandidates, type ProviderInspection, type ProviderKind, type ScoutCandidate } from '@/lib/admin-browser'
import { ProviderFrame } from '../shared/provider-frame'
import { downloadAdminReport, inspectionReport } from './admin-report'

type Evidence = { decoded: boolean; startupMs?: number; stalls: number; seeked: boolean; failure?: string }
type Row = { id: string; status: 'queued' | 'running' | 'resolved' | 'failed' | 'stopped'; result?: ProviderInspection; requestError?: string; browser?: Evidence }
type ResultFilter = 'all' | 'resolved' | 'empty' | 'error'
type DeliveryFilter = 'all' | 'direct' | 'relay' | 'embed'
const kinds = [{ value: 'movie', label: 'Movie' }, { value: 'series', label: 'Series' }, { value: 'anime', label: 'Anime' }]
const reasons: Record<string, string> = {
  resolved: 'Validated media sources found. Check decoding and seeking below.',
  invalid_sources: 'Sources were rejected by the direct-media allowlist, expiry, credential or format checks.',
  empty: 'No eligible source for this title and language. Try another exact title.',
  timeout: 'The adapter did not finish within 15 seconds. Wait before retrying.',
  malformed: 'The upstream response no longer matches this adapter.',
  unavailable: 'The upstream is unavailable or could not return direct media.',
  proxy_unavailable: 'Sources resolved, but Proxy delivery needs an approved Worker, matching media hosts and an eligible HLS/native source. Review its approval before retrying.',
  cancelled: 'The request was cancelled.', error: 'Resolution failed. Try another title or provider.',
}
type TestTitle = { kind: ProviderKind; id: number; title: string; year: number | null; example?: boolean }
const sampleTitles: Record<ProviderKind, TestTitle> = {
  movie: { kind: 'movie', id: 550, title: 'Fight Club', year: 1999, example: true },
  series: { kind: 'series', id: 1399, title: 'Game of Thrones', year: 2011, example: true },
  anime: { kind: 'anime', id: 178018, title: 'One Piece', year: null, example: true },
}
const quickTitles: Record<ProviderKind, TestTitle[]> = {
  movie: [
    sampleTitles.movie,
    { kind: 'movie', id: 27205, title: 'Inception', year: 2010, example: true },
    { kind: 'movie', id: 299534, title: 'Avengers: Endgame', year: 2019, example: true },
    { kind: 'movie', id: 603, title: 'The Matrix', year: 1999, example: true },
  ],
  series: [
    { kind: 'series', id: 1396, title: 'Breaking Bad', year: 2008, example: true },
    sampleTitles.series,
  ],
  anime: [sampleTitles.anime],
}

function Metric({ label, value, detail, tone, icon }: { label: string; value: string; detail: string; tone: 'positive' | 'info' | 'warning' | 'danger'; icon: ReactNode }) {
  const tones = {
    positive: 'border-lime/25 bg-lime/5',
    info: 'border-lilac/25 bg-lilac/5',
    warning: 'border-orange/25 bg-orange/5',
    danger: 'border-danger/25 bg-danger/5',
  }
  return <div className={`min-w-0 rounded-control border px-3 py-2.5 ${tones[tone]}`}>
    <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-copy"><span aria-hidden="true">{icon}</span><span className="truncate">{label}</span></div>
    <div className="mt-1 flex items-baseline gap-2"><span className="text-lg font-semibold tabular-nums text-ink">{value}</span><span className="truncate text-[11px] text-muted">{detail}</span></div>
  </div>
}

function deliveryName(value: DeliveryFilter | ProviderInspection['delivery'] | undefined) {
  if (value === 'relay') return 'Proxy'
  if (value === 'direct') return 'Direct'
  if (value === 'embed') return 'Embed'
  return null
}
function testTitleFromSummary(title: CatalogTitleSummary): TestTitle {
  return { kind: title.kind, id: title.id, title: title.title, year: title.year }
}

export function ProviderBench({ mode, active, target, onManage }: { mode: 'configured' | 'scout'; active: boolean; target?: { id: string; kind: ProviderKind; version: number } | undefined; onManage: () => void }) {
  const [candidates, setCandidates] = useState<ScoutCandidate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [providerQuery, setProviderQuery] = useState('')
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all')
  const [deliveryFilter, setDeliveryFilter] = useState<DeliveryFilter>('all')
  const [titleQuery, setTitleQuery] = useState('')
  const [titleResults, setTitleResults] = useState<CatalogTitleSummary[]>([])
  const [titleLoading, setTitleLoading] = useState(false)
  const [titleError, setTitleError] = useState<string | null>(null)
  const [onlyNew, setOnlyNew] = useState(mode === 'scout')
  const [kind, setKind] = useState<ProviderKind>(target?.kind ?? 'movie')
  const [selectedTitle, setSelectedTitle] = useState<TestTitle | null>(sampleTitles[target?.kind ?? 'movie'])
  const [season, setSeason] = useState('1')
  const [episode, setEpisode] = useState('1')
  const [audio, setAudio] = useState(target?.kind === 'anime' ? 'ja' : 'en')
  const [selected, setSelected] = useState<string[]>(target ? [target.id] : [])
  const [rows, setRows] = useState<Row[]>([])
  const [ranRef, setRanRef] = useState<PlaybackRef | null>(null)
  const [ranTitle, setRanTitle] = useState<TestTitle | null>(null)
  const [running, setRunning] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const sequence = useRef(0)
  const controller = useRef<AbortController | null>(null)
  const mounted = useRef(true)
  const playingStarted = useRef(0)
  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const signal = AbortSignal.timeout(10000)
      if (mode === 'scout') {
        const result = await listScoutCandidates(signal)
        if (mounted.current) setCandidates(result.candidates)
      } else {
        const fleet = await listProviders(signal)
        if (mounted.current) {
          setCandidates(fleet.providers.filter(p => !p.removed && p.role !== 'audio').map(p => ({ id: p.id, mediaKinds: p.mediaKinds as ProviderKind[], regions: p.regions, mediaHosts: p.mediaHosts, upstreamGroup: p.upstreamGroup, configured: true, separateAudio: p.id === 'riveapogee' })))
        }
      }
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : 'Provider inventory unavailable. Refresh to retry.') }
    finally { if (mounted.current) setLoading(false) }
  }, [mode])
  useEffect(() => {
    mounted.current = true
    const runSequence = sequence; const runController = controller
    const initial = setTimeout(() => void load(), 0)
    return () => { mounted.current = false; clearTimeout(initial); runSequence.current++; runController.current?.abort() }
  }, [load])
  const stop = useCallback(() => {
    sequence.current++; controller.current?.abort(); controller.current = null; setRunning(false)
    setRows(current => current.map(row => row.status === 'running' || row.status === 'queued' ? { ...row, status: 'stopped' } : row))
  }, [])
  useEffect(() => {
    if (active) return
    const timer = setTimeout(() => { stop(); setPreview(null) }, 0)
    return () => clearTimeout(timer)
  }, [active, stop])
  useEffect(() => {
    const query = titleQuery.trim()
    if (query.length < 2) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setTitleLoading(true)
      setTitleError(null)
      void browserSearchCatalog(query, kind, controller.signal)
        .then(page => { if (!controller.signal.aborted) setTitleResults(page.items.filter(item => item.kind === kind)) })
        .catch(cause => { if (!controller.signal.aborted) setTitleError(cause instanceof Error ? cause.message : 'Catalog search failed. Try again.') })
        .finally(() => { if (!controller.signal.aborted) setTitleLoading(false) })
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [titleQuery, kind])
  useEffect(() => {
    if (!target) return
    const timer = setTimeout(() => { stop(); setKind(target.kind); setTitleQuery(''); setTitleResults([]); setTitleLoading(false); setTitleError(null); setSelectedTitle(sampleTitles[target.kind]); setAudio(target.kind === 'anime' ? 'ja' : 'en'); setSeason('1'); setEpisode('1'); setSelected([target.id]); setPreview(null) }, 0)
    return () => clearTimeout(timer)
  }, [target, stop])
  const updateBrowser = useCallback((id: string, patch: Partial<Evidence>) => setRows(current => current.map(row => row.id === id ? { ...row, browser: { decoded: false, stalls: 0, seeked: false, ...row.browser, ...patch, ...(row.browser?.startupMs !== undefined && patch.startupMs !== undefined ? { startupMs: row.browser.startupMs } : {}) } } : row)), [])
  useEffect(() => {
    if (!preview) return
    const timeout = setTimeout(() => { setPreview(null); setNotice('Browser check ended after 60 seconds. Its evidence stays in the results.') }, 60000)
    return () => clearTimeout(timeout)
  }, [preview])
  function choose(id: string) {
    setSelected(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id])
  }
  function changeKind(value: string) {
    const nextKind = value as ProviderKind
    setKind(nextKind); setSelected([]); setPreview(null); setTitleQuery(''); setTitleResults([]); setTitleLoading(false); setTitleError(null); setSelectedTitle(sampleTitles[nextKind]); setSeason('1'); setEpisode('1')
    setAudio(nextKind === 'anime' ? 'ja' : 'en')
  }
  const visible = candidates.filter(p => p.mediaKinds.includes(kind) && (!onlyNew || !p.configured) && `${p.id} ${p.upstreamGroup}`.toLowerCase().includes(providerQuery.toLowerCase()))
  function toggleAllVisible() {
    const visibleIds = new Set(visible.map(candidate => candidate.id))
    const allSelected = visible.length > 0 && visible.every(candidate => selected.includes(candidate.id))
    setSelected(current => allSelected ? current.filter(id => !visibleIds.has(id)) : [...new Set([...current, ...visibleIds])])
  }
  async function run(event: FormEvent) {
    event.preventDefault()
    await execute(selected)
  }
  async function execute(providerIds: string[]) {
    if (running) return
    if (!selectedTitle || selectedTitle.kind !== kind) { setError('Choose a title from the catalog or use the sample title.'); return }
    const parsed = playbackRefSchema.safeParse(kind === 'movie' ? { kind, id: selectedTitle.id } : kind === 'series' ? { kind, id: selectedTitle.id, season: Number(season), episode: Number(episode) } : { kind, id: selectedTitle.id, episode: Number(episode) })
    if (!parsed.success || !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(audio)) { setError('Choose a valid exact episode and audio language code (en, ja, hi…).'); return }
    const targets = candidates.filter(p => providerIds.includes(p.id) && p.mediaKinds.includes(kind))
    if (!targets.length) { setError('Choose at least one compatible provider.'); return }
    const current = ++sequence.current; const abort = new AbortController(); controller.current = abort
    setRunning(true); setError(null); setNotice(null); setPreview(null); setRanRef(parsed.data); setRanTitle(selectedTitle)
    setRows(targets.map(p => ({ id: p.id, status: 'queued' })))
    for (const candidate of targets) {
      if (sequence.current !== current) return
      setRows(previous => previous.map(row => row.id === candidate.id ? { ...row, status: 'running' } : row))
      const timeout = setTimeout(() => abort.abort(), 18000)
      try {
        const result = await inspectProvider(candidate.id, parsed.data, audio, mode, abort.signal)
        if (sequence.current !== current) return
        setRows(previous => previous.map(row => row.id === candidate.id ? { ...row, status: result.ok ? 'resolved' : 'failed', result } : row))
      } catch (cause) {
        if (sequence.current !== current) return
        const detail = cause instanceof Error ? cause.message.trim() : ''
        const message = detail || (cause instanceof AdminApiError ? `Request rejected (HTTP ${cause.status}, ${cause.code}).` : 'Request failed before the server returned a result.')
        setError(message)
        setRows(previous => previous.map(row => row.id === candidate.id ? { ...row, status: 'failed', requestError: message } : row))
        if (abort.signal.aborted) { stop(); return }
      } finally { clearTimeout(timeout) }
    }
    if (sequence.current === current) { setRunning(false); controller.current = null }
  }
  async function exportRecipe(id: string) {
    setError(null)
    try { const result = await getScoutRecipe(id); downloadAdminReport(`consumit-provider-${id}.json`, result.recipe); setNotice('Disabled recipe downloaded. Review it in the base provider configuration before installing it.') }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Recipe unavailable. Retry.') }
  }
  const currentPreview = rows.find(row => row.id === preview)
  const completedCount = rows.filter(row => row.status === 'resolved' || row.status === 'failed' || row.status === 'stopped').length
  const resultCounts = {
    resolved: rows.filter(row => row.result?.ok).length,
    streams: rows.reduce((total, row) => total + (row.result?.sources.length ?? 0), 0),
    empty: rows.filter(row => row.result?.code === 'empty').length,
    errors: rows.filter(row => Boolean(row.requestError) || (row.status === 'failed' && row.result?.code !== 'empty')).length,
  }
  const filteredRows = rows.filter(row => {
    const candidate = candidates.find(entry => entry.id === row.id)
    if (!(row.id + ' ' + (candidate?.upstreamGroup ?? '')).toLowerCase().includes(providerQuery.trim().toLowerCase())) return false
    const delivery = row.result?.delivery ?? row.result?.preview?.delivery ?? 'all'
    if (deliveryFilter !== 'all' && delivery !== deliveryFilter) return false
    if (resultFilter === 'resolved') return Boolean(row.result?.ok)
    if (resultFilter === 'empty') return row.result?.code === 'empty'
    if (resultFilter === 'error') return Boolean(row.requestError) || (row.status === 'failed' && row.result?.code !== 'empty')
    return true
  })
  const resultOptions: { value: ResultFilter; label: string }[] = [
    { value: 'all', label: `All results (${rows.length})` },
    { value: 'resolved', label: `Sources found (${resultCounts.resolved})` },
    { value: 'empty', label: `Empty (${resultCounts.empty})` },
    { value: 'error', label: `Error (${resultCounts.errors})` },
  ]
  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-semibold text-ink">{mode === 'scout' ? 'Reviewed candidates' : 'Configured providers'}</h3><p className="mt-1 max-w-[70ch] text-xs leading-5 text-muted">{mode === 'scout' ? 'Test reviewed recipes in isolation. A passing sample never installs or enables a candidate.' : 'Check a configured provider against an exact title without writing watch progress or history.'}</p></div><Button variant="ghost" size="sm" onClick={() => void load()} disabled={running || loading}><RefreshCw className="size-3.5" /> Refresh inventory</Button></div>
    <form onSubmit={run} className="space-y-4 rounded-card border border-border bg-surface/40 p-4 sm:p-5">
      <fieldset disabled={running} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="text-sm font-semibold uppercase tracking-wide text-copy">Target media for resolution</h4><p className="mt-1 text-xs text-muted">Choose an exact catalog title and episode before checking providers.</p></div><SegmentedControl legend="Test title kind" name={`${mode}-kind`} value={kind} onValueChange={changeKind} options={kinds} /></div>
        <div aria-label="Sample titles" className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">{quickTitles[kind].map(title => <button aria-pressed={selectedTitle?.id === title.id && selectedTitle?.kind === title.kind} className={`min-h-14 rounded-control border px-3 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-orange ${selectedTitle?.id === title.id && selectedTitle?.kind === title.kind ? 'border-orange bg-orange/10' : 'border-border bg-canvas/50 hover:bg-surface'}`} key={`${title.kind}:${title.id}`} onClick={() => { setSelectedTitle(title); setTitleQuery(''); setTitleResults([]); setTitleError(null) }} type="button"><span className="block truncate text-sm font-semibold text-ink">{title.title}</span><span className="mt-1 block truncate text-[11px] text-muted">{title.kind === 'anime' ? 'AniList' : 'TMDB'}: {title.id} · {title.year ?? 'Year unknown'}</span></button>)}</div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><div className="min-w-64 flex-1"><Label className="text-xs" htmlFor={`${mode}-title-search`}>Search the catalog</Label><div className="relative mt-1"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" /><Input id={`${mode}-title-search`} className="pl-9" autoComplete="off" value={titleQuery} onChange={event => { setTitleQuery(event.target.value); setTitleResults([]); setTitleLoading(false); setTitleError(null); setSelectedTitle(null) }} placeholder={`Find a ${kind === 'movie' ? 'movie' : kind === 'series' ? 'series' : 'anime'} by title`} type="search" /></div></div><div><Label className="text-xs" htmlFor={`${mode}-audio`}>Audio language code</Label><Input id={`${mode}-audio`} className="mt-1 w-full sm:w-32" maxLength={12} value={audio} onChange={event => setAudio(event.target.value)} /></div></div>
        {titleQuery.trim().length > 0 && titleQuery.trim().length < 2 && <p className="text-xs text-muted" role="status">Type at least two characters to search.</p>}
        {titleLoading && <p className="text-xs text-muted" role="status">Searching {kind === 'anime' ? 'AniList' : 'the catalog'}…</p>}
        {titleError && <p className="text-xs text-danger" role="alert">{titleError}</p>}
        {titleQuery.trim().length >= 2 && !titleLoading && !titleError && titleResults.length === 0 && <p className="text-xs text-muted" role="status">No matching titles. Try another search or use the sample title.</p>}
        {titleResults.length > 0 && <ul aria-label="Catalog search results" className="max-h-44 divide-y divide-border overflow-y-auto rounded-control border border-border bg-canvas">{titleResults.map(title => <li key={`${title.kind}:${title.id}`}><button aria-pressed={selectedTitle?.id === title.id && selectedTitle?.kind === title.kind} className="flex min-h-11 w-full items-center justify-between gap-4 px-3 py-2 text-left text-sm text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange" onClick={() => { setSelectedTitle(testTitleFromSummary(title)); setTitleQuery(''); setTitleResults([]) }} type="button"><span className="min-w-0 truncate">{title.title}</span><span className="shrink-0 text-xs text-muted">{title.year ?? 'Year unknown'} · {title.kind === 'anime' ? 'AniList' : 'TMDB'} {title.id}</span></button></li>)}</ul>}
        <div className="grid gap-2 rounded-control border border-border bg-canvas/45 p-3 sm:grid-cols-3"><div className="min-w-0"><span className="block text-[11px] text-muted">Title</span><span className="block truncate text-sm font-medium text-ink">{selectedTitle?.title ?? 'Choose a catalog result'}</span><span className="sr-only">{selectedTitle ? `${selectedTitle.title} · ${selectedTitle.kind === 'anime' ? 'AniList' : 'TMDB'} ${selectedTitle.id}` : ''}</span>{selectedTitle?.example && <span className="mt-1 inline-flex rounded-sm border border-border px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-muted">Sample title</span>}</div><div><span className="block text-[11px] text-muted">{kind === 'anime' ? 'AniList ID' : 'TMDB ID'}</span><span className="text-sm font-medium tabular-nums text-ink">{selectedTitle?.id ?? '—'}</span></div><div><span className="block text-[11px] text-muted">Release year</span><span className="text-sm font-medium tabular-nums text-ink">{selectedTitle?.year ?? 'Unknown'}</span></div></div>
        {!selectedTitle?.example && <Button size="sm" variant="ghost" type="button" onClick={() => { setSelectedTitle(sampleTitles[kind]); setTitleQuery(''); setTitleResults([]) }}>Use sample title</Button>}
        {(kind === 'series' || kind === 'anime') && <div className="flex flex-wrap items-end gap-3">{kind === 'series' && <div><Label className="text-xs" htmlFor={`${mode}-season`}>Season</Label><Input id={`${mode}-season`} className="mt-1 w-24" inputMode="numeric" min="1" type="number" value={season} onChange={event => setSeason(event.target.value)} /></div>}<div><Label className="text-xs" htmlFor={`${mode}-episode`}>{kind === 'anime' ? 'Canonical episode' : 'Episode'}</Label><Input id={`${mode}-episode`} className="mt-1 w-24" inputMode="numeric" min="1" type="number" value={episode} onChange={event => setEpisode(event.target.value)} /></div></div>}
      </fieldset>
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted" role="status" aria-live="polite">{selected.length} selected · Sequential tests · up to 15s per provider{running ? ` · ${completedCount} / ${rows.length} complete` : ''}</p><div className="flex gap-2">{running ? <Button onClick={stop} size="sm" variant="secondary" type="button"><Square className="size-3" /> Stop run</Button> : <Button size="sm" variant="accent" type="submit" disabled={loading || titleLoading || !selectedTitle || selected.length === 0}><FlaskConical className="size-3.5" /> Run tests</Button>}{rows.length > 0 && <Button size="sm" variant="ghost" type="button" disabled={running} onClick={() => downloadAdminReport('consumit-provider-tests.json', inspectionReport(ranRef, rows))}><Download className="size-3.5" /> Export evidence</Button>}</div></div>
    </form>
    {error && <p className="text-sm text-danger" role="alert">{error}</p>}{notice && <p className="text-xs text-copy" role="status">{notice}</p>}
    <section aria-label="Provider test summary" className="grid grid-cols-2 gap-2 xl:grid-cols-4">
      <Metric label="Sources validated" value={`${resultCounts.resolved} / ${rows.length}`} detail="checks" tone="positive" icon={<CheckCircle2 className="size-3.5" />} />
      <Metric label="Streams extracted" value={String(resultCounts.streams)} detail="sources" tone="info" icon={<Waves className="size-3.5" />} />
      <Metric label="No sources" value={String(resultCounts.empty)} detail="empty results" tone="warning" icon={<Clock3 className="size-3.5" />} />
      <Metric label="Failed / timeout" value={String(resultCounts.errors)} detail="provider or request errors" tone="danger" icon={<AlertCircle className="size-3.5" />} />
    </section>
    <div className="grid min-w-0 gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
      <section aria-label="Test provider selection" className="min-w-0"><div className="mb-3 flex items-center gap-2"><Search className="size-4 shrink-0 text-muted" /><Input aria-label="Search test providers" placeholder="Find a provider" value={providerQuery} onChange={event => setProviderQuery(event.target.value)} /></div>{mode === 'scout' && <label className="mb-3 flex items-center gap-2 text-xs text-copy"><input checked={onlyNew} onChange={event => setOnlyNew(event.target.checked)} className="accent-orange" type="checkbox" /> Candidates outside your roster</label>}{!loading && visible.length > 0 && <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted">{visible.length} compatible · {visible.filter(candidate => selected.includes(candidate.id)).length} selected here</p><div className="flex gap-1"><Button size="sm" variant="ghost" disabled={running} onClick={toggleAllVisible}>{visible.every(candidate => selected.includes(candidate.id)) ? 'Clear shown' : 'Select all shown'}</Button>{selected.length > 0 && <Button size="sm" variant="ghost" disabled={running} onClick={() => setSelected([])}>Clear selection</Button>}</div></div>}{loading ? <LoadingState title="Reading reviewed providers" rows={3} /> : visible.length === 0 ? <EmptyState title="No matching providers" description="Change the title kind, provider search, or Scout filter." /> : <ul className="max-h-[480px] overflow-y-auto divide-y divide-border border-y border-border">{visible.map(candidate => <li key={candidate.id} className={selected.includes(candidate.id) ? 'bg-orange/10' : ''}><label className="flex cursor-pointer items-start gap-3 p-3"><input aria-label={`Select ${candidate.id}`} checked={selected.includes(candidate.id)} disabled={running} onChange={() => choose(candidate.id)} className="mt-1 accent-orange" type="checkbox" /><span className="min-w-0"><span className="block text-sm font-medium text-ink">{candidate.id}</span><span className="mt-1 block text-xs text-muted">{candidate.configured ? 'Configured' : 'Candidate'} · {candidate.regions.join(', ')}</span><span className="mt-1 block break-words text-xs text-muted">Group: {candidate.upstreamGroup}</span></span></label></li>)}</ul>}<p className="mt-3 text-xs leading-5 text-muted">{mode === 'scout' ? 'Candidates stay disabled and isolated. A passing test applies only to this title, language, region and moment.' : 'Audio-only and removed providers are excluded from video tests.'}</p><Button size="sm" variant="ghost" className="mt-2" onClick={onManage}>Manage live providers</Button></section>
      <section aria-label="Inspection results" className="min-w-0">{rows.length === 0 ? <div className="flex min-h-64 items-center border-y border-border"><EmptyState title="Evidence before activation" description="Choose an exact title and compatible providers. Resolution, browser decoding, seeking, and stalls are reported separately." icon={<FlaskConical className="size-5" />} /></div> : <div className="grid grid-cols-1 gap-3 xl:grid-cols-2"><div className="col-span-full flex flex-wrap items-center justify-between gap-3 border-y border-border py-2"><div className="flex flex-wrap gap-1" aria-label="Filter provider results">{resultOptions.map(option => <button aria-pressed={resultFilter === option.value} className={'min-h-9 rounded-control px-3 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-orange ' + (resultFilter === option.value ? 'bg-orange/10 text-orange' : 'text-muted hover:bg-surface hover:text-ink')} key={option.value} onClick={() => setResultFilter(option.value)} type="button">{option.label}</button>)}</div><Select label="Delivery" onValueChange={value => setDeliveryFilter(value as DeliveryFilter)} options={[{ value: 'all', label: 'All delivery' }, { value: 'direct', label: 'Direct' }, { value: 'relay', label: 'Proxy' }, { value: 'embed', label: 'Embed' }]} value={deliveryFilter} /></div><p className="col-span-full text-xs text-muted" role="status">{running ? 'Testing selected providers…' : `Run complete · ${rows.filter(row => row.result?.ok).length} / ${rows.length} resolved`} · {ranTitle?.title ?? ranRef?.kind} · {ranRef?.kind === 'anime' ? 'AniList' : 'TMDB'} {ranRef?.id}{ranRef && 'episode' in ranRef ? ` · Episode ${ranRef.episode}` : ''}{ranRef && 'season' in ranRef ? ` · Season ${ranRef.season}` : ''}</p>{filteredRows.map(row => <article key={row.id} className="rounded-card border border-border bg-surface/40 p-4"><header className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-base font-semibold text-ink">{row.id}</h3><p className={`mt-1 text-xs ${row.status === 'failed' ? 'text-danger' : 'text-muted'}`}>{row.status === 'resolved' ? 'Sources validated' : row.status === 'running' ? 'Resolving…' : row.status === 'queued' ? 'Waiting in queue' : row.status === 'stopped' ? 'Stopped' : row.result?.code || row.requestError?.trim() || 'Request failed'}{row.result ? ` · ${row.result.elapsedMs}ms · ${row.result.region}` : ''}</p></div><div className="flex gap-2"><Button size="sm" variant="secondary" disabled={running || loading} onClick={() => void execute([row.id])} type="button">Test</Button>{row.result?.delivery && <span className="self-center rounded-sm border border-border px-2 py-1 text-[11px] uppercase tracking-wide text-muted">{deliveryName(row.result.delivery)}</span>}{mode === 'scout' && row.result?.ok && <Button size="sm" variant="ghost" onClick={() => void exportRecipe(row.id)}><Download className="size-3.5" /> Disabled recipe</Button>}{row.result?.preview && !running && <Button size="sm" variant="secondary" onClick={() => { if (preview === row.id) setPreview(null); else if (Date.parse(row.result!.preview!.expiresAt) <= Date.now()) setError('Preview expired. Run the provider test again.'); else { playingStarted.current = performance.now(); setRows(current => current.map(entry => entry.id === row.id ? { ...entry, browser: { decoded: false, stalls: 0, seeked: false } } : entry)); setPreview(row.id) } }}><Play className="size-3.5" />{preview === row.id ? 'Close check' : 'Browser check'}</Button>}</div></header>{row.result && <><p className="mt-3 text-xs leading-5 text-muted">{reasons[row.result.code] ?? 'Inspect this outcome before using the provider.'}{row.result.rejectedSources > 0 ? ` ${row.result.rejectedSources} source(s) rejected.` : ''}</p>{row.result.sources.length > 0 && <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="text-muted">{['Format', 'Quality hint', 'Language', 'Media host', 'Captions'].map(label => <th className="pb-2 pr-3 font-medium" key={label}>{label}</th>)}</tr></thead><tbody>{row.result.sources.map((source, index) => <tr key={index} className="border-t border-border text-copy"><td className="py-2 pr-3 uppercase">{source.type}</td><td className="py-2 pr-3">{source.qualityHint ?? 'Unknown'}</td><td className="py-2 pr-3">{source.language}</td><td className="max-w-64 break-all py-2 pr-3">{source.host}</td><td className="py-2 tabular-nums">{source.subtitleCount}</td></tr>)}</tbody></table></div>}</>}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-xs text-muted"><span>Decode: <span className={row.browser?.decoded ? 'text-lime' : 'text-copy'}>{row.browser?.decoded ? 'First frame confirmed' : row.browser?.failure ? 'Failed' : 'Unchecked'}</span></span><span>Startup: <span className="tabular-nums text-copy">{row.browser?.startupMs !== undefined ? `${row.browser.startupMs}ms` : 'Unchecked'}</span></span><span>Seek: <span className="text-copy">{row.browser?.seeked ? 'Confirmed' : 'Unchecked'}</span></span><span>Stalls observed: <span className="tabular-nums text-copy">{row.browser ? row.browser.stalls : 'Unchecked'}</span></span>{row.browser?.failure && <span className="text-danger">Browser failure: {row.browser.failure}</span>}</div></article>)}</div>}
        {active && currentPreview?.result?.preview && <section aria-label="Direct media browser check" className="mt-5 space-y-3"><div className="flex items-center justify-between gap-3"><h3 className="text-base font-semibold text-ink">Browser check · {currentPreview.id} · {currentPreview.result.preview.delivery === 'relay' ? 'Proxy' : currentPreview.result.preview.delivery === 'embed' ? 'Embed' : 'Direct'}</h3><Button size="sm" variant="ghost" onClick={() => setPreview(null)}>Stop preview</Button></div><p className="text-xs leading-5 text-muted">Direct and Proxy previews use Consumit controls; play and seek to check the actual content. Embed previews use the external player and cannot report decoding, seeking or progress. These checks do not save watch progress.</p>{currentPreview.result.preview.type === 'iframe' ? <div className="flex aspect-video flex-col"><ProviderFrame src={currentPreview.result.preview.src} title={currentPreview.id} /></div> : <ConsumitPlayer key={`${currentPreview.id}:${currentPreview.result.preview.src}`} title={`${currentPreview.id} · diagnostic preview`} media={{ source: { ...currentPreview.result.preview, type: currentPreview.result.preview.type }, autoPlay: true, muted: true, preload: 'auto' }} onMediaObservation={observation => { if (observation.type === 'playing' && observation.videoWidth > 0) updateBrowser(currentPreview.id, { decoded: true }); if (observation.type === 'seeked') updateBrowser(currentPreview.id, { seeked: true }) }} onPlaybackEvent={event => { if (event.type === 'started') updateBrowser(currentPreview.id, { startupMs: Math.round(performance.now() - playingStarted.current) }); if (event.type === 'buffer-start') setRows(previous => previous.map(row => row.id === currentPreview.id ? { ...row, browser: { decoded: false, seeked: false, ...row.browser, stalls: (row.browser?.stalls ?? 0) + 1 } } : row)) }} onSourceError={(reason, delivery) => { updateBrowser(currentPreview.id, { failure: delivery ?? reason }); setPreview(null) }} />}</section>}
      </section>
    </div>
  </div>
}
