'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Download, FlaskConical, Play, RefreshCw, Search, Square } from 'lucide-react'
import { playbackRefSchema, type PlaybackRef } from '@consumit/contracts'
import { Button, ConsumitPlayer, EmptyState, Input, Label, LoadingState, SegmentedControl } from '@consumit/ui'
import { getScoutRecipe, inspectProvider, listProviders, listScoutCandidates, type ProviderInspection, type ProviderKind, type ScoutCandidate } from '@/lib/admin-browser'
import { ProviderFrame } from '../shared/provider-frame'
import { downloadAdminReport, inspectionReport } from './admin-report'

type Evidence = { decoded: boolean; startupMs?: number; stalls: number; seeked: boolean; failure?: string }
type Row = { id: string; status: 'queued' | 'running' | 'resolved' | 'failed' | 'stopped'; result?: ProviderInspection; browser?: Evidence }
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

export function ProviderBench({ mode, active, target, onManage }: { mode: 'configured' | 'scout'; active: boolean; target?: { id: string; kind: ProviderKind; version: number } | undefined; onManage: () => void }) {
  const [candidates, setCandidates] = useState<ScoutCandidate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [onlyNew, setOnlyNew] = useState(mode === 'scout')
  const [kind, setKind] = useState<ProviderKind>(target?.kind ?? 'movie')
  const [titleId, setTitleId] = useState(target?.kind === 'anime' ? '178018' : target?.kind === 'series' ? '1399' : '550')
  const [season, setSeason] = useState('1')
  const [episode, setEpisode] = useState('1')
  const [audio, setAudio] = useState(target?.kind === 'anime' ? 'ja' : 'en')
  const [selected, setSelected] = useState<string[]>(target ? [target.id] : [])
  const [rows, setRows] = useState<Row[]>([])
  const [ranRef, setRanRef] = useState<PlaybackRef | null>(null)
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
      const result = mode === 'scout' ? await listScoutCandidates(signal) : await listProviders(signal).then(fleet => ({ candidates: fleet.providers.filter(p => !p.removed && p.role !== 'audio').map(p => ({ id: p.id, mediaKinds: p.mediaKinds as ProviderKind[], regions: p.regions, mediaHosts: p.mediaHosts, upstreamGroup: p.upstreamGroup, configured: true, separateAudio: p.id === 'riveapogee' })) }))
      if (mounted.current) setCandidates(result.candidates)
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
    if (!target) return
    const timer = setTimeout(() => { stop(); setKind(target.kind); setTitleId(target.kind === 'anime' ? '178018' : target.kind === 'series' ? '1399' : '550'); setAudio(target.kind === 'anime' ? 'ja' : 'en'); setSeason('1'); setEpisode('1'); setSelected([target.id]); setPreview(null) }, 0)
    return () => clearTimeout(timer)
  }, [target, stop])
  const updateBrowser = useCallback((id: string, patch: Partial<Evidence>) => setRows(current => current.map(row => row.id === id ? { ...row, browser: { decoded: false, stalls: 0, seeked: false, ...row.browser, ...patch, ...(row.browser?.startupMs !== undefined && patch.startupMs !== undefined ? { startupMs: row.browser.startupMs } : {}) } } : row)), [])
  useEffect(() => {
    if (!preview) return
    const timeout = setTimeout(() => { setPreview(null); setNotice('Browser check ended after 60 seconds. Its evidence stays in the results.') }, 60000)
    return () => clearTimeout(timeout)
  }, [preview])
  function choose(id: string) {
    setSelected(current => current.includes(id) ? current.filter(value => value !== id) : current.length < 3 ? [...current, id] : current)
  }
  function changeKind(value: string) {
    setKind(value as ProviderKind); setSelected([]); setPreview(null)
    setTitleId(value === 'anime' ? '178018' : value === 'series' ? '1399' : '550'); setAudio(value === 'anime' ? 'ja' : 'en')
  }
  async function run(event: FormEvent) {
    event.preventDefault()
    if (running) return
    const parsed = playbackRefSchema.safeParse(kind === 'movie' ? { kind, id: Number(titleId) } : kind === 'series' ? { kind, id: Number(titleId), season: Number(season), episode: Number(episode) } : { kind, id: Number(titleId), episode: Number(episode) })
    if (!parsed.success || !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(audio)) { setError('Enter a valid catalog ID, exact episode, and audio language code (en, ja, hi…).'); return }
    const targets = candidates.filter(p => selected.includes(p.id) && p.mediaKinds.includes(kind))
    if (!targets.length || targets.length > 3) { setError('Choose one to three compatible providers.'); return }
    const current = ++sequence.current; const abort = new AbortController(); controller.current = abort
    setRunning(true); setError(null); setNotice(null); setPreview(null); setRanRef(parsed.data)
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
        setError(cause instanceof Error ? cause.message : 'Inspection failed. Refresh and retry.')
        setRows(previous => previous.map(row => row.id === candidate.id ? { ...row, status: 'failed' } : row))
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
  const visible = candidates.filter(p => p.mediaKinds.includes(kind) && (!onlyNew || !p.configured) && `${p.id} ${p.upstreamGroup}`.toLowerCase().includes(query.toLowerCase()))
  const currentPreview = rows.find(row => row.id === preview)
  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold text-ink">{mode === 'scout' ? 'Provider scout' : 'Playback debugger'}</h2><p className="mt-1 max-w-[70ch] text-xs leading-5 text-muted">{mode === 'scout' ? 'Find promising direct sources in the reviewed adapter catalog. Test before adding them to playback.' : 'Resolve an exact title, inspect validated sources, and check browser playback without writing watch history.'}</p></div><Button variant="ghost" size="sm" onClick={() => void load()} disabled={running || loading}><RefreshCw className="size-3.5" /> Refresh inventory</Button></div>
    <form onSubmit={run} className="space-y-4 border-y border-border bg-surface/40 p-4">
      <fieldset disabled={running} className="flex flex-wrap items-end gap-3"><SegmentedControl legend="Test title kind" name={`${mode}-kind`} value={kind} onValueChange={changeKind} options={kinds} /><div><Label className="text-xs" htmlFor={`${mode}-id`}>{kind === 'anime' ? 'AniList ID' : 'TMDB ID'}</Label><Input id={`${mode}-id`} className="mt-1 w-28" inputMode="numeric" value={titleId} onChange={e => setTitleId(e.target.value)} /></div>{kind === 'series' && <div><Label className="text-xs" htmlFor={`${mode}-season`}>Season</Label><Input id={`${mode}-season`} className="mt-1 w-20" inputMode="numeric" value={season} onChange={e => setSeason(e.target.value)} /></div>}{kind !== 'movie' && <div><Label className="text-xs" htmlFor={`${mode}-episode`}>Episode</Label><Input id={`${mode}-episode`} className="mt-1 w-20" inputMode="numeric" value={episode} onChange={e => setEpisode(e.target.value)} /></div>}<div><Label className="text-xs" htmlFor={`${mode}-audio`}>Audio code</Label><Input id={`${mode}-audio`} className="mt-1 w-20" maxLength={12} value={audio} onChange={e => setAudio(e.target.value)} /></div></fieldset>
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted">{selected.length} / 3 selected · Sequential tests · 15s maximum per provider</p><div className="flex gap-2">{running ? <Button onClick={stop} size="sm" variant="secondary" type="button"><Square className="size-3" /> Stop run</Button> : <Button size="sm" variant="accent" type="submit" disabled={loading || selected.length === 0}><FlaskConical className="size-3.5" /> Run tests</Button>}{rows.length > 0 && <Button size="sm" variant="ghost" type="button" disabled={running} onClick={() => downloadAdminReport('consumit-provider-tests.json', inspectionReport(ranRef, rows))}><Download className="size-3.5" /> Export evidence</Button>}</div></div>
    </form>
    {error && <p className="text-sm text-danger" role="alert">{error}</p>}{notice && <p className="text-xs text-copy" role="status">{notice}</p>}
    <div className="grid min-w-0 gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
      <section aria-label="Test provider selection" className="min-w-0"><div className="mb-3 flex items-center gap-2"><Search className="size-4 shrink-0 text-muted" /><Input aria-label="Search test providers" placeholder="Find a provider" value={query} onChange={e => setQuery(e.target.value)} /></div>{mode === 'scout' && <label className="mb-3 flex items-center gap-2 text-xs text-copy"><input checked={onlyNew} onChange={e => setOnlyNew(e.target.checked)} className="accent-orange" type="checkbox" /> Candidates outside your roster</label>}{loading ? <LoadingState title="Reading reviewed providers" rows={3} /> : visible.length === 0 ? <EmptyState title="No matching candidates" description="Change the title kind, search, or roster filter." /> : <ul className="max-h-[480px] overflow-y-auto divide-y divide-border border-y border-border">{visible.map(candidate => <li key={candidate.id} className={selected.includes(candidate.id) ? 'bg-orange/10' : ''}><label className="flex cursor-pointer items-start gap-3 p-3"><input aria-label={`Select ${candidate.id}`} checked={selected.includes(candidate.id)} disabled={running || selected.length >= 3 && !selected.includes(candidate.id)} onChange={() => choose(candidate.id)} className="mt-1 accent-orange" type="checkbox" /><span className="min-w-0"><span className="block text-sm font-medium text-ink">{candidate.id}</span><span className="mt-1 block text-xs text-muted">{candidate.configured ? 'Configured' : 'Candidate'} · {candidate.regions.join(', ')}</span><span className="mt-1 block break-words text-xs text-muted">Group: {candidate.upstreamGroup}</span></span></label></li>)}</ul>}<p className="mt-3 text-xs leading-5 text-muted">{mode === 'scout' ? 'Candidates stay disabled and isolated. A passing test applies only to this title, language, region and moment.' : 'Audio-only and removed providers are excluded from video tests.'}</p><Button size="sm" variant="ghost" className="mt-2" onClick={onManage}>Manage live providers</Button></section>
      <section aria-label="Inspection results" className="min-w-0">{rows.length === 0 ? <div className="flex min-h-64 items-center border-y border-border"><EmptyState title="Evidence before activation" description="Choose an exact title and up to three providers. Resolution, browser decoding, seeking, and stalls are reported separately." icon={<FlaskConical className="size-5" />} /></div> : <div className="space-y-4"><p className="text-xs text-muted" role="status">{running ? 'Testing selected providers…' : `Run complete · ${rows.filter(row => row.result?.ok).length} / ${rows.length} resolved`} · {ranRef?.kind} {ranRef?.id}{ranRef && 'episode' in ranRef ? ` · Episode ${ranRef.episode}` : ''}</p>{rows.map(row => <article key={row.id} className="rounded-card border border-border bg-surface/40 p-4"><header className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-base font-semibold text-ink">{row.id}</h3><p className={`mt-1 text-xs ${row.status === 'failed' ? 'text-danger' : 'text-muted'}`}>{row.status === 'resolved' ? 'Sources validated' : row.status === 'running' ? 'Resolving…' : row.status === 'queued' ? 'Waiting in queue' : row.status === 'stopped' ? 'Stopped' : row.result?.code ?? 'Request failed'}{row.result ? ` · ${row.result.elapsedMs}ms · ${row.result.region}` : ''}</p></div><div className="flex gap-2">{mode === 'scout' && row.result?.ok && <Button size="sm" variant="ghost" onClick={() => void exportRecipe(row.id)}><Download className="size-3.5" /> Disabled recipe</Button>}{row.result?.preview && !running && <Button size="sm" variant="secondary" onClick={() => { if (preview === row.id) setPreview(null); else if (Date.parse(row.result!.preview!.expiresAt) <= Date.now()) setError('Preview expired. Run the provider test again.'); else { playingStarted.current = performance.now(); setRows(current => current.map(entry => entry.id === row.id ? { ...entry, browser: { decoded: false, stalls: 0, seeked: false } } : entry)); setPreview(row.id) } }}><Play className="size-3.5" />{preview === row.id ? 'Close check' : 'Browser check'}</Button>}</div></header>{row.result && <><p className="mt-3 text-xs leading-5 text-muted">{reasons[row.result.code] ?? 'Inspect this outcome before using the provider.'}{row.result.rejectedSources > 0 ? ` ${row.result.rejectedSources} source(s) rejected.` : ''}</p>{row.result.sources.length > 0 && <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="text-muted">{['Format', 'Quality hint', 'Language', 'Media host', 'Captions'].map(label => <th className="pb-2 pr-3 font-medium" key={label}>{label}</th>)}</tr></thead><tbody>{row.result.sources.map((source, index) => <tr key={index} className="border-t border-border text-copy"><td className="py-2 pr-3 uppercase">{source.type}</td><td className="py-2 pr-3">{source.qualityHint ?? 'Unknown'}</td><td className="py-2 pr-3">{source.language}</td><td className="max-w-64 break-all py-2 pr-3">{source.host}</td><td className="py-2 tabular-nums">{source.subtitleCount}</td></tr>)}</tbody></table></div>}</>}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-xs text-muted"><span>Decode: <span className={row.browser?.decoded ? 'text-lime' : 'text-copy'}>{row.browser?.decoded ? 'First frame confirmed' : row.browser?.failure ? 'Failed' : 'Unchecked'}</span></span><span>Startup: <span className="tabular-nums text-copy">{row.browser?.startupMs !== undefined ? `${row.browser.startupMs}ms` : 'Unchecked'}</span></span><span>Seek: <span className="text-copy">{row.browser?.seeked ? 'Confirmed' : 'Unchecked'}</span></span><span>Stalls observed: <span className="tabular-nums text-copy">{row.browser ? row.browser.stalls : 'Unchecked'}</span></span>{row.browser?.failure && <span className="text-danger">Browser failure: {row.browser.failure}</span>}</div></article>)}</div>}
        {active && currentPreview?.result?.preview && <section aria-label="Direct media browser check" className="mt-5 space-y-3"><div className="flex items-center justify-between gap-3"><h3 className="text-base font-semibold text-ink">Browser check · {currentPreview.id} · {currentPreview.result.preview.delivery === 'relay' ? 'Proxy' : currentPreview.result.preview.delivery === 'embed' ? 'Embed' : 'Direct'}</h3><Button size="sm" variant="ghost" onClick={() => setPreview(null)}>Stop preview</Button></div><p className="text-xs leading-5 text-muted">Direct and Proxy previews use Consumit controls; play and seek to check the actual content. Embed previews use the external player and cannot report decoding, seeking or progress. These checks do not save watch progress.</p>{currentPreview.result.preview.type === 'iframe' ? <div className="flex aspect-video flex-col"><ProviderFrame src={currentPreview.result.preview.src} title={currentPreview.id} frameSandbox={currentPreview.result.preview.frameSandbox} /></div> : <ConsumitPlayer key={`${currentPreview.id}:${currentPreview.result.preview.src}`} title={`${currentPreview.id} · diagnostic preview`} source={{ ...currentPreview.result.preview, type: currentPreview.result.preview.type }} autoPlay muted preload="auto" onLoadedData={event => { if (event.currentTarget.videoWidth > 0) updateBrowser(currentPreview.id, { decoded: true }) }} onSeeked={() => updateBrowser(currentPreview.id, { seeked: true })} onPlaybackEvent={event => { if (event.type === 'started') updateBrowser(currentPreview.id, { decoded: true, startupMs: Math.round(performance.now() - playingStarted.current) }); if (event.type === 'buffer-start') setRows(previous => previous.map(row => row.id === currentPreview.id ? { ...row, browser: { decoded: false, seeked: false, ...row.browser, stalls: (row.browser?.stalls ?? 0) + 1 } } : row)) }} onSourceError={(reason, delivery) => { updateBrowser(currentPreview.id, { failure: delivery ?? reason }); setPreview(null) }} />}</section>}
      </section>
    </div>
  </div>
}
