'use client'

import type { CatalogKind } from '@consumit/contracts'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { Button, RatingInput } from '@consumit/ui'

import { clearMemberRating, getMemberTitleState, setMemberRating } from '@/lib/identity-browser'

import { useSession } from '../session/session'

type RatingWidgetProps = {
  id: number
  kind: CatalogKind
  title: string
}

export function RatingWidget({ id, kind, title }: RatingWidgetProps) {
  const session = useSession()
  const identity = session.member ? `${session.member.id}:${kind}:${id}` : null
  const [value, setValue] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [loadedIdentity, setLoadedIdentity] = useState<string | null>(null)
  const [retryingLoad, setRetryingLoad] = useState(false)
  const [retry, setRetry] = useState<{ kind: 'load' } | { kind: 'save'; value: number | null } | null>(null)
  const loading = identity !== null && (loadedIdentity !== identity || retryingLoad)

  useEffect(() => {
    if (!session.member) return
    let cancelled = false
    void getMemberTitleState({ id, kind })
      .then((state) => {
        if (!cancelled) {
          setValue(state.rating?.value ?? null)
          setLoadedIdentity(identity)
          setError(null)
          setRetry(null)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadedIdentity(identity)
          setError('Your rating could not be loaded.')
          setRetry({ kind: 'load' })
        }
      })
      .finally(() => { if (!cancelled) setRetryingLoad(false) })
    return () => {
      cancelled = true
    }
  }, [session.member, id, kind, loadAttempt, identity])

  if (!session.member) {
    return (
      <p className="text-sm leading-6 text-[var(--fs-secondary)]">
        <Link className="inline-flex min-h-11 items-center font-bold text-ink underline decoration-control-outline underline-offset-4 outline-none transition-colors hover:text-orange hover:decoration-orange focus-visible:ring-2 focus-visible:ring-orange" href="/sign-in">Sign in</Link> to rate {title}.
      </p>
    )
  }

  async function rate(next: number | null) {
    if (loading || saving || retry?.kind === 'load') return
    setSaving(true)
    setError(null)
    setRetry(null)
    try {
      if (next === null) {
        await clearMemberRating({ id, kind })
      } else {
        await setMemberRating({ id, kind }, next)
      }
      setValue(next)
    } catch {
      setError('We could not confirm your rating.')
      setRetry({ kind: 'save', value: next })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div aria-busy={loading || saving}>
      {loading ? <p className="mb-2 text-xs text-[var(--fs-muted)]" role="status">Loading your rating…</p> : null}
      <RatingInput
        disabled={loading || saving || retry !== null}
        label={`Rate ${title} out of 5 stars`}
        name={`rating-${kind}-${id}`}
        onChange={(next) => void rate(next)}
        value={value}
      />
      {saving || error ? (
        <div className="mt-3 flex min-h-6 flex-wrap items-center gap-4">
          {saving ? <p className="text-xs text-white/60" role="status">Saving your rating…</p> : null}
          {error ? <p className="text-xs text-orange" role="alert">{error}</p> : null}
          {retry ? <Button className="min-h-[44px]" disabled={loading || saving} onClick={() => {
            if (retry.kind === 'load') { setRetryingLoad(true); setError(null); setLoadAttempt(attempt => attempt + 1) }
            else void rate(retry.value)
          }} size="sm" variant="ghost">Retry {retry.kind === 'load' ? 'rating' : 'save'}</Button> : null}
        </div>
      ) : null}
    </div>
  )
}
