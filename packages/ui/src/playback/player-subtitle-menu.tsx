import type { RefObject } from 'react'
import { Captions, Check, ChevronRight, Loader2, Search, TimerReset, Upload } from 'lucide-react'

import { cn } from '../lib/cn'
import { PlayerPanel } from './player-panel'
import { nativeLanguageName, subtitleLabelDetail } from './subtitle-sync'
import { settingsRowClass } from './player-settings'
import type { PlayerOption, PlayerSubtitleCandidate, PlayerSubtitleDiscovery } from './player-types'

export type PlayerSubtitleLanguage = {
  code: string
  count: number
  discoveryCodes: readonly string[]
  opened: boolean
  options: readonly PlayerOption[]
  tracks: readonly PlayerSubtitleCandidate[]
  loading: boolean
  failed: boolean
  hasMore: boolean
}

export type PlayerSubtitleMenuModel = {
  trackCount: number
  subtitleNotice?: string | undefined
  discovery?: PlayerSubtitleDiscovery | undefined
  menuError: string | null
  loadError?: string | null | undefined
  search: string
  options: readonly PlayerOption[]
  selected: string
  searchResults: readonly PlayerSubtitleCandidate[]
  searching: boolean
  nextSearchCursor: number | null
  preparingId: string | null
  uploading: boolean
  uploadedSubtitle?: { id: string; label: string } | null | undefined
  languages: readonly PlayerSubtitleLanguage[]
  isRepresentedCandidate: (candidate: PlayerSubtitleCandidate) => boolean
}

export type PlayerSubtitleMenuActions = {
  close: () => void
  back: () => void
  chooseSubtitle: (value: string) => void
  changeSearch: (query: string) => void
  runSearch: (query: string, cursor?: number) => void
  selectCandidate: (candidate: PlayerSubtitleCandidate) => void
  requestDiscovery?: (() => void) | undefined
  retryFile: () => void
  toggleLanguage: (code: string, opened: boolean) => void
  retryLanguage: (code: string) => void
  loadMoreLanguage: (code: string) => void
  openAppearance: () => void
  openSync: () => void
  upload: (file: File | undefined) => void
}

