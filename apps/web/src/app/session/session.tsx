'use client'

import type { SafeMember } from '@consumit/contracts'
import { createContext, type ReactNode, useContext, useMemo, useState } from 'react'

type SessionContextValue = {
  clearMember(): void
  member: SafeMember | null
  setMember(member: SafeMember): void
  status: 'anonymous' | 'authenticated' | 'unavailable'
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children, initialMember = null, initialStatus = 'anonymous' }: {
  children: ReactNode
  initialMember?: SafeMember | null
  initialStatus?: SessionContextValue['status']
}) {
  const [member, setMemberState] = useState(initialMember)
  const [status, setStatus] = useState<SessionContextValue['status']>(initialStatus)
  const value = useMemo(() => ({
    clearMember() {
      setMemberState(null)
      setStatus('anonymous')
    },
    member,
    setMember(next: SafeMember) {
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
