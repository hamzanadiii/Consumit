'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, EmptyState, Input, LoadingState, SectionHeading, Select } from '@consumit/ui'
import { deleteProvider, getProviderConfig, listProviders, resetProviderConfig, restoreProvider, updateProviderConfig, type AdminProvider, type ProviderOverridePatch, type ProviderReadinessSummary } from '@/lib/admin-browser'
import { ProviderControlSummary, ProviderOrderEditor } from './admin-screen'

export function ProvidersTab() {
  const [providers, setProviders] = useState<AdminProvider[]>([])
  const [readiness, setReadiness] = useState<ProviderReadinessSummary | null>(null)
  const [overrides, setOverrides] = useState<Record<string, ProviderOverridePatch>>({})
  const [drafts, setDrafts] = useState<Record<string, ProviderOverridePatch>>({})
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState('all')
  const [status, setStatus] = useState('active')
  const requestSequence = useRef(0)
  const mutation = useRef(false)
  const refresh = useCallback(async () => {
    const sequence = ++requestSequence.current
    try {
      const [fleet, config] = await Promise.all([listProviders(), getProviderConfig()])
      if (sequence !== requestSequence.current) return
      setProviders(fleet.providers); setReadiness(fleet.readiness); setOverrides(config.overrides); setError(null)
    } catch (cause) {
      if (sequence === requestSequence.current) setError(cause instanceof Error ? cause.message : 'Provider settings could not be loaded. Try Refresh.')
    } finally { if (sequence === requestSequence.current) setLoading(false) }
  }, [])
  useEffect(() => {
    const sequence = requestSequence
    const initial = setTimeout(() => void refresh(), 0)
    return () => { clearTimeout(initial); sequence.current++ }
  }, [refresh])

  function patch(id: string, next: ProviderOverridePatch) {
    setDrafts((previous) => ({ ...previous, [id]: { ...previous[id], ...next } }))
    setNotice(null)
  }
  async function run(provider: AdminProvider, action: 'save' | 'reset' | 'delete' | 'restore') {
    if (mutation.current) return
    mutation.current = true; setSaving(provider.id); setError(null); setNotice(null)
    try {
      if (action === 'save') await updateProviderConfig(provider.id, drafts[provider.id] ?? {})
      else if (action === 'reset') await resetProviderConfig(provider.id)
      else if (action === 'delete') await deleteProvider(provider.id)
      else await restoreProvider(provider.id)
      setDrafts((previous) => { const next = { ...previous }; delete next[provider.id]; return next })
      setConfirmDelete(null)
      setNotice(action === 'restore' ? `${provider.id} restored and turned off. Enable it when ready.` : action === 'delete' ? `${provider.id} deleted from playback. You can restore it using the Deleted filter.` : `${provider.id} settings ${action === 'reset' ? 'reset to configuration defaults' : 'saved'}.`)
      await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The provider change was not saved. Try again.') }
    finally { mutation.current = false; setSaving(null) }
  }
  const visible = providers.filter((p) => (status === 'deleted' ? p.removed : !p.removed && (status === 'active' || (status === 'enabled' ? p.enabled : !p.enabled)))
    && (kind === 'all' || p.mediaKinds.includes(kind)) && `${p.id} ${p.upstreamGroup} ${p.regions.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase()))
  const orderSignature = providers.filter((p) => !p.removed).map((p) => p.id).join('|')

  if (loading) return <LoadingState title="Loading providers" rows={4} />
  return <div className="space-y-6">
    <SectionHeading title="The fleet." description="Control playback availability and request limits. Delete a provider to remove it from new playback attempts; restore it whenever needed." action={<Button disabled={saving !== null} onClick={() => void refresh()} size="sm" variant="secondary">Refresh</Button>} />
    {error && <p className="text-sm text-danger" role="alert">{error}</p>}
    {notice && <p className="text-sm text-ink" role="status">{notice}</p>}
    {readiness && <ProviderControlSummary readiness={readiness} />}
    <div className="flex flex-wrap items-end gap-4">
      <div className="min-w-48 flex-1"><label className="mb-2 block text-sm text-copy" htmlFor="provider-search">Search providers</label><Input id="provider-search" onChange={(event) => setQuery(event.target.value)} placeholder="Name, group, or region" type="search" value={query} /></div>
      <Select label="Provider kind" onValueChange={setKind} options={[{ value: 'all', label: 'All kinds' }, { value: 'movie', label: 'Movies' }, { value: 'series', label: 'Series' }, { value: 'anime', label: 'Anime' }]} value={kind} />
      <Select label="Provider status" onValueChange={setStatus} options={[{ value: 'active', label: 'Configured' }, { value: 'enabled', label: 'Enabled' }, { value: 'disabled', label: 'Disabled' }, { value: 'deleted', label: 'Deleted' }]} value={status} />
    </div>
    <p className="text-sm text-muted" role="status">{visible.length} providers shown{Object.keys(drafts).length ? ` · ${Object.keys(drafts).length} unsaved changes` : ''}</p>
    {visible.length === 0 ? <EmptyState title="No matching providers." description="Change the filters or refresh the fleet." /> : <div className="overflow-x-auto rounded-card border border-border bg-surface"><table className="w-full min-w-[1000px] text-left text-sm"><caption className="sr-only">Provider settings and deletion controls</caption><thead><tr className="border-b border-border text-xs text-muted">{['Provider', 'Enabled', 'Regions', 'Requests / min', 'Concurrent', 'Actions'].map((heading) => <th className="px-3 py-4" key={heading} scope="col">{heading}</th>)}</tr></thead><tbody>{visible.map((p) => {
      const eff = { ...p, ...drafts[p.id] }
      const hasOverride = Object.keys(overrides[p.id] ?? {}).some((key) => key !== 'order' && key !== 'removed')
      const disabled = saving !== null || Boolean(p.removed)
      return <tr className="border-b border-border/50 last:border-0" key={p.id}>
        <th className="px-3 py-4 text-left font-normal" scope="row"><span className="font-mono text-xs text-ink">{p.id}</span><span className="mt-1 block text-xs text-muted">{p.mediaKinds.join(' · ')}{p.removed ? ' · Deleted' : ''}</span></th>
        <td className="px-3 py-4"><Button aria-label={`${eff.enabled ? 'Disable' : 'Enable'} ${p.id}`} aria-pressed={eff.enabled} disabled={disabled} onClick={() => patch(p.id, { enabled: !eff.enabled })} size="sm" variant={eff.enabled ? 'secondary' : 'ghost'}>{eff.enabled ? 'On' : 'Off'}</Button></td>
        <td className="px-3 py-4"><Input aria-label={`Regions for ${p.id}`} className="min-w-28" defaultValue={eff.regions.join(', ')} disabled={disabled} key={`${p.id}:${eff.regions.join(',')}`} onBlur={(event) => {
          const regions = event.target.value.split(',').map((value) => value.trim().toUpperCase())
          if (!regions.length || new Set(regions).size !== regions.length || regions.some((value) => !/^[A-Z]{2}$/.test(value) || !(p.configuredRegions ?? p.regions).includes(value))) { setError(`${p.id}: choose distinct configured regions: ${(p.configuredRegions ?? p.regions).join(', ')}.`); return }
          if (regions.join(',') !== eff.regions.join(',')) patch(p.id, { regions })
        }} /><span className="mt-1 block text-xs text-muted">Configured: {(p.configuredRegions ?? p.regions).join(', ')}</span></td>
        <td className="px-3 py-4"><Input aria-label={`Requests per minute for ${p.id}`} className="w-20 tabular-nums" defaultValue={eff.requestsPerMinute} disabled={disabled} key={`${p.id}:rpm:${eff.requestsPerMinute}`} max={120} min={1} onBlur={(event) => {
          const value = Number(event.target.value)
          if (!Number.isInteger(value) || value < 1 || value > 120) { setError(`${p.id}: requests per minute must be between 1 and 120.`); return }
          if (value !== eff.requestsPerMinute) patch(p.id, { requestsPerMinute: value })
        }} type="number" /></td>
        <td className="px-3 py-4"><Input aria-label={`Concurrency for ${p.id}`} className="w-20 tabular-nums" defaultValue={eff.concurrency} disabled={disabled} key={`${p.id}:concurrency:${eff.concurrency}`} max={4} min={1} onBlur={(event) => {
          const value = Number(event.target.value)
          if (!Number.isInteger(value) || value < 1 || value > 4) { setError(`${p.id}: concurrency must be between 1 and 4.`); return }
          if (value !== eff.concurrency) patch(p.id, { concurrency: value })
        }} type="number" /></td>
        <td className="px-3 py-4"><div className="flex flex-wrap gap-2">
          {p.removed ? <Button disabled={saving !== null} onClick={() => void run(p, 'restore')} size="sm" variant="secondary">Restore</Button> : <>
            {drafts[p.id] ? <><Button disabled={saving !== null} loading={saving === p.id} onClick={() => void run(p, 'save')} size="sm" variant="accent">Save</Button><Button disabled={saving !== null} onClick={() => setDrafts((previous) => { const next = { ...previous }; delete next[p.id]; return next })} size="sm" variant="ghost">Discard</Button></> : hasOverride ? <Button disabled={saving !== null} onClick={() => void run(p, 'reset')} size="sm" variant="ghost">Reset settings</Button> : null}
            <Button aria-label={`Delete ${p.id}`} disabled={saving !== null} onClick={() => setConfirmDelete(p.id)} size="sm" variant="ghost">Delete</Button>
          </>}
        </div>{confirmDelete === p.id && <div className="mt-3 space-y-3"><p className="max-w-64 text-sm text-copy">Delete {p.id} from playback? Saved progress stays available. You can restore this provider later.</p><div className="flex gap-2"><Button disabled={saving !== null} loading={saving === p.id} onClick={() => void run(p, 'delete')} size="sm" variant="danger">Confirm deletion</Button><Button disabled={saving !== null} onClick={() => setConfirmDelete(null)} size="sm" variant="ghost">Cancel</Button></div></div>}</td>
      </tr>
    })}</tbody></table></div>}
    <p className="max-w-[75ch] text-sm leading-6 text-muted">Every provider delivers media directly to the player. Reset settings restores configuration defaults and may enable a provider again.</p>
    <ProviderOrderEditor key={orderSignature} providers={providers.filter((p) => !p.removed)} />
  </div>
}
