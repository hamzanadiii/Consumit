'use client'

import { useEffect, useRef, useState } from 'react'
import { useSession } from '../session/session'
import { markNotificationRead } from '@/lib/releases-browser'

export function useNotificationActions(refresh: () => void, navigate: (href: string) => void) {
  const { member } = useSession(), owner = member?.id
  const controller = useRef<AbortController | null>(null)
  const [state, setState] = useState<{ owner?: string | undefined; busy: boolean; error?: string; attempted?: { id?: string; href?: string } } | null>(null)
  useEffect(() => () => controller.current?.abort(), [owner])
  async function read(id?: string, href?: string) {
    if (!owner || (state?.owner === owner && state.busy)) return
    controller.current?.abort()
    const next = new AbortController()
    controller.current = next
    setState({ owner, busy: true })
    try {
      await markNotificationRead(id, next.signal)
      if (next.signal.aborted) return
      setState({ owner, busy: false }); refresh()
      if (href) navigate(href)
    } catch {
      if (!next.signal.aborted) setState({ owner, busy: false, error: 'Could not mark notifications read. Try again.', attempted: { ...(id ? { id } : {}), ...(href ? { href } : {}) } })
    }
  }
  const current = state?.owner === owner ? state : null
  return { busy: Boolean(current?.busy), error: current?.error, read,
    retry: () => { if (current?.attempted) void read(current.attempted.id, current.attempted.href) } }
}
