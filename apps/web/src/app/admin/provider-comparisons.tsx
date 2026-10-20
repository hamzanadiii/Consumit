'use client'

import { useState } from 'react'
import { EmptyState, Select } from '@consumit/ui'
import type { ProviderComparisonRow, ProviderKind } from '@/lib/admin-browser'

const count = (value: number | undefined) => value === undefined ? 'Unavailable' : Math.round(value).toLocaleString('en-US')
const duration = (value: number | undefined) => value === undefined ? 'Unavailable' : `${Math.round(value).toLocaleString('en-US')}ms`
const evidenceLabels = { native: 'Native measurements', resolution: 'Resolver outcomes', 'provider-reported': 'Provider-reported events' }

/** Select precomputed pooled rows. Never combine percentile values in the UI. */
export function ProviderComparisons({ rows, available, windowMinutes, kind, onKindChange }: {
  rows: ProviderComparisonRow[]; available: boolean; windowMinutes: number; kind: ProviderKind; onKindChange: (kind: ProviderKind) => void
}) {
  const [region, setRegion] = useState('all')
  const [browser, setBrowser] = useState('all')
  const [delivery, setDelivery] = useState('all')
  const regions = [...new Set(rows.map(row => row.region))].sort()
  const browsers = [...new Set(rows.filter(row => row.browser !== 'all').map(row => row.browser))].sort()
  const visible = rows.filter(row => row.kind === kind && (region === 'all' || row.region === region) && row.browser === browser && (row.delivery === delivery || delivery === 'all' && row.delivery === 'unattributed'))
  return <section aria-labelledby="comparison-heading" className="space-y-4 border-t border-border pt-5">
    <div><h3 className="text-base font-semibold text-ink" id="comparison-heading">Provider comparisons</h3><p className="mt-1 max-w-[100ch] text-xs leading-5 text-muted">Playback measurements · last {windowMinutes} minutes. Startup and stall percentiles pool histogram observations across selected browsers and delivery paths. Each region stays separate. Manual debugger and scout runs remain separate evidence.</p></div>
    <div className="flex flex-wrap gap-3">
      <Select label="Comparison title kind" value={kind} onValueChange={value => onKindChange(value as ProviderKind)} options={[{ value: 'movie', label: 'Movies' }, { value: 'series', label: 'Series' }, { value: 'anime', label: 'Anime' }]} />
      <Select label="Comparison region" value={region} onValueChange={setRegion} options={[{ value: 'all', label: 'All regions (separate rows)' }, ...regions.map(value => ({ value, label: value }))]} />
      <Select label="Comparison browser" value={browser} onValueChange={setBrowser} options={[{ value: 'all', label: 'All browsers (pooled)' }, ...browsers.map(value => ({ value, label: value === 'unknown' ? 'Unknown browser' : value }))]} />
      <Select label="Comparison delivery" value={delivery} onValueChange={setDelivery} options={[{ value: 'all', label: 'All delivery (pooled)' }, { value: 'direct', label: 'Direct' }, { value: 'relay', label: 'Relay' }, { value: 'embed', label: 'External players' }]} />
    </div>
    <p className="text-xs leading-5 text-muted">Resolver counters have no browser or delivery attribution; they appear only with both filters set to All. Provider-reported events are messages, not decoded playback or member history. Missing timings and failure detail are marked unavailable. Event and histogram counts are observations, not unique viewers.</p>
    {!available ? <EmptyState title="Provider comparison metrics unavailable" description="The collector is not connected or the comparison query failed. Refresh to retry." /> : visible.length === 0 ? <EmptyState title="No comparison observations" description="No matching measurements in this window. Change the filters or wait for new playback evidence." /> : <div className="overflow-x-auto rounded-card border border-border"><table className="w-full min-w-[940px] text-left text-xs"><caption className="sr-only">Provider evidence comparison for {kind}, last {windowMinutes} minutes</caption><thead className="bg-surface text-muted"><tr>{['Provider / region', 'Evidence', 'Observations', 'Outcomes', 'Startup p50 / p95', 'Stall p50 / p95', 'Failure detail'].map(label => <th className="px-3 py-3 font-medium" key={label}>{label}</th>)}</tr></thead><tbody>{visible.map(row => <tr className="border-t border-border align-top" key={`${row.provider}:${row.region}:${row.browser}:${row.delivery}:${row.evidence}`}>
      <th scope="row" className="px-3 py-4 font-medium text-ink">{row.provider}<span className="mt-1 block font-normal text-muted">{row.region} · {row.delivery === 'unattributed' ? 'Delivery unattributed' : row.delivery === 'all' ? 'All delivery' : row.delivery}</span></th>
      <td className="px-3 py-4 text-copy">{evidenceLabels[row.evidence]}<span className="mt-1 block text-muted">{row.browser === 'all' ? 'All browsers' : row.browser}</span></td>
      <td className="px-3 py-4 tabular-nums text-copy">{row.evidence === 'native' ? <><span className="block">Startup: {count(row.startupSamples)}</span><span className="mt-1 block">Stalls: {count(row.stallSamples)}</span></> : row.evidence === 'resolution' ? `${count((row.resolveSuccess ?? 0) + (row.resolveFailures ?? 0) + (row.resolveCancelled ?? 0))} attempts` : `${count(Object.values(row.reportedEvents ?? {}).reduce((sum, value) => sum + value, 0))} messages`}</td>
      <td className="px-3 py-4 tabular-nums text-copy">{row.evidence === 'native' ? <><span className="block">{count(row.starts)} starts</span><span className="mt-1 block">{count(row.playbackFailures)} errors · {count(row.buffers)} stalls</span></> : row.evidence === 'resolution' ? <><span className="block">{count(row.resolveSuccess)} success</span><span className="mt-1 block">{count(row.resolveFailures)} failed · {count(row.resolveCancelled)} cancelled</span></> : Object.entries(row.reportedEvents ?? {}).map(([event, value]) => <span className="mb-1 block" key={event}>{event}: {count(value)}</span>)}</td>
      <td className="px-3 py-4 tabular-nums text-muted">{duration(row.startupP50Ms)} / {duration(row.startupP95Ms)}</td>
      <td className="px-3 py-4 tabular-nums text-muted">{duration(row.stallP50Ms)} / {duration(row.stallP95Ms)}</td>
      <td className="px-3 py-4 text-muted">{row.failureReasons && Object.keys(row.failureReasons).length ? Object.entries(row.failureReasons).map(([reason, value]) => <span className="mb-1 block" key={reason}>{reason}: {count(value)}</span>) : row.evidence === 'provider-reported' && (row.reportedEvents?.error || row.reportedEvents?.unavailable) ? 'Provider reported failure; cause unavailable' : 'Unavailable'}</td>
    </tr>)}</tbody></table></div>}
  </section>
}
