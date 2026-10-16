import type { RefObject } from 'react'
import { Check, Heart, TriangleAlert } from 'lucide-react'

import { cn } from '../lib/cn'
import { PlayerPanel } from './player-panel'
import { regionFlag, regionName } from './player-settings'

export type ServerMenuOption = {
  value: string
  label: string
  detail?: string | undefined
  region?: string | undefined
  health?: 'ok' | 'degraded' | undefined
  available?: boolean | undefined
  family?: string | undefined
  mirror?: string | undefined
}

export type ServerMenuGroup = { family: string; options: readonly ServerMenuOption[] }

export type PlayerServerMenuModel = {
  auto: boolean
  busy: boolean
  loading: boolean
  error: string | null
  currentLabel?: string | undefined
  selected?: string | undefined
  firstServer?: string | undefined
  hasOtherServers: boolean
  favorites: readonly string[]
  groups: readonly ServerMenuGroup[]
}

export type PlayerServerMenuActions = {
  chooseAuto?: (() => void) | undefined
  chooseServer: (value: string) => void
  toggleFavorite: (value: string) => void
  retry?: (() => void) | undefined
  close: () => void
  back: () => void
}

/** Server choice presentation; resolution and recovery remain owned by Watch. */
export function PlayerServerMenu({
  menuRef,
  model,
  actions,
}: {
  menuRef: RefObject<HTMLDivElement | null>
  model: PlayerServerMenuModel
  actions: PlayerServerMenuActions
}) {
  const displayFamilyName = (family: string) => family.charAt(0).toUpperCase() + family.slice(1)
  const displayMirrorName = (option: ServerMenuOption) => {
    if (!option.family || !option.mirror || option.mirror === 'auto') return option.family ? 'Auto' : option.label
    return option.mirror.charAt(0).toUpperCase() + option.mirror.slice(1)
  }

  return (
    <div className="contents" ref={menuRef}>
      <PlayerPanel aria-label="Server" id="consumit-player-menu-server" onBack={actions.back} onClose={actions.close} title="Server">
        <div className="space-y-1 p-3">
          {actions.chooseAuto ? <>
            <button aria-checked={model.auto} className={cn('flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-left text-sm text-ink outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-orange disabled:opacity-50', model.auto && 'bg-orange/15')} disabled={model.busy} onClick={actions.chooseAuto} role="menuitemradio" type="button">
              <span className="min-w-0 flex-1"><span className="block font-medium">Auto</span><span className="block text-xs text-muted">Choose automatically</span></span>
              {model.auto ? <Check aria-hidden="true" className="size-4 shrink-0 text-orange" /> : null}
            </button>
            {model.currentLabel ? <p className="px-3 py-2 text-xs text-copy">Playing from {model.currentLabel}</p> : null}
          </> : null}
          {model.loading ? <p className="px-3 py-2 text-xs text-copy" role="status">Finding servers…</p> : null}
          {model.busy ? <p className="px-3 py-2 text-xs text-copy" role="status">Switching server…</p> : null}
          {model.error ? <div className="px-3 py-2"><p className="text-xs text-copy" role="status">{model.error}</p><button className="min-h-11 text-sm text-ink underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-orange" disabled={model.loading} onClick={actions.retry} type="button">Try again</button></div> : null}
          {!model.loading && !model.error && actions.chooseAuto && !model.hasOtherServers ? <p className="px-3 py-2 text-xs text-muted">No other servers are available for this title.</p> : null}
          {model.groups.map((group) => (
            <div key={group.family || 'servers'} role="group" aria-label={group.family ? displayFamilyName(group.family) : 'Servers'}>
              {group.family && model.groups.length > 1 ? (
                <p className="px-3 pt-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">{displayFamilyName(group.family)}</p>
              ) : null}
              {group.options.map((option) => {
                const selected = !model.auto && (model.selected ?? model.firstServer) === option.value
                const favorite = model.favorites.includes(option.value)
                const flag = regionFlag(option.region)
                const region = regionName(option.region)
                const degraded = option.health === 'degraded'
                const answering = option.available !== false
                const detail = option.detail ?? (answering ? null : 'Unavailable for this title')
                return (
                  <div className={cn('flex items-center gap-1 rounded-control transition-all motion-reduce:transition-none', selected ? 'bg-orange/15 shadow-[inset_0_0_0_1px_var(--color-orange)]' : 'hover:bg-white/10', !answering && 'opacity-60')} key={option.value}>
                    <button aria-checked={selected} disabled={model.busy} className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-control px-3 text-left text-sm outline-none transition-all motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-orange" onClick={() => actions.chooseServer(option.value)} role="menuitemradio" title={answering ? undefined : 'Unavailable for this title — tap to retry it'} type="button">
                      {flag ? <span aria-hidden="true" className="shrink-0 text-base leading-none" title={region ?? undefined}>{flag}</span> : null}
                      <span className="min-w-0 flex-1">
                        <span className={cn('block truncate leading-5', selected ? 'font-bold text-ink' : 'font-medium')}>{displayMirrorName(option)}</span>
                        {detail ? <span className="block truncate text-xs leading-4 font-normal text-muted">{detail}</span> : null}
                      </span>
                      {degraded ? <span className="grid shrink-0 place-items-center text-orange" title="Server degraded"><TriangleAlert aria-hidden="true" className="size-4" /><span className="sr-only">Server degraded</span></span> : null}
                      {selected ? <Check aria-hidden="true" className="size-4 shrink-0 text-orange" /> : null}
                    </button>
                    <button aria-label={favorite ? `Unfavorite ${option.label} server` : `Favorite ${option.label} server`} aria-pressed={favorite} className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-control text-muted outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-orange motion-reduce:transition-none" onClick={() => actions.toggleFavorite(option.value)} title={favorite ? 'Favorited — pins to the top' : 'Favorite server'} type="button">
                      <Heart aria-hidden="true" className={cn('size-4', favorite && 'fill-current text-orange')} />
                    </button>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </PlayerPanel>
    </div>
  )
}
