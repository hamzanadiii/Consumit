'use client'

import type { CatalogKind } from '@consumit/contracts'
import { Bookmark } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { Button, buttonVariants, cn } from '@consumit/next-ui'

import { getMemberTitleState, setMemberSaved } from '@/lib/identity-browser'

import { useSession } from '../session/session'

type SaveTitleButtonProps = {
  className?: string | undefined
  id: number
  initialSaved?: boolean | undefined
  kind: CatalogKind
  onSavedChange?: (saved: boolean) => void
  title: string
}

export function SaveTitleButton({ className, id, initialSaved = false, kind, onSavedChange, title }: SaveTitleButtonProps) {
  const session = useSession()
  const [saved, setSaved] = useState(initialSaved)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!session.member || initialSaved) return
    let cancelled = false
    void getMemberTitleState({ id, kind })
      .then((state) => {
        if (!cancelled) setSaved(state.saved)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [session.member, initialSaved, id, kind])

  if (session.status === 'loading') {
    return (
      <Button
        aria-label="Checking your account"
        className={className}
        disabled
        size="icon"
        type="button"
        variant="secondary"
      >
        <Bookmark aria-hidden="true" />
      </Button>
    )
  }

  if (!session.member) {
    return (
      <Link
        aria-label={`Sign in to save ${title} to your library`}
        className={cn(buttonVariants({ size: 'icon', variant: 'secondary' }), className)}
        href="/sign-in"
        title="Sign in to save titles"
      >
        <Bookmark aria-hidden="true" />
      </Link>
    )
  }

  async function toggle() {
    const next = !saved
    setBusy(true)
    setError(null)
    try {
      await setMemberSaved({ id, kind }, next)
      setSaved(next)
      onSavedChange?.(next)
    } catch {
      setError('The library could not be updated.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="inline-flex flex-col items-start">
      <Button
        aria-label={saved ? `Remove ${title} from library` : `Save ${title} to library`}
        aria-pressed={saved}
        className={className}
        disabled={busy}
        onClick={(e) => { e.stopPropagation(); void toggle(); }}
        size="icon"
        type="button"
        variant="secondary"
      >
        <Bookmark aria-hidden="true" className={saved ? 'fill-current' : ''} />
      </Button>
      {error ? <span className="sr-only" role="alert">{error}</span> : null}
    </span>
  )
}
