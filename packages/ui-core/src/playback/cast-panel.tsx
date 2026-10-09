'use client'
import { useEffect, useState } from 'react'
import { Cast, Loader2 } from 'lucide-react'

export type CastCheckResult = 'ready' | 'unconfigured' | 'unavailable'

/** Discovery never opens Google's device picker without an explicit click. */
export function CastPanel({ available, onCheck, onConnect }: {
  available: boolean
  onCheck?: (() => Promise<CastCheckResult>) | undefined
  onConnect?: (() => void) | undefined
}) {
  const [result, setResult] = useState<CastCheckResult>(onConnect ? 'unavailable' : 'unconfigured')
  const [checking, setChecking] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!onCheck) return
    let cancelled = false
    setChecking(true)
    void onCheck().then((next) => { if (!cancelled) setResult(next) }, () => {
      if (!cancelled) setResult('unavailable')
    }).finally(() => { if (!cancelled) setChecking(false) })
    return () => { cancelled = true }
  }, [onCheck, attempt])
  const ready = available || result === 'ready'
  return <div className="consumit-player-cast-panel">
    <div className="consumit-player-cast-status" role="status">
      {checking ? <Loader2 aria-hidden="true" className="size-5 animate-spin motion-reduce:animate-none" /> : <Cast aria-hidden="true" className="size-5" strokeWidth={1.75} />}
      <span>{checking ? 'Checking for TVs…' : available ? 'A TV is available' : ready ? 'Choose a TV to connect' : result === 'unconfigured' ? 'TV casting is being set up. Please try again later.' : 'Casting is unavailable in this browser.'}</span>
    </div>
    <p>Use Chrome and connect your Chromecast or Google TV to the same Wi-Fi network. Your place in the movie stays with you.</p>
    {ready && onConnect ? <button className="consumit-player-cast-action" type="button" onClick={onConnect}>Choose TV</button> : null}
    {onCheck ? <button className="consumit-player-cast-recheck" type="button" disabled={checking} onClick={() => setAttempt((value) => value + 1)}>{checking ? 'Checking…' : 'Check again'}</button> : null}
  </div>
}
