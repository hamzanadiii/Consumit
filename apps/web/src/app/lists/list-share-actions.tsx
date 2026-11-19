'use client'

import { Button } from '@consumit/ui'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { MemberListVisibility } from '@consumit/contracts'
import { duplicateMemberList, removeSavedMemberList, saveMemberList } from '@/lib/identity-browser'
import { ShareSheet } from '../shared/share-sheet'
import { useSession } from '../session/session'
import { errorText } from '../taste/api'

export function ListShareActions({ listId, name, slug, visibility, isOwner, signedIn, saved, hideShare = false }: {
  listId: string
  name: string
  slug: string
  visibility: MemberListVisibility
  isOwner: boolean
  signedIn: boolean
  saved: boolean
  hideShare?: boolean
}) {
  const router = useRouter()
  const session = useSession()
  const [isSaved, setIsSaved] = useState(saved)
  const [busy, setBusy] = useState(false)
  const bookmarkPending = useRef(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [copyOpen, setCopyOpen] = useState(false)
  const [copyName, setCopyName] = useState(() => `${name} (copy)`.slice(0, 120))
  const [copyVisibility, setCopyVisibility] = useState<MemberListVisibility>('private')
  const [copyError, setCopyError] = useState('')
  const copyFormId = useId()
  const copyNameInput = useRef<HTMLInputElement>(null)
  const copyTrigger = useRef<HTMLButtonElement>(null)
  const duplicatePending = useRef(false)
  const duplicateAttempt = useRef<{ idempotencyKey: string; name: string; visibility: MemberListVisibility } | null>(null)
  useEffect(() => { if (copyOpen) copyNameInput.current?.focus() }, [copyOpen])
  const handledReturnAction = useRef(false)

  const toggleSaved = useCallback(async () => {
    if (bookmarkPending.current) return
    bookmarkPending.current = true
    setBusy(true); setMessage(''); setError(false)
    try {
      if (isSaved) await removeSavedMemberList(listId)
      else await saveMemberList(slug)
      setIsSaved(!isSaved)
      setMessage(isSaved ? 'Removed from Saved Lists.' : 'Saved link to your Lists archive.')
    } catch (cause) {
      setError(true)
      setMessage(errorText(cause))
    } finally { bookmarkPending.current = false; setBusy(false) }
  }, [isSaved, listId, slug])

  async function duplicate() {
    if (duplicatePending.current || !copyName.trim()) return
    duplicatePending.current = true
    setDuplicating(true); setCopyError('')
    try {
      const input = duplicateAttempt.current ?? { idempotencyKey: crypto.randomUUID(), name: copyName.trim(), visibility: copyVisibility }
      duplicateAttempt.current = input
      const copy = await duplicateMemberList(slug, input)
      router.push(`/lists/${copy.list.slug}/edit`)
      router.refresh()
    } catch (cause) {
      setCopyError(errorText(cause)); duplicatePending.current = false; setDuplicating(false)
    }
  }

  useEffect(() => {
    if (!signedIn || handledReturnAction.current) return
    const url = new URL(window.location.href)
    const action = url.searchParams.get('consumitAction')
    if (action !== 'duplicate' && action !== 'save') return
    const timer = window.setTimeout(() => {
      handledReturnAction.current = true
      url.searchParams.delete('consumitAction')
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
      if (action === 'duplicate' && visibility === 'public') setCopyOpen(true)
      if (action === 'save' && !isOwner && !isSaved) void toggleSaved()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [isOwner, isSaved, signedIn, toggleSaved, visibility])

  return <div className="mt-6 flex flex-wrap items-center gap-3">
    {!hideShare ? <ShareSheet description="A collection of films and series, kept in a deliberate order." title={name} triggerLabel="Share list" url={`/lists/${encodeURIComponent(slug)}`} /> : null}
    {visibility === 'public' ? signedIn ? <Button aria-controls={copyFormId} aria-expanded={copyOpen} disabled={duplicating} onClick={() => setCopyOpen(true)} ref={copyTrigger} variant="ghost">Duplicate list</Button> : <Link className="inline-flex min-h-11 items-center rounded-control px-3 text-sm font-bold text-[var(--fs-ink)] underline decoration-[var(--fs-field-border)] underline-offset-4 hover:text-[var(--fs-accent)]" href={`/sign-in?next=${encodeURIComponent(`/lists/${slug}?consumitAction=duplicate`)}`}>Sign in to duplicate</Link> : null}
    {!isOwner ? signedIn
      ? <Button disabled={busy} onClick={() => void toggleSaved()} variant={isSaved ? 'ghost' : 'primary'}>{busy ? isSaved ? 'Removing…' : 'Saving…' : isSaved ? 'Remove saved list' : 'Save list'}</Button>
      : <Link className="inline-flex min-h-11 items-center rounded-control border border-[var(--fs-field-border)] px-4 text-sm font-bold text-[var(--fs-ink)] hover:border-[var(--fs-accent)]" href={`/sign-in?next=${encodeURIComponent(`/lists/${slug}?consumitAction=save`)}`}>Sign in to save</Link>
      : null}
    {!isOwner && signedIn && isSaved && !busy ? <Link className="inline-flex min-h-11 items-center rounded-control px-3 text-sm font-bold text-[var(--fs-ink)] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-[var(--fs-focus)]" href={session.member ? `/profile/${encodeURIComponent(session.member.username)}/lists#saved-lists` : '/lists#saved-lists'}>View saved lists</Link> : null}
    {copyOpen ? <form aria-label="Make your own copy" aria-busy={duplicating} className="grid basis-full w-full max-w-xl gap-4 border-y border-[var(--fs-line)] py-5" id={copyFormId} onSubmit={event => { event.preventDefault(); void duplicate() }}>
      <h3 className="mb-3 text-xl">Make your own copy</h3>
      <p className="mb-4 text-sm text-[var(--fs-muted)]">Keep the titles, notes and chapters in a collection you can edit. The curator’s collection stays the same.</p>
      <fieldset className="grid gap-4" disabled={duplicating}>
        <label className="grid gap-2">Copy name<input autoComplete="off" className="min-h-11 w-full rounded-control border border-[var(--fs-field-border)] bg-[var(--fs-field)] px-3 text-base text-[var(--fs-ink)] focus-visible:outline-2 focus-visible:outline-[var(--fs-focus)]" maxLength={120} onChange={event => setCopyName(event.target.value)} readOnly={duplicating || Boolean(copyError)} ref={copyNameInput} required value={copyName} /></label>
        <label className="grid gap-2">Copy visibility<select aria-describedby={`${copyFormId}-audience`} className="min-h-11 w-full rounded-control border border-[var(--fs-field-border)] bg-[var(--fs-field)] px-3 text-base text-[var(--fs-ink)] focus-visible:outline-2 focus-visible:outline-[var(--fs-focus)]" disabled={duplicating || Boolean(copyError)} onChange={event => setCopyVisibility(event.target.value as MemberListVisibility)} value={copyVisibility}>
          <option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option>
        </select></label>
        <p className="text-sm text-[var(--fs-muted)]" id={`${copyFormId}-audience`}>{copyVisibility === 'private' ? 'Only you and the editors you invite can open this copy.' : copyVisibility === 'unlisted' ? 'Anyone with the link can open this copy. It stays out of profiles and discovery.' : 'Public collections can appear on your profile and in discovery.'}</p>
      </fieldset>
      {copyError ? <div className="mt-4 text-sm" role="alert"><p className="text-[var(--fs-danger)]">{copyError}</p><p className="mt-2 text-[var(--fs-muted)]">Retry to recover this copy with the same name and visibility. You can change its details in the editor.</p></div> : null}
      <div className="mt-4 flex flex-wrap gap-3">
        <Button disabled={duplicating || !copyName.trim()} type="submit">{duplicating ? 'Creating copy…' : copyError ? 'Retry creating copy' : 'Create copy'}</Button>
        <Button disabled={duplicating} onClick={() => { setCopyOpen(false); copyTrigger.current?.focus() }} type="button" variant="ghost">Cancel</Button>
      </div>
    </form> : null}
    {message ? <p className={`basis-full text-xs ${error ? 'text-[var(--fs-danger)]' : 'text-[var(--fs-muted)]'}`} role={error ? 'alert' : 'status'}>{message}</p> : null}
  </div>
}
