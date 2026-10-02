'use client'

import type { CatalogKind } from '@consumit/contracts'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { RatingInput } from '@consumit/ui'

import { clearMemberRating, getMemberTitleState, setMemberRating } from '@/lib/identity-browser'

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
    void getMemberTitleState({ id, kind })
      .then((state) => {
        if (!cancelled) setValue(state.rating?.value ?? null)
      })
      .catch(() => {
        if (!cancelled) setError('Your rating could not be loaded.')
      })
    return () => {
      cancelled = true
    }
  }, [session.member, id, kind])

  if (!session.member) {
    return (
      <p className="text-sm leading-6 text-white/70">
        <Link className="font-bold text-ink underline decoration-control-outline underline-offset-4 outline-none transition-colors hover:text-orange hover:decoration-orange focus-visible:ring-2 focus-visible:ring-orange" href="/sign-in">Sign in</Link> to rate {title}.
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
          {saving ? <p className="text-xs text-white/60" role="status">Saving your rating…</p> : null}
          {error ? <p className="text-xs text-orange" role="alert">{error}</p> : null}
        </div>
      ) : null}
    </div>
  )
}
