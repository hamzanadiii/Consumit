'use client'

import { type ReactNode, useEffect, useState } from 'react'
import type { FrameSandbox } from '@consumit/contracts'
import { Button, buttonVariants } from '@consumit/ui'
import { ExternalLink, MonitorPlay, RefreshCw, SkipForward } from 'lucide-react'

/** Standard frame sandbox: scripts, same-origin, forms and presentation.
 *  Popup and top-navigation permissions stay withheld. */
const RESTRICTED_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-presentation'

/** A validated provider page; loading the document never establishes playback.
 *  A source that declares `frameSandbox: 'none'` runs as a plain iframe
 *  because its published player refuses any sandboxed frame (ADR 0006). */
export function ProviderFrame({ src, title, audioLanguage, frameSandbox, onFallback, serverControl }: { src: string; title: string; audioLanguage?: string | undefined; frameSandbox?: FrameSandbox | undefined; onFallback?: (() => void) | undefined; serverControl?: ReactNode }) {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<'loading' | 'loaded' | 'failed' | 'slow'>('loading')
  useEffect(() => {
    const timeout = setTimeout(() => setState(current => current === 'loading' ? 'slow' : current), 20_000)
    return () => clearTimeout(timeout)
  }, [src, attempt])
  return <div className="flex min-h-0 w-full flex-1 flex-col bg-black" data-provider-frame>
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-white/10 bg-surface px-3 py-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-2 text-sm font-bold text-ink"><MonitorPlay aria-hidden="true" className="size-4 shrink-0 text-copy" />External player</div>
      <div className="flex min-w-0 flex-wrap items-center gap-2 max-sm:w-full">
        {serverControl}
        <Button aria-label="Reload player" className="min-h-11 min-w-11 px-3" size="sm" variant="ghost" onClick={() => { setState('loading'); setAttempt(value => value + 1) }}><RefreshCw aria-hidden="true" className="size-4" /><span className="hidden sm:inline">Reload</span></Button>
        {onFallback ? <Button className="min-h-11" size="sm" variant="secondary" onClick={onFallback}><SkipForward aria-hidden="true" className="size-4" />Try another server</Button> : null}
      </div>
    </div>
    <iframe key={`${src}:${attempt}`} src={src} title={`${title} external player`} className="aspect-video h-auto min-h-0 w-full flex-1 border-0 bg-black"
      {...(frameSandbox === 'none' ? {} : { sandbox: RESTRICTED_SANDBOX })} allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"
      onLoad={() => setState('loaded')} onError={() => setState('failed')} />
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-white/10 bg-surface px-3 py-3 text-xs leading-5 text-copy sm:px-4">
      <div className="max-w-prose">
        <p role="status">{state === 'loading' ? 'Loading external player…' : state === 'failed' || state === 'slow' ? 'The external player hasn’t loaded. Reload or choose another server.' : audioLanguage ? `Choose ${audioLanguage === 'en' ? 'English' : 'Japanese'} audio inside. Progress sync is unavailable.` : 'Use this player’s audio and subtitle controls. Progress sync is unavailable.'}</p>
        <p className="mt-1 text-muted">{state !== 'loaded' ? 'Audio and subtitles use the external player’s controls. ' : ''}Automatic next episode is unavailable.</p>
      </div>
      <a className={`${buttonVariants({ size: 'sm', variant: 'ghost' })} min-h-11 px-2 text-copy`} href={src} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true" className="size-4" />Open player in new tab</a>
    </div>
  </div>
}
