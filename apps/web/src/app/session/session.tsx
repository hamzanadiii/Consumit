'use client'

import type { SafeMember } from '@consumit/contracts'
import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react'

import { getCurrentMember } from '@/lib/identity-browser'

type SessionContextValue = {
  clearMember(): void
  member: SafeMember | null
  setMember(member: SafeMember): void
  status: 'loading' | 'anonymous' | 'authenticated' | 'unavailable'
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children, initialMember = null, initialStatus = 'anonymous' }: {
  children: ReactNode
  initialMember?: SafeMember | null
  initialStatus?: SessionContextValue['status']
}) {
  const [member, setMemberState] = useState(initialMember)
  const [status, setStatus] = useState<SessionContextValue['status']>(initialStatus)
  const revision = useRef(0)

  useEffect(() => {
    if (initialStatus !== 'loading') return
    // Watch pages seed a nested provider from the server session before the
    // player auto-starts, so this root lookup would be an unused extra request.
    if (window.location.pathname === '/watch' || window.location.pathname.startsWith('/watch/')) return
    const controller = new AbortController()
    const startedAtRevision = revision.current
    void getCurrentMember(controller.signal).then(
      (nextMember) => {
        if (controller.signal.aborted || revision.current !== startedAtRevision) return
        setMemberState(nextMember)
        setStatus(nextMember ? 'authenticated' : 'anonymous')
      },
      () => {
        if (controller.signal.aborted || revision.current !== startedAtRevision) return
        setMemberState(null)
        setStatus('unavailable')
      },
    )
    return () => controller.abort()
  }, [initialStatus])

  const value = useMemo(() => ({
    clearMember() {
      revision.current += 1
      setMemberState(null)
      setStatus('anonymous')
    },
    member,
    setMember(next: SafeMember) {
      revision.current += 1
      setMemberState(next)
      setStatus('authenticated')
    },
    status,
  }), [member, status])
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession must be used inside SessionProvider.')
  return session
}
