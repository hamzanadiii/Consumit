'use client'

import { Button } from '@consumit/ui'
import Link from 'next/link'
import { useState } from 'react'
import { removeSavedMemberList, saveMemberList } from '@/lib/identity-browser'

export function ListShareActions({ listId, slug, isOwner, signedIn, saved }: {
  listId: string
  slug: string
  isOwner: boolean
  signedIn: boolean
  saved: boolean
}) {
  const [isSaved, setIsSaved] = useState(saved)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)

  async function share() {
    const url = `${window.location.origin}/lists/${encodeURIComponent(slug)}`
    setMessage('')
    setError(false)
    try {
      if (navigator.share) await navigator.share({ title: 'Consumit list', url })
      else { await navigator.clipboard.writeText(url); setMessage('List link copied.') }
    } catch (cause) {
      if (cause instanceof Error && cause.name === 'AbortError') return
      setError(true)
      setMessage('The link could not be shared. Copy the page address to share it.')
    }
  }

  async function toggleSaved() {
    if (busy) return
    setBusy(true); setMessage(''); setError(false)
    try {
      if (isSaved) await removeSavedMemberList(listId)
      else await saveMemberList(slug)
      setIsSaved(!isSaved)
      setMessage(isSaved ? 'Removed from Saved Lists.' : 'Saved to your Lists archive.')
    } catch {
      setError(true)
      setMessage('This list could not be saved. It may no longer be public.')
    } finally { setBusy(false) }
  }

  return <div className="mt-6 flex flex-wrap items-center gap-3">
    <Button onClick={() => void share()} variant="secondary">Share list</Button>
    {!isOwner ? signedIn
      ? <Button disabled={busy} onClick={() => void toggleSaved()} variant={isSaved ? 'ghost' : 'primary'}>{busy ? 'Saving…' : isSaved ? 'Remove saved list' : 'Save list'}</Button>
      : <Link className="inline-flex min-h-11 items-center rounded-control border border-[var(--fs-field-border)] px-4 text-sm font-bold text-[var(--fs-ink)] hover:border-[var(--fs-accent)]" href={`/sign-in?next=${encodeURIComponent(`/lists/${slug}`)}`}>Sign in to save</Link>
      : null}
    {message ? <p className={`basis-full text-xs ${error ? 'text-[var(--fs-danger)]' : 'text-[var(--fs-muted)]'}`} role={error ? 'alert' : 'status'}>{message}</p> : null}
  </div>
}
