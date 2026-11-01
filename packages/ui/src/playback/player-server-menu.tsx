'use client'
import { useId, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { Check, Heart, Search, TriangleAlert, X } from 'lucide-react'
import { cn } from '../lib/cn'
import { PlayerPanel } from './player-panel'
import { regionName } from './player-settings'

export type ServerMenuOption = {
  value: string; label: string; delivery?: 'direct' | 'relay' | 'embed' | undefined
  detail?: string | undefined; region?: string | undefined; health?: 'ok' | 'degraded' | undefined
  available?: boolean | undefined; family?: string | undefined; mirror?: string | undefined
}
export type ServerMenuGroup = { family: string; options: readonly ServerMenuOption[] }
export type PlayerServerMenuModel = {
  auto: boolean; busy: boolean; loading: boolean; error: string | null; currentLabel?: string | undefined
  selected?: string | undefined; firstServer?: string | undefined; hasOtherServers: boolean
  favorites: readonly string[]; groups: readonly ServerMenuGroup[]; options?: readonly ServerMenuOption[] | undefined
}
export type PlayerServerMenuActions = {
  chooseAuto?: (() => void) | undefined; chooseServer: (value: string) => void
  toggleFavorite: (value: string) => void; retry?: (() => void) | undefined; close: () => void; back: () => void
}

/** A fixed source switcher and search stay reachable while provider rows scroll. */
export function PlayerServerMenu({ menuRef, model, actions }: {
  menuRef: RefObject<HTMLDivElement | null>; model: PlayerServerMenuModel; actions: PlayerServerMenuActions
}) {
  const options = model.options ?? model.groups.flatMap(group => group.options)
  const [section, setSection] = useState<'all' | 'consumit' | 'external'>('all')
  const [query, setQuery] = useState('')
  const id = useId()
  const retryRequested = useRef(false)
  const wasLoading = useRef(model.loading)
  const retryButton = useRef<HTMLButtonElement>(null)
  const sectionOptions = options.filter(option => section === 'all' || (option.delivery === 'embed') === (section === 'external'))
  const search = query.trim().toLocaleLowerCase()
  const filtered = sectionOptions.filter(option => [option.label, option.detail, option.family, regionName(option.region)].some(value => value?.toLocaleLowerCase().includes(search)))
  useLayoutEffect(() => {
    const loadingFinished = wasLoading.current && !model.loading
    wasLoading.current = model.loading
    if (!retryRequested.current || !loadingFinished) return
    retryRequested.current = false
    if (model.error) retryButton.current?.focus({ preventScroll: true })
    else document.getElementById(`${id}-${section}-tab`)?.focus({ preventScroll: true })
  }, [id, model.error, model.loading, section])
  const readableDetail = (option: ServerMenuOption) => {
    const detail = option.detail?.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').replace(/\b\p{L}/gu, letter => letter.toUpperCase())
    if (option.delivery === 'embed') return option.available === false ? 'Unavailable for this title' : 'External player · own controls'
    return detail && detail.toLowerCase() !== option.label.toLowerCase() ? detail : option.delivery === 'relay' ? 'Consumit controls · relayed media' : 'Consumit controls · direct media'
  }
  return <div className="contents" ref={menuRef}>
    <PlayerPanel anchorSelector={'[data-player-destination="sources"]'} aria-label="Sources" role="dialog" id="consumit-player-menu-server" title="Sources" onClose={actions.close} className="consumit-source-panel" scrollableBody>
      <div className="consumit-source-toolbar">
        <div aria-label="Source type" className="consumit-source-tabs" role="tablist">
          {(['all', 'consumit', 'external'] as const).map(value => <button className="rounded-control outline-none focus-visible:ring-2 focus-visible:ring-orange" key={value} id={`${id}-${value}-tab`} role="tab" aria-selected={section === value} aria-controls={`${id}-${value}-panel`} tabIndex={section === value ? 0 : -1} type="button" onClick={() => { setSection(value); setQuery('') }} onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
            event.preventDefault()
            const tabs = ['all', 'consumit', 'external'] as const
            const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs.at(-1)! : tabs[(tabs.indexOf(section) + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length]!
            setSection(next); setQuery(''); document.getElementById(`${id}-${next}-tab`)?.focus()
          }}>{value === 'all' ? 'All' : value === 'consumit' ? 'Consumit' : 'External'}<span>{value === 'all' ? options.length : options.filter(option => (option.delivery === 'embed') === (value === 'external')).length}</span></button>)}
        </div>
        <label className="consumit-source-search"><Search aria-hidden="true" className="size-4" /><input aria-label="Search sources" autoComplete="off" placeholder="Find a source…" value={query} onChange={event => setQuery(event.target.value)} />{query ? <button aria-label="Clear source search" type="button" onClick={() => setQuery('')}><X aria-hidden="true" className="size-4" /></button> : null}</label>
      </div>
      <div className="consumit-source-results" role="tabpanel" aria-labelledby={`${id}-${section}-tab`} id={`${id}-${section}-panel`} tabIndex={0}>
        {model.loading ? <p className="consumit-source-note" role="status">Finding sources…</p> : null}
        {model.busy ? <p className="consumit-source-note" role="status">Switching source…</p> : null}
        {model.error ? <div className="consumit-source-note"><p role="status">{model.error}</p><button className="min-h-11 rounded-control px-2 text-ink underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-orange" disabled={model.loading} onClick={() => {
          retryRequested.current = true
          document.getElementById(`${id}-${section}-tab`)?.focus({ preventScroll: true })
          actions.retry?.()
        }} ref={retryButton} type="button">Try again</button></div> : null}
        {!model.loading && !model.error && !filtered.length ? <p className="consumit-source-note" role="status">{search ? 'No matching sources. Try another name.' : section === 'external' ? 'No external players are configured for this title.' : section === 'consumit' ? 'No Consumit servers are available for this title.' : 'No sources are available for this title.'}</p> : null}
        {(['consumit', 'external'] as const).filter(group => section === 'all' || group === section).map(group => {
          const groupOptions = filtered.filter(option => (option.delivery === 'embed') === (group === 'external'))
          if (!groupOptions.length && !(group === 'consumit' && actions.chooseAuto && !search)) return null
          return <section className="consumit-source-group" key={group}>
            {section === 'all' ? <h4>{group === 'consumit' ? 'Consumit Server' : 'External players'}</h4> : null}
            {group === 'external' ? <p className="consumit-source-note">Fallback players use their own controls. Progress sync and auto-next are unavailable.</p> : null}
            <div role="group" aria-label={group === 'consumit' ? 'Consumit Server' : 'External players'}>
              {group === 'consumit' && actions.chooseAuto && !search ? <button className="consumit-source-auto" aria-label="Auto" aria-pressed={model.auto} disabled={model.busy} onClick={actions.chooseAuto} type="button"><span><strong>Auto</strong><small>{model.auto && model.currentLabel ? `Playing from ${model.currentLabel}` : 'Follow the configured source order'}</small></span>{model.auto ? <Check aria-hidden="true" className="size-4 text-orange" /> : null}</button> : null}
              {group === 'consumit' && actions.chooseAuto && !model.loading && !model.error && !search && !model.hasOtherServers ? <p className="consumit-source-note">No other servers are available for this title.</p> : null}
              {groupOptions.map(option => {
              const selected = !model.auto && (model.selected ?? model.firstServer) === option.value
              const favorite = model.favorites.includes(option.value)
              const label = option.family && option.mirror && option.mirror !== 'auto' && !/^Server /i.test(option.label) ? option.mirror.charAt(0).toUpperCase() + option.mirror.slice(1) : option.label
              return <div className={cn('consumit-source-row', selected && 'is-selected')} key={option.value}>
                <button aria-label={label} aria-pressed={selected} disabled={model.busy} className="consumit-source-choice" onClick={() => actions.chooseServer(option.value)} type="button" title={option.available === false ? 'Unavailable for this title — select to retry' : undefined}>
                  <span className="min-w-0 flex-1"><strong>{label}</strong><small>{option.available === false ? 'Unavailable for this title' : readableDetail(option)}</small></span>
                  {option.region ? <span className="text-xs text-muted" title={regionName(option.region) ?? undefined}>{option.region}</span> : null}
                  {option.health === 'degraded' ? <span title="Server degraded"><TriangleAlert aria-hidden="true" className="size-4 text-orange" /><span className="sr-only">Server degraded</span></span> : null}
                  {selected ? <Check aria-hidden="true" className="size-4 shrink-0 text-orange" /> : null}
                </button>
                <button aria-label={favorite ? `Unfavorite ${option.label} server` : `Favorite ${option.label} server`} aria-pressed={favorite} className="consumit-source-favorite" onClick={() => actions.toggleFavorite(option.value)} title={favorite ? 'Favorited — pins to the top' : 'Favorite server'} type="button"><Heart aria-hidden="true" className={cn('size-4', favorite && 'fill-current text-orange')} /></button>
              </div>
              })}
            </div>
          </section>
        })}
      </div>
    </PlayerPanel>
  </div>
}
