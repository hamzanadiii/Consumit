'use client'

import Image from 'next/image'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import type { FrameDiagnosticEvent, PlaybackRef } from '@consumit/contracts'
import { createProviderFrameEvents } from '@/lib/provider-frame-events'
import { Button, PlayerPanel, buttonVariants } from '@consumit/ui'
import { ExternalLink, ArrowLeft, ListVideo, Server, MonitorPlay, RefreshCw, SkipForward } from 'lucide-react'

/** A validated provider page; loading the document never establishes playback.
 *  All configured provider players use plain iframes under ADR 0006. */
export function ProviderFrame({ src, title, audioLanguage, onFallback, serverControl, backHref, episodePanel, diagnosticSource, onDiagnostic }: { src: string; title: string; audioLanguage?: string | undefined; onFallback?: (() => void) | undefined; serverControl?: ReactNode; backHref?: string | undefined; episodePanel?: ReactNode; diagnosticSource?: { providerId: string; ref: PlaybackRef }; onDiagnostic?: (event: Omit<FrameDiagnosticEvent, 'browser'>) => void }) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const diagnosticCallback = useRef(onDiagnostic)
  useEffect(() => { diagnosticCallback.current = onDiagnostic }, [onDiagnostic])
  const [menu, setMenu] = useState<'sources' | 'episodes' | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const closeMenu = () => { setMenu(null); triggerRef.current?.focus({ preventScroll: true }) }
  const openMenu = (value: 'sources' | 'episodes', trigger: HTMLButtonElement) => { triggerRef.current = trigger; setMenu(current => current === value ? null : value) }
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<'loading' | 'loaded' | 'failed' | 'slow'>('loading')
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
    const timeout = setTimeout(() => setState(current => current === 'loading' ? 'slow' : current), 20_000)
    // Browsers can emit iframe load even when the parent CSP blocked it.
    const blocked = (event: SecurityPolicyViolationEvent) => {
      if (event.effectiveDirective === 'frame-src' && event.blockedURI && src.startsWith(event.blockedURI)) setState('failed')
    }
    document.addEventListener('securitypolicyviolation', blocked)
    return () => { clearTimeout(timeout); document.removeEventListener('securitypolicyviolation', blocked) }
  }, [src, attempt])
  return <div className="consumit-provider-frame flex min-h-0 w-full flex-1 flex-col bg-black" data-provider-frame>
    <header className="consumit-external-header">
      {backHref ? <a aria-label="Back" href={backHref}><ArrowLeft aria-hidden="true" className="size-5" /></a> : null}
      <div className="consumit-external-heading min-w-0 flex-1">
        <p className="consumit-external-eyebrow"><MonitorPlay aria-hidden="true" className="size-3.5" />External player</p>
        <h1 className="truncate">{title}</h1>
      </div>
      <Image className="consumit-external-mark" alt="Consumit" src="/assets/consumit-mark.svg" width={34} height={34} />
    </header>
    {menu ? <PlayerPanel anchorSelector={`[data-player-destination="${menu}"]`} title={menu === 'sources' ? 'Sources' : 'Episodes'} onClose={closeMenu} className={menu === 'episodes' ? 'consumit-episode-panel' : undefined}>
      <div className="space-y-4 p-4">{menu === 'sources' ? serverControl : episodePanel}</div>
    </PlayerPanel> : null}
    <iframe ref={frameRef} key={`${src}:${attempt}`} src={src} title={`${title} external player`} className="aspect-video h-auto min-h-0 w-full flex-1 border-0 bg-black"
      allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"
      onLoad={() => setState(current => current === 'failed' ? current : 'loaded')} onError={() => setState('failed')} />
    <section className="consumit-external-deck shrink-0 text-copy" aria-label="External player controls">
      <div className="consumit-external-guidance">
        <div className="consumit-external-status-line">
          <span className={`consumit-external-status-dot consumit-external-status-${state}`} aria-hidden="true" />
          <p role="status">{state === 'loading' ? 'Loading external player…' : state === 'failed' || state === 'slow' ? 'The external player hasn’t loaded. Reload or choose another server.' : audioLanguage ? `Choose ${audioLanguage === 'en' ? 'English' : 'Japanese'} audio inside the player.` : 'Audio and subtitles are controlled inside the player.'}</p>
        </div>
        <div className="consumit-external-limitations">
          <span>Progress sync unavailable</span>
          <span>Automatic next episode unavailable</span>
        </div>
      </div>
      <div className="consumit-external-actions">
        {serverControl ? <Button data-player-destination="sources" aria-expanded={menu === 'sources'} size="sm" variant="ghost" onClick={event => openMenu('sources', event.currentTarget)}><Server aria-hidden="true" className="size-4" />Sources</Button> : null}
        {episodePanel ? <Button data-player-destination="episodes" aria-expanded={menu === 'episodes'} size="sm" variant="ghost" onClick={event => openMenu('episodes', event.currentTarget)}><ListVideo aria-hidden="true" className="size-4" />Episodes</Button> : null}
        <Button aria-label="Reload player" size="sm" variant="ghost" onClick={() => { setState('loading'); setAttempt(value => value + 1) }}><RefreshCw aria-hidden="true" className="size-4" />Reload</Button>
        {onFallback ? <Button size="sm" variant="secondary" onClick={onFallback}><SkipForward aria-hidden="true" className="size-4" />Try another server</Button> : null}
        <a aria-label="Open player in new tab" className={`${buttonVariants({ size: 'sm', variant: 'ghost' })} consumit-external-new-tab min-h-11 px-2 text-copy`} href={src} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true" className="size-4" /><span>Open in new tab</span></a>
      </div>
    </section>
  </div>
}
