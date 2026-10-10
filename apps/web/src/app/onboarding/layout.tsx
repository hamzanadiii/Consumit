import type { ReactNode } from 'react'
import { getServerSession } from '@/lib/identity-server'
import { SessionProvider } from '../session/session'
import { ReducedThemeScope } from '../shared/reduced-theme-scope'
export default async function GuideLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession()
  return <SessionProvider key={`${session.status}:${session.member?.id ?? 'guest'}`} initialMember={session.member} initialStatus={session.status === 'unavailable' ? 'loading' : session.status}><ReducedThemeScope>{children}</ReducedThemeScope></SessionProvider>
}
