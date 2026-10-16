import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { ReleaseProbe } from './probe'

export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false, follow: false } }
export default async function ProbePage() {
  const incoming = await headers()
  const id = incoming.get('x-consumit-check-id'), leaseToken = incoming.get('x-consumit-check-token')
  if (!id || !leaseToken) notFound()
  const response = await fetch(`${(process.env.CONSUMIT_API_URL ?? 'http://127.0.0.1:3001').replace(/\/$/, '')}/v1/internal/releases/authorize`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, leaseToken }), cache: 'no-store', signal: AbortSignal.timeout(5000),
  }).catch(() => null)
  if (!response?.ok) notFound()
  return <ReleaseProbe />
}
