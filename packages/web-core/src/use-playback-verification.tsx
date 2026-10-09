"use client"
import { useCallback, useEffect, useRef, useState } from 'react'
type Widget = { render(node: HTMLElement, options: { sitekey: string; action: string; callback(token: string): void; 'error-callback'(): void; 'expired-callback'(): void }): string; remove(id: string): void }
declare global { interface Window { turnstile?: Widget } }
let loading: Promise<void> | undefined
function loadWidget(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  if (!loading) loading = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => { script.remove(); loading = undefined; reject(new Error('Browser verification could not load. Try again.')) }
    document.head.append(script)
  })
  return loading
}
export function usePlaybackVerification() {
  const [active, setActive] = useState(false)
  const node = useRef<HTMLDivElement>(null)
  const pending = useRef<{ resolve(token: string): void; reject(error: Error): void } | null>(null)
  const verify = useCallback((signal: AbortSignal): Promise<string> => new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error('Playback cancelled.')); return }
    pending.current?.reject(new Error('Verification replaced.'))
    const settle = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); pending.current = null; setActive(false) }
    const abort = () => { settle(); reject(new Error('Browser verification cancelled. Try again.')) }
    const timer = setTimeout(abort, 120000)
    pending.current = { resolve: token => { settle(); resolve(token) }, reject: error => { settle(); reject(error) } }
    signal.addEventListener('abort', abort, { once: true })
    setActive(true)
  }), [])
  useEffect(() => {
    if (!active) return
    let cancelled = false, widget: string | undefined
    void loadWidget().then(() => {
      if (cancelled || !node.current) return
      const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
      if (!sitekey || !window.turnstile) throw new Error('Browser verification is unavailable. Try again later.')
      widget = window.turnstile.render(node.current, {
        sitekey, action: 'playback', callback: token => pending.current?.resolve(token),
        'error-callback': () => pending.current?.reject(new Error('Browser verification failed. Try again.')),
        'expired-callback': () => pending.current?.reject(new Error('Browser verification expired. Try again.')),
      })
    }).catch(error => { if (!cancelled) pending.current?.reject(error instanceof Error ? error : new Error('Browser verification failed.')) })
    return () => { cancelled = true; if (widget) window.turnstile?.remove(widget) }
  }, [active])
  useEffect(() => () => pending.current?.reject(new Error('Playback cancelled.')), [])
  const verificationPanel = active ? <div role="dialog" aria-modal="true" aria-label="Browser verification" className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/95 p-6 text-ink">
    <p role="status">Verify your browser to start playback.</p><div ref={node} />
    <button type="button" className="min-h-11 rounded-control border border-border px-4 focus-visible:outline-2" onClick={() => pending.current?.reject(new Error('Browser verification cancelled. Try again.'))}>Cancel</button>
  </div> : null
  return { verify, verificationPanel }
}
