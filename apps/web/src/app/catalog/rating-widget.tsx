'use client'

import type { CatalogKind } from '@consumit/contracts'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { RatingInput } from '@consumit/ui'

import { clearMemberRating, getMemberRating, IdentityApiError, setMemberRating } from '@/lib/identity-browser'

import { useSession } from '../session/session'

type RatingWidgetProps = {
  id: number
  kind: CatalogKind
  title: string
}

export function RatingWidget({ id, kind, title }: RatingWidgetProps) {
  const session = useSession()
  const [value, setValue] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!session.member) return
    let cancelled = false
    void getMemberRating({ id, kind })
      .then((rating) => {
        if (!cancelled) setValue(rating.value)
      })
      .catch((cause) => {
        if (!cancelled && (!(cause instanceof IdentityApiError) || cause.status !== 404)) {
          setError('Your rating could not be loaded.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [session.member, id, kind])

  if (!session.member) {
    return (
      <p className="text-sm text-muted">
        <Link className="font-bold text-ink hover:text-orange" href="/sign-in">Sign in</Link> to rate {title}.
      </p>
    )
  }

  async function rate(next: number | null) {
    setSaving(true)
    setError(null)
    try {
      if (next === null) {
        await clearMemberRating({ id, kind })
      } else {
        await setMemberRating({ id, kind }, next)
      }
      setValue(next)
    } catch {
      setError('Your rating could not be saved. Please retry.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <RatingInput
        label={`Rate ${title} out of 10`}
        name={`rating-${kind}-${id}`}
        onChange={(next) => void rate(next)}
        value={value}
      />
      {saving || error ? (
        <div className="mt-3 flex min-h-6 flex-wrap items-center gap-4">
          {saving ? <p className="text-xs text-muted" role="status">Saving your rating…</p> : null}
          {error ? <p className="text-xs text-orange" role="alert">{error}</p> : null}
        </div>
      ) : null}
    </div>
  )
}
