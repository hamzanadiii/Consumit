'use client'

import Image from 'next/image'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import type { FrameDiagnosticEvent, PlaybackRef } from '@consumit/contracts'
import { createProviderFrameEvents } from '@/lib/provider-frame-events'
import { Button, PlayerPanel, PlayerRecoveryPanel, type PlaybackRecoveryViewModel } from '@consumit/ui'
import { ExternalLink, ArrowLeft, ChevronDown, ListVideo, Server, RefreshCw, SkipForward } from 'lucide-react'

/** A validated provider page; loading the document never establishes playback.
 *  All configured provider players use plain iframes under ADR 0006. */
export function ProviderFrame({ src, title, providerName, episodeContext, audioLanguage, onFallback, onFrameFailure, recovery, recoveryControlled = false, onRecoveryCancel, onRetryAuto, recoveryExtraAction, serverControl, backHref, episodePanel, diagnosticSource, onDiagnostic }: { src: string; title: string; providerName?: string | undefined; episodeContext?: string | undefined; audioLanguage?: string | undefined; onFallback?: (() => void) | undefined; onFrameFailure?: (() => void) | undefined; recovery?: PlaybackRecoveryViewModel | undefined; recoveryControlled?: boolean | undefined; onRecoveryCancel?: (() => void) | undefined; onRetryAuto?: (() => void) | undefined; recoveryExtraAction?: ReactNode | undefined; serverControl?: ReactNode; backHref?: string | undefined; episodePanel?: ReactNode; diagnosticSource?: { providerId: string; ref: PlaybackRef }; onDiagnostic?: (event: Omit<FrameDiagnosticEvent, 'browser'>) => void }) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const diagnosticCallback = useRef(onDiagnostic)
  useEffect(() => { diagnosticCallback.current = onDiagnostic }, [onDiagnostic])
  const frameFailureCallback = useRef(onFrameFailure)
  useEffect(() => { frameFailureCallback.current = onFrameFailure }, [onFrameFailure])
  const [menu, setMenu] = useState<'sources' | 'episodes' | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const sourceTriggerRef = useRef<HTMLButtonElement | null>(null)
  const closeMenu = () => { setMenu(null); triggerRef.current?.focus({ preventScroll: true }) }
  const openMenu = (value: 'sources' | 'episodes', trigger: HTMLButtonElement) => { triggerRef.current = trigger; setMenu(current => current === value ? null : value) }
  const chooseSources = () => {
    if (!serverControl) return
    if (recoveryView?.phase === 'searching') onRecoveryCancel?.()
    triggerRef.current = sourceTriggerRef.current
    setMenu('sources')
  }
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<'loading' | 'loaded' | 'failed' | 'slow'>('loading')
  const stateRef = useRef(state)
  const changeFrameState = useCallback((next: typeof state) => { stateRef.current = next; setState(next) }, [])
  const failureReported = useRef(false)
  const reportFrameFailure = useCallback(() => {
    if (failureReported.current) return
    failureReported.current = true
    frameFailureCallback.current?.()
  }, [])
  const recoveryView = recovery ?? (!recoveryControlled && (state === 'failed' || state === 'slow') ? {
    phase: 'failed' as const,
    kind: 'external' as const,
    message: 'The provider player didn’t load. Try again or choose another source.',
  } : undefined)
  const statusMessage = recoveryView
    ? recoveryView.phase === 'searching' ? 'Looking for another source.' : 'Recovery options are available above.'
    : state === 'loading' ? `Connecting to ${providerName ?? 'provider'} player…`
      : state === 'failed' || state === 'slow' ? 'Recovery options are available above.'
        : audioLanguage ? `Player frame loaded. Choose ${audioLanguage === 'en' ? 'English' : 'Japanese'} audio inside the provider if needed.`
          : 'Player frame loaded. Use the provider’s controls to start and manage playback.'
  const retryWithAuto = () => {
    changeFrameState('loading')
    setAttempt(value => value + 1)
    const action = onRetryAuto ?? onFallback
    action?.()
  }
  const tryAnotherServer = () => {
    changeFrameState('loading')
    setAttempt(value => value + 1)
    onFallback?.()
  }
  const diagnosticProvider = diagnosticSource?.providerId
  const diagnosticRef = diagnosticSource?.ref
  const diagnosticsEnabled = Boolean(onDiagnostic)
  useEffect(() => {
    if (!diagnosticProvider || !diagnosticRef || !diagnosticsEnabled) return
    const adapter = createProviderFrameEvents({ src, providerId: diagnosticProvider, ref: diagnosticRef, frameWindow: () => frameRef.current?.contentWindow ?? null, report: event => diagnosticCallback.current?.(event) })
    const receive = (event: MessageEvent) => adapter.receive(event)
    window.addEventListener('message', receive)
    return () => { adapter.close(); window.removeEventListener('message', receive) }
  }, [src, attempt, diagnosticProvider, diagnosticRef, diagnosticsEnabled])
  useEffect(() => {
    failureReported.current = false
    if (stateRef.current !== 'loading') changeFrameState('loading')
    const timeout = setTimeout(() => {
      if (stateRef.current !== 'loading') return
      changeFrameState('slow')
      reportFrameFailure()
    }, 20_000)
    // Browsers can emit iframe load even when the parent CSP blocked it.
    const blocked = (event: SecurityPolicyViolationEvent) => {
      if (event.effectiveDirective === 'frame-src' && event.blockedURI && src.startsWith(event.blockedURI)) {
        changeFrameState('failed')
        reportFrameFailure()
      }
    }
    document.addEventListener('securitypolicyviolation', blocked)
    return () => { clearTimeout(timeout); document.removeEventListener('securitypolicyviolation', blocked) }
  }, [src, attempt, reportFrameFailure, changeFrameState])
  return <div className="consumit-provider-frame relative flex min-h-0 w-full flex-1 flex-col bg-black" data-provider-frame>
    <header className="consumit-external-header">
      <div className="consumit-external-context">
        {backHref ? <a aria-label="Back to title" className="consumit-external-back" href={backHref}><ArrowLeft aria-hidden="true" className="size-5" /></a> : null}
        <div className="consumit-external-brand">
          <Image className="consumit-external-mark" alt="" src="/assets/consumit-mark.svg" width={28} height={28} />
          <span>CONSUMIT <strong>WATCH</strong></span>
        </div>
        <span aria-hidden="true" className="consumit-external-divider" />
        <div className="consumit-external-heading">
          <h1>{title}</h1>
          <div className="consumit-external-meta">
            {episodeContext ? <span>{episodeContext}</span> : null}
            <span>Playback by {providerName ?? 'external provider'}</span>
            <span>Progress sync unavailable</span>
            <span>Choose next episode manually</span>
          </div>
          <p className={state === 'loading' && !recoveryView ? 'consumit-external-connection' : 'sr-only'} role="status">{statusMessage}</p>
        </div>
      </div>
      <nav aria-label="External playback" className="consumit-external-toolbar" data-has-episodes={episodePanel ? 'true' : 'false'} data-has-sources={serverControl ? 'true' : 'false'}>
        {serverControl ? <Button ref={sourceTriggerRef} aria-label="Sources" className="consumit-external-menu-button consumit-external-source-button" data-player-destination="sources" aria-expanded={menu === 'sources'} size="sm" variant="ghost" onClick={event => openMenu('sources', event.currentTarget)}>
          <Server aria-hidden="true" className="size-4" />
          <span className="consumit-external-menu-copy"><strong>Sources</strong><small aria-hidden="true">{providerName ?? 'Change server'}</small></span>
          <ChevronDown aria-hidden="true" className="consumit-external-chevron" />
        </Button> : null}
        {episodePanel ? <Button aria-label="Episodes" className="consumit-external-menu-button" data-player-destination="episodes" aria-expanded={menu === 'episodes'} size="sm" variant="ghost" onClick={event => openMenu('episodes', event.currentTarget)}>
          <ListVideo aria-hidden="true" className="size-4" />
          <span className="consumit-external-menu-copy"><strong>Episodes</strong><small aria-hidden="true">Choose episode</small></span>
          <ChevronDown aria-hidden="true" className="consumit-external-chevron" />
        </Button> : null}
        <Button aria-label="Reload player" className="consumit-external-icon-button" title="Reload player" size="sm" variant="ghost" onClick={() => { changeFrameState('loading'); setAttempt(value => value + 1) }}><RefreshCw aria-hidden="true" className="size-4" /></Button>
        <a aria-label="Open player in new tab" className="consumit-external-icon-button" title="Open player in new tab" href={src} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true" className="size-4" /></a>
      </nav>
    </header>
    {menu ? <PlayerPanel anchorSelector={`[data-player-destination="${menu}"]`} placementSide="below" size={menu === 'sources' ? 'large' : 'default'} title={menu === 'sources' ? 'Sources' : 'Episodes'} onClose={closeMenu} className={menu === 'sources' ? 'consumit-provider-source-panel' : 'consumit-episode-panel'}>
      <div className="space-y-4 p-4">{menu === 'sources' ? <>
        {serverControl}
        {onFallback ? <Button className="w-full justify-start" size="sm" variant="ghost" onClick={tryAnotherServer}><SkipForward aria-hidden="true" className="size-4" />Try another server</Button> : null}
      </> : episodePanel}</div>
    </PlayerPanel> : null}
    <div className="consumit-provider-stage relative flex min-h-0 w-full flex-1 bg-black">
      <iframe ref={frameRef} key={`${src}:${attempt}`} src={src} title={`${title} provider player`} className="consumit-provider-iframe border-0 bg-black"
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"
        onLoad={() => { if (stateRef.current !== 'failed') changeFrameState('loaded') }} onError={() => { changeFrameState('failed'); reportFrameFailure() }} />
    </div>
    {recoveryView ? <PlayerRecoveryPanel
      recovery={recoveryView}
      title={title}
      providerName={providerName}
      returnHref={backHref}
      onCancel={recoveryView.phase === 'searching' ? onRecoveryCancel : undefined}
      onChooseSource={serverControl ? chooseSources : undefined}
      onRetryAuto={recoveryView.phase === 'failed' ? retryWithAuto : undefined}
      extraAction={recoveryExtraAction}
    /> : null}
  </div>
}
