'use client'

import { useEffect, useState } from 'react'
import type { FrameSandbox } from '@consumit/contracts'
import { Button, buttonVariants } from '@consumit/ui'
import { ExternalLink } from 'lucide-react'

/** Standard frame sandbox: scripts, same-origin, forms and presentation.
 *  Popup and top-navigation permissions stay withheld. */
const RESTRICTED_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-presentation'

/** A validated provider page; loading the document never establishes playback.
 *  A source that declares `frameSandbox: 'none'` runs as a plain iframe
 *  because its published player refuses any sandboxed frame (ADR 0006). */
export function ProviderFrame({ src, title, audioLanguage, frameSandbox, onFallback }: { src: string; title: string; audioLanguage?: string | undefined; frameSandbox?: FrameSandbox | undefined; onFallback?: (() => void) | undefined }) {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<'loading' | 'loaded' | 'failed' | 'slow'>('loading')
  useEffect(() => {
    const timeout = setTimeout(() => setState(current => current === 'loading' ? 'slow' : current), 20_000)
    return () => clearTimeout(timeout)
  }, [src, attempt])
  return <div className="flex min-h-0 w-full flex-1 flex-col bg-black" data-provider-frame>
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2 text-xs text-white/80">
      <p role="status">{state === 'loading' ? 'Loading external player…' : state === 'failed' || state === 'slow' ? 'The external player hasn’t loaded. Reload or choose another server.' : `External player · ${audioLanguage ? `Choose ${audioLanguage === 'en' ? 'English' : 'Japanese'} audio inside. ` : 'Audio and subtitles are controlled inside. '}Progress sync is unavailable.`}</p>
      <div className="flex max-w-full flex-wrap gap-2">
        <Button size="sm" variant="ghost" onClick={() => { setState('loading'); setAttempt(value => value + 1) }}>Reload player</Button>
        {onFallback ? <Button size="sm" variant="ghost" onClick={onFallback}>Try another server</Button> : null}
        <a className={buttonVariants({ size: 'sm', variant: 'ghost' })} href={src} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true" className="size-4" />Open player in new tab</a>
      </div>
    </div>
    <iframe key={`${src}:${attempt}`} src={src} title={`${title} external player`} className="min-h-0 w-full flex-1 border-0 bg-black" style={{ minHeight: 'min(56vw, 240px)' }}
      {...(frameSandbox === 'none' ? {} : { sandbox: RESTRICTED_SANDBOX })} allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"
      onLoad={() => setState('loaded')} onError={() => setState('failed')} />
  </div>
}
