'use client'

import type { CatalogKind } from '@consumit/contracts'
import { Bookmark } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { Button, buttonVariants } from '@consumit/ui'

import { getCachedMemberLibrary, replaceCachedMemberLibrary, setMemberSaved } from '@/lib/identity-browser'

import { useSession } from '../session/session'

type SaveTitleButtonProps = {
  className?: string | undefined
  id: number
  initialSaved?: boolean | undefined
  kind: CatalogKind
  title: string
}

export function SaveTitleButton({ className, id, initialSaved = false, kind, title }: SaveTitleButtonProps) {
  const session = useSession()
  const [saved, setSaved] = useState(initialSaved)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!session.member || initialSaved) return
    let cancelled = false
    void getCachedMemberLibrary(session.member.id)
      .then((library) => {
        if (!cancelled) setSaved(library.saved.some((entry) => entry.kind === kind && entry.id === id))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [session.member, initialSaved, id, kind])

  if (!session.member) {
    return (
      <Link
        aria-label={`Sign in to save ${title} to your library`}
        className={buttonVariants({ className, size: 'icon', variant: 'secondary' })}
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
      const library = await setMemberSaved({ id, kind }, next)
      if (session.member) replaceCachedMemberLibrary(session.member.id, library)
      setSaved(next)
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
        onClick={() => void toggle()}
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
