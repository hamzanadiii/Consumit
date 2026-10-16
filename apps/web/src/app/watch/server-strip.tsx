'use client'

import { useId, useState } from 'react'
import { ArrowDown, ArrowUp, Check, ChevronDown, ExternalLink, Play, RotateCcw, SlidersHorizontal } from 'lucide-react'
import type { PlaybackProvider } from '@consumit/contracts'
import { Button } from '@consumit/ui'
export const serverName = (index: number) => `Server ${index + 1}`
const actionClass = 'min-h-[38px] max-sm:min-h-[44px] [@media(pointer:coarse)]:min-h-[44px]'
const frameNames: Record<string, string> = { vidapiframe: 'VidAPI', vidfastframe: 'VidFast', vidcoreioframe: 'VidCore', vidriftframe: 'VidRift', moviesapiframe: 'MoviesAPI', vidlinkframe: 'VidLink', vidnestframe: 'VidNest', vixsrcframe: 'Vixsrc', apiplayerframe: 'APIPlayer', embedapiframe: 'EmbedAPI', vsembedframe: 'VsEmbed', cinesrcframe: 'CineSrc', reanimeframe: 'ReAnime', megaplayframe: 'MegaPlay' }
const frameName = (server: PlaybackProvider) => frameNames[server.id] ?? server.label
export function ServerStrip({ servers, active, busy, loading, error, onRetry, onSelect, onOrder }: {
  servers: readonly PlaybackProvider[]; active?: string | undefined; busy: boolean; loading: boolean; error: string | null;
  onRetry(): void; onSelect(id: string): void; onOrder(ids: string[]): void;
}) {
  const [managing, setManaging] = useState(false)
  const [showConsumit, setShowConsumit] = useState(false)
  const manageId = useId()
  const consumitId = useId()
  const consumitSummaryId = useId()
  const nativeServers = servers.filter(server => server.deliveryMode !== 'embed')
  const embeds = servers.filter(server => server.deliveryMode === 'embed')
  const nativeActive = nativeServers.find(server => server.id === active)
  const move = (index: number, by: number) => { const ids = servers.map(server => server.id); [ids[index], ids[index + by]] = [ids[index + by]!, ids[index]!]; onOrder(ids) }
  return <section aria-label="Playback servers" className="min-w-0 border-t border-white/10 bg-canvas py-5 sm:py-6">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <h2 className="text-sm font-bold text-ink">Servers <span className="ml-1.5 font-normal tabular-nums text-muted">{servers.length || ''}</span></h2>
      <button aria-controls={manageId} aria-expanded={managing} className={`${actionClass} inline-flex items-center gap-2 rounded-control px-2 text-xs text-copy outline-none transition-colors hover:bg-surface-raised hover:text-ink focus-visible:ring-2 focus-visible:ring-orange motion-reduce:transition-none`} onClick={() => setManaging(value => !value)} type="button">
        {managing ? <Check aria-hidden="true" className="size-4" /> : <SlidersHorizontal aria-hidden="true" className="size-4" />}{managing ? 'Done' : 'Manage servers'}
      </button>
    </div>
    {loading ? <p className="pb-3 text-sm text-copy" role="status">Loading servers…</p> : null}
    {error ? <div role="status" className="mb-3 flex flex-wrap items-center gap-2 text-sm text-copy">{error}<Button className={actionClass} onClick={onRetry} size="sm" variant="secondary">Retry</Button></div> : null}
    {!loading && !error && servers.length === 0 ? <p className="py-2 text-sm text-copy">No servers are available for this title.</p> : null}
    <div aria-label="Choose a server" className="space-y-4">
      {nativeServers.length ? <div>
        <button aria-label="Consumit Server" aria-describedby={consumitSummaryId} aria-controls={consumitId} aria-expanded={showConsumit} className={`flex min-h-16 w-full items-center gap-3 rounded-card border px-4 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-orange motion-reduce:transition-none ${nativeActive ? 'border-orange/50 bg-orange/5' : 'border-white/10 bg-surface hover:bg-surface-raised'}`} onClick={() => setShowConsumit(value => !value)} type="button">
          <span className={`grid size-9 shrink-0 place-items-center rounded-full ${nativeActive ? 'bg-orange/10 text-orange' : 'bg-surface-raised text-copy'}`}><Play aria-hidden="true" className="size-4" /></span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-ink">Consumit Server</span><span className="mt-0.5 block truncate text-xs text-copy" id={consumitSummaryId}>{nativeActive ? `${serverName(servers.indexOf(nativeActive))} · ${nativeActive.label}` : `${nativeServers.length} providers · Consumit Player`}</span></span>
          {nativeActive ? <span className="hidden items-center gap-1.5 text-xs text-orange sm:inline-flex"><Check aria-hidden="true" className="size-3.5" />Selected</span> : null}
          <ChevronDown aria-hidden="true" className={`size-4 shrink-0 text-copy transition-transform motion-reduce:transition-none ${showConsumit ? 'rotate-180' : ''}`} />
        </button>
        <div hidden={!showConsumit} id={consumitId} className="pt-3">
          <p className="mb-2 px-1 text-xs leading-5 text-muted">Choose a provider for the Consumit Player. Your saved recovery order stays in Manage servers.</p>
          <div aria-label="Consumit Server providers" className="grid grid-cols-2 gap-x-4 sm:grid-cols-3">
          {nativeServers.map(server => {
            const index = servers.indexOf(server)
            const selected = server.id === active
            return <button aria-label={`${serverName(index)} · ${server.label}`} aria-pressed={selected} className={`flex min-h-16 min-w-0 items-center gap-2 border-b px-1 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-orange disabled:cursor-wait disabled:opacity-60 ${selected ? 'border-orange text-orange' : 'border-white/10 text-ink hover:border-white/30'}`} disabled={busy} key={server.id} onClick={() => { setShowConsumit(false); onSelect(server.id) }} type="button"><span className="min-w-0 flex-1"><span className="block text-xs font-bold">{serverName(index)}</span><span className="mt-1 block truncate text-xs text-copy" title={server.label}>{server.label}</span></span>{selected ? <Check aria-hidden="true" className="size-4 shrink-0" /> : null}</button>
          })}
          </div>
        </div>
      </div> : null}
      {embeds.length ? <div>
        <p className="mb-2 text-xs text-muted">External players <span className="ml-1 tabular-nums">{embeds.length}</span></p>
        <div aria-label="Choose an external player" className="flex flex-wrap gap-2">
      {embeds.map(server => {
        const selected = server.id === active
        return <button aria-label={`${frameName(server)} · External player`} aria-pressed={selected} className={`inline-flex min-h-11 min-w-0 items-center gap-2 rounded-control border px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-orange disabled:cursor-wait disabled:opacity-60 motion-reduce:transition-none ${selected ? 'border-orange/60 bg-orange/10 text-orange' : 'border-white/10 bg-surface text-copy hover:border-white/25 hover:text-ink'}`} disabled={busy} key={server.id} onClick={() => { setShowConsumit(false); onSelect(server.id) }} title={server.label} type="button">
          {selected ? <Check aria-hidden="true" className="size-3.5 shrink-0" /> : <ExternalLink aria-hidden="true" className="size-3.5 shrink-0" />}<span className="truncate">{frameName(server)}</span>
        </button>
      })}
        </div>
        <p className="mt-2 text-xs leading-5 text-muted">External players manage their own audio and subtitles. Progress sync and auto-next are unavailable.</p>
      </div> : null}
    </div>
    <div hidden={!managing} id={manageId} className="mt-5 border-t border-white/10 pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-prose text-xs leading-5 text-copy">Set the order for this title type. Consumit tries servers in this order. New servers follow your saved choices.</p>
        <Button className={actionClass} disabled={busy} onClick={() => onOrder([])} size="sm" variant="ghost"><RotateCcw aria-hidden="true" className="size-3.5" />Reset to default</Button>
      </div>
      <ol className="mt-3 max-h-80 overflow-y-auto overscroll-contain">
        {servers.map((server, index) => <li className="flex items-center gap-2 border-b border-white/10 py-2 last:border-0 sm:gap-4" key={server.id}>
          <span className="min-w-0 flex-1 text-sm font-bold text-ink">{serverName(index)}<span className="mt-0.5 block truncate text-xs font-normal text-copy">{server.label}</span></span>
          <Button className={actionClass} aria-label={`Move ${server.label} up`} disabled={busy || index === 0} onClick={() => move(index, -1)} size="sm" variant="secondary"><ArrowUp aria-hidden="true" className="size-4" /><span className="hidden sm:inline">Move up</span></Button>
          <Button className={actionClass} aria-label={`Move ${server.label} down`} disabled={busy || index === servers.length - 1} onClick={() => move(index, 1)} size="sm" variant="secondary"><ArrowDown aria-hidden="true" className="size-4" /><span className="hidden sm:inline">Move down</span></Button>
        </li>)}
      </ol>
      <details className="mt-3 text-xs leading-5 text-muted"><summary className={`${actionClass} flex cursor-pointer list-none items-center gap-2 rounded-control text-copy outline-none focus-visible:ring-2 focus-visible:ring-orange`}><ChevronDown aria-hidden="true" className="size-3.5" />About external players</summary><p className="max-w-prose pb-2">External players control their own audio and subtitles. Progress sync and automatic next episode are unavailable.</p></details>
    </div>
  </section>
}
