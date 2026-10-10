'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSession } from '../session/session'

export function useReleaseResource<T>(load: (signal: AbortSignal) => Promise<T>, key = '', poll = false) {
  const { member } = useSession(), owner = member?.id ?? null
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<{ owner: string; key: string; data?: T; error?: string; loading: boolean } | null>(null)
  const refresh = useCallback(() => setRevision(value => value + 1), [])
  useEffect(() => {
    const controller = new AbortController()
    if (!owner) {
      queueMicrotask(() => { if (!controller.signal.aborted) setResult(null) })
      return () => controller.abort()
    }
    queueMicrotask(() => { if (!controller.signal.aborted) setResult(prior => ({ owner, key, ...(prior?.owner === owner && prior.key === key && prior.data ? { data: prior.data } : {}), loading: true })) })
    void load(controller.signal).then(data => {
      if (!controller.signal.aborted) setResult({ owner, key, data, loading: false })
    }, error => {
      if (!controller.signal.aborted) setResult(prior => ({ owner, key, ...(prior?.owner === owner && prior.key === key && prior.data ? { data: prior.data } : {}),
        error: error instanceof Error ? error.message : 'Episode updates could not be loaded. Try again.', loading: false }))
    })
    return () => controller.abort()
  }, [owner, key, load, revision])
  useEffect(() => {
    if (!owner || !poll) return
    const visibleRefresh = () => { if (document.visibilityState === 'visible') refresh() }
    const timer = window.setInterval(visibleRefresh, 60_000)
    window.addEventListener('focus', visibleRefresh)
    document.addEventListener('visibilitychange', visibleRefresh)
    window.addEventListener('consumit-notifications-changed', visibleRefresh)
    return () => {
      clearInterval(timer); window.removeEventListener('focus', visibleRefresh)
      document.removeEventListener('visibilitychange', visibleRefresh); window.removeEventListener('consumit-notifications-changed', visibleRefresh)
    }
  }, [owner, poll, refresh])
  const current = result?.owner === owner && result.key === key ? result : null
  return { member, data: current?.data, error: current?.error, loading: Boolean(owner && (!current || current.loading)), refresh }
}