/** Subtitle search and track selection presentation; provider requests remain owned by Watch. */
export function PlayerSubtitleMenu({
  menuRef,
  uploadInputRef,
  model,
  actions,
}: {
  menuRef: RefObject<HTMLDivElement | null>
  uploadInputRef: RefObject<HTMLInputElement | null>
  model: PlayerSubtitleMenuModel
  actions: PlayerSubtitleMenuActions
}) {
  const search = model.search.trim()
  const matchingLocalSubtitles = model.options.filter((option) => option.value !== 'off'
    && `${option.label} ${nativeLanguageName(option.language, '')} ${option.language ?? ''}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
  const searchResults = model.searchResults.filter((track) => !model.isRepresentedCandidate(track))
  const uploadedValue = model.uploadedSubtitle ? `external:consumit-external-${model.uploadedSubtitle.id}` : undefined

  return (
    <div className="contents" ref={menuRef}>
      <PlayerPanel aria-label="Subtitles" className="consumit-subtitle-panel" id="consumit-player-menu-subtitles" onClose={actions.close} onBack={actions.back} meta={model.trackCount > 0 ? `${model.trackCount} ${model.trackCount === 1 ? 'track' : 'tracks'}` : undefined} title="Subtitles">
        {model.subtitleNotice ? <p className="mb-3 text-xs leading-5 text-copy" role="status">{model.subtitleNotice}</p> : null}
        <div className="consumit-subtitle-body">
          <div className="consumit-subtitle-browser">
            <button aria-checked={model.selected === 'off'} className={settingsRowClass(model.selected === 'off')} onClick={() => actions.chooseSubtitle('off')} role="menuitemradio" type="button">
              <span className="min-w-0 flex-1 text-left font-medium">Off</span>
              {model.selected === 'off' ? <Check aria-hidden="true" className="size-4 shrink-0 text-orange" /> : null}
            </button>
            <label className="consumit-subtitle-search">
              <Search aria-hidden="true" className="size-4 shrink-0" />
              <input aria-label="Search subtitle languages and tracks" className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted" onChange={(event) => actions.changeSearch(event.target.value)} placeholder="Find a language or track" type="search" value={model.search} />
            </label>
            {model.uploading ? <p className="consumit-subtitle-availability" role="status">Reading subtitle file…</p> : null}
            {!search && model.uploadedSubtitle ? (
              <button aria-checked={model.selected === uploadedValue} className={settingsRowClass(model.selected === uploadedValue)} onClick={() => actions.chooseSubtitle(uploadedValue!)} role="menuitemradio" type="button">
                <SubtitleTrackLabel language="und" label={model.uploadedSubtitle.label} detail="Uploaded · current viewing session" />
                {model.selected === uploadedValue ? <Check aria-hidden="true" className="size-4 shrink-0 text-orange" /> : null}
              </button>
            ) : null}
            {model.discovery?.loading ? <p className="px-2 py-1 text-xs text-muted" role="status">Searching subtitle providers…</p> : null}
            {model.discovery?.error ? <div className="consumit-subtitle-notice" role="alert"><p>{model.discovery.error}</p>{actions.requestDiscovery ? <button disabled={model.discovery.loading} onClick={actions.requestDiscovery} type="button">Try again</button> : null}</div> : null}
            {model.menuError ? <div className="consumit-subtitle-notice" role="alert"><p>{model.menuError}</p>{search ? <button disabled={model.searching} onClick={() => actions.runSearch(model.search)} type="button">Try search again</button> : null}</div> : null}
            {model.loadError ? <div className="consumit-subtitle-notice" role="alert"><p>{model.loadError}</p><button onClick={actions.retryFile} type="button">Retry this track</button></div> : null}
            {!model.discovery?.error && model.discovery?.providers.some((provider) => provider.state === 'failed' || provider.state === 'timeout' || provider.reason === 'credentials_required') ? (
              <p className="consumit-subtitle-availability">Some tracks are unavailable. You can still choose from the available tracks.</p>
            ) : null}
            {search ? <div className="space-y-1">
              {model.searching ? <p className="px-2 text-xs text-muted" role="status">Searching tracks…</p> : null}
              {!model.searching && matchingLocalSubtitles.length === 0 && searchResults.length === 0 ? <p className="px-2 text-xs text-muted">No tracks match this search.</p> : null}
              {matchingLocalSubtitles.map((option) => <button aria-checked={model.selected === option.value} className={settingsRowClass(model.selected === option.value)} key={option.value} onClick={() => actions.chooseSubtitle(option.value)} role="menuitemradio" type="button"><SubtitleTrackLabel language={option.language} label={option.label} detail={option.detail} />{model.selected === option.value ? <Check aria-hidden="true" className="size-4 text-orange" /> : null}</button>)}
              {searchResults.map((track) => <button className={settingsRowClass(false)} disabled={model.preparingId !== null} key={track.id} onClick={() => actions.selectCandidate(track)} type="button"><SubtitleTrackLabel language={track.language} label={track.label} detail={subtitleCandidateDetail(track)} />{model.preparingId === track.id ? <Loader2 aria-label="Preparing subtitle" className="size-4 animate-spin" /> : null}</button>)}
              {model.nextSearchCursor != null ? <button className={settingsRowClass(false)} onClick={() => actions.runSearch(model.search, model.nextSearchCursor!)} type="button">Load more matches</button> : null}
            </div> : null}
            {!search && !model.uploadedSubtitle && !model.discovery?.loading && model.languages.length === 0 ? <p className="px-2 py-2 text-sm text-muted">No subtitles found for this title yet.</p> : null}
            {actions.requestDiscovery && !model.discovery?.loading && !model.discovery?.error ? <button className={settingsRowClass(false)} onClick={actions.requestDiscovery} type="button">Search providers again</button> : null}
            {!search && model.languages.map((language) => (
              <div className="consumit-subtitle-language" key={language.code}>
                <button aria-expanded={language.opened} className={settingsRowClass(false)} onClick={() => actions.toggleLanguage(language.code, language.opened)} type="button">
                  <bdi className="min-w-0 flex-1 truncate text-left font-medium tracking-normal" dir="auto" lang={language.code}>{nativeLanguageName(language.code, language.code === 'und' ? 'Other tracks' : language.code.toUpperCase())}</bdi>
                  <span className="tabular-nums text-muted">{language.count}</span><ChevronRight aria-hidden="true" className={cn('size-4 text-muted transition-transform', language.opened && 'rotate-90')} />
                </button>
                {language.opened ? <div aria-label={`${nativeLanguageName(language.code, language.code)} subtitle tracks`} className="space-y-1 pl-3">
                  {language.loading ? <p className="consumit-subtitle-availability" role="status">Loading tracks…</p> : null}
                  {language.failed ? <div className="consumit-subtitle-notice" role="alert"><p>These tracks could not load.</p><button onClick={() => actions.retryLanguage(language.code)} type="button">Try this language again</button></div> : null}
                  {language.options.map((option) => <button aria-checked={model.selected === option.value} className={settingsRowClass(model.selected === option.value)} key={option.value} onClick={() => actions.chooseSubtitle(option.value)} role="menuitemradio" type="button"><SubtitleTrackLabel language={option.language} label={option.label} detail={option.detail} />{model.selected === option.value ? <Check aria-hidden="true" className="size-4 text-orange" /> : null}</button>)}
                  {language.tracks.map((track) => <button className={settingsRowClass(false)} disabled={model.preparingId !== null} key={track.id} onClick={() => actions.selectCandidate(track)} type="button"><SubtitleTrackLabel language={track.language} label={track.label} detail={subtitleCandidateDetail(track)} />{model.preparingId === track.id ? <Loader2 aria-label="Preparing subtitle" className="size-4 animate-spin" /> : null}</button>)}
                  {language.hasMore && !language.failed ? <button className={settingsRowClass(false)} disabled={language.loading} onClick={() => actions.loadMoreLanguage(language.code)} type="button">Load more tracks</button> : null}
                </div> : null}
              </div>
            ))}
          </div>
          <div aria-label="Subtitle tools" className="consumit-subtitle-tools" role="group">
            <button aria-label="Subtitle appearance" onClick={actions.openAppearance} type="button"><Captions aria-hidden="true" className="size-4" />Appearance</button>
            <button aria-label="Sync subtitle to audio" onClick={actions.openSync} type="button"><TimerReset aria-hidden="true" className="size-4" />Sync</button>
            <input accept=".srt,.vtt,text/vtt,application/x-subrip" aria-label="Subtitle file" className="sr-only" disabled={model.uploading} onChange={(event) => { actions.upload(event.target.files?.[0]); event.target.value = '' }} ref={uploadInputRef} type="file" />
            <button aria-label="Upload subtitle file" disabled={model.uploading} onClick={() => uploadInputRef.current?.click()} title="SRT or VTT · up to 2 MB" type="button"><Upload aria-hidden="true" className="size-4" />Upload</button>
          </div>
        </div>
      </PlayerPanel>
    </div>
  )
}

function SubtitleTrackLabel({ language, label, detail }: { language?: string | undefined; label: string; detail?: string | undefined }) {
  const description = detail || (language && language !== 'und' ? subtitleLabelDetail(label) : undefined)
  return <span className="min-w-0 flex-1 text-left" title={label}>
    <bdi className="block truncate text-sm font-medium tracking-normal" data-player-subtitle-label dir="auto" lang={language}>{nativeLanguageName(language, label)}</bdi>
    {description ? <bdi className="block truncate text-xs text-muted tracking-normal" dir="auto">{description}</bdi> : null}
  </span>
}

function subtitleCandidateDetail(track: PlayerSubtitleCandidate) {
  const release = track.release || subtitleLabelDetail(track.label)
  return [track.providerName ?? track.provider, release, track.hi || track.sdh ? 'HI' : undefined, track.forced ? 'Forced' : undefined, track.machineTranslated ? 'Machine translated' : undefined].filter(Boolean).join(' · ')
}
