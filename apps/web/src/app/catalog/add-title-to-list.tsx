'use client'

import type { CatalogRef, MemberListSummary } from '@consumit/contracts'
import { Button, Select } from '@consumit/ui'
import { Check, Film, ListPlus, Plus, X } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useId, useRef, useState } from 'react'

import { appendMemberListTitle, createMemberList, getMemberLibraryPage } from '@/lib/identity-browser'
import { MEMBER_TITLE_ACTION_ICON_CLASS, MEMBER_TITLE_ACTION_ROW_CLASS, TITLE_CARD_ACTION_ROW_CLASS } from './title-action-styles'

export function AddTitleToListTrigger({ compact = false, expanded = false, onClick }: { compact?: boolean; expanded?: boolean; onClick: () => void }) {
  return (
    <button
      className={compact ? TITLE_CARD_ACTION_ROW_CLASS : MEMBER_TITLE_ACTION_ROW_CLASS}
      aria-expanded={expanded}
      aria-haspopup="dialog"
      onClick={onClick}
      type="button"
    >
      {compact
        ? <ListPlus aria-hidden="true" className="size-4" />
        : <span aria-hidden="true" className={MEMBER_TITLE_ACTION_ICON_CLASS}><ListPlus className="size-[18px]" /></span>}
      Add to a list
    </button>
  )
}

export function AddTitleToList({ title, titleName, posterUrl, compact = false }: { title: CatalogRef; titleName: string; posterUrl?: string | null | undefined; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <AddTitleToListTrigger compact={compact} expanded={open} onClick={() => setOpen(true)} />
      {open ? <AddTitleToListDialog onClose={() => setOpen(false)} posterUrl={posterUrl} title={title} titleName={titleName} /> : null}
    </>
  )
}

export function AddTitleToListDialog({ onClose, posterUrl, title, titleName }: { onClose: () => void; posterUrl?: string | null | undefined; title: CatalogRef; titleName: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const loadStarted = useRef(false)
  const loadInFlight = useRef(false)
  const headingId = useId()
  const [lists, setLists] = useState<readonly MemberListSummary[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [newName, setNewName] = useState(`${titleName} picks`.slice(0, 120))
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')
  const [createRequestKey, setCreateRequestKey] = useState<string | null>(null)
  const [pendingCreatedList, setPendingCreatedList] = useState<MemberListSummary | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)
  const [addedSlug, setAddedSlug] = useState<string | null>(null)

  const load = useCallback(async (cursorValue?: string) => {
    if (loadInFlight.current) return
    loadInFlight.current = true
    setLoading(true)
    setError(false)
    setMessage('')
    try {
      const page = await getMemberLibraryPage('lists', cursorValue)
      if (page.collection !== 'lists') throw new Error('Lists unavailable')
      setLists(current => cursorValue ? [...current, ...page.items] : page.items)
      setCursor(page.nextCursor)
    } catch {
      setError(true)
      setMessage('Your lists could not load. Try again.')
    } finally {
      loadInFlight.current = false
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
    if (!loadStarted.current) {
      loadStarted.current = true
      void load()
    }
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [load])

  async function add(list: MemberListSummary) {
    setBusyId(list.id)
    setMessage('')
    setError(false)
    setAddedSlug(null)
    try {
      await appendMemberListTitle(list.id, title)
      setMessage(`${titleName} is in ${list.name}.`)
      setAddedSlug(list.slug)
    } catch {
      setError(true)
      setMessage(`Could not add ${titleName}. Try again.`)
    } finally {
      setBusyId(null)
    }
  }

  async function createAndAdd() {
    if (!newName.trim() || busyId) return
    setBusyId('new')
    setMessage('')
    setError(false)
    setAddedSlug(null)
    let created = pendingCreatedList
    const idempotencyKey = createRequestKey ?? crypto.randomUUID()
    setCreateRequestKey(idempotencyKey)
    try {
      if (!created) {
        const result = await createMemberList({ description: null, idempotencyKey, name: newName.trim(), visibility })
        created = { ...result.list, origin: 'native' }
        setPendingCreatedList(created)
        setLists(current => [created!, ...current.filter(item => item.id !== created!.id)])
      }
      await appendMemberListTitle(created.id, title)
      setLists(current => current.map(list => list.id === created!.id ? { ...list, itemCount: Math.max(list.itemCount, created!.itemCount + 1) } : list))
      setMessage(`Created ${created.name} and added ${titleName}.`)
      setAddedSlug(created.slug)
      setPendingCreatedList(null)
      setCreateRequestKey(null)
    } catch {
      setError(true)
      setMessage(created ? `Created ${created.name}, but could not add ${titleName}. Try again.` : 'The list could not be created. Retry to safely continue.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <dialog
      aria-labelledby={headingId}
      className="m-auto max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-2xl overflow-hidden rounded-card border border-border bg-surface p-0 text-ink shadow-[0_18px_54px_rgba(0,0,0,0.42)] backdrop:bg-canvas/75"
      data-consumit-add-title-to-list
      onCancel={event => { event.preventDefault(); onClose() }}
      onClick={event => { if (event.target === event.currentTarget) onClose() }}
      ref={dialogRef}
    >
      <header className="flex items-center justify-between gap-4 border-b border-border px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex min-w-0 items-center gap-3.5 sm:gap-4">
          <div aria-hidden="true" className="relative grid size-[58px] shrink-0 place-items-center overflow-hidden rounded-control border border-border bg-surface-raised text-muted sm:size-[68px]">
            {posterUrl ? <Image alt="" className="object-cover" fill sizes="68px" src={posterUrl} /> : <Film className="size-6" />}
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-2xl leading-tight sm:text-[2rem]" id={headingId}>Add to a list</h2>
            <p className="mt-1 truncate text-xs text-copy sm:text-sm">{titleName}</p>
          </div>
        </div>
        <button
          aria-label="Close add to list"
          autoFocus
          className="grid size-10 shrink-0 place-items-center rounded-control text-copy outline-none transition-colors hover:bg-surface-raised hover:text-ink focus-visible:ring-2 focus-visible:ring-orange"
          onClick={onClose}
          type="button"
        >
          <X aria-hidden="true" className="size-5" />
        </button>
      </header>

      <div className="max-h-[min(68dvh,540px)] overflow-y-auto overscroll-contain">
        <div className="grid sm:grid-cols-2">
          <section aria-labelledby={`${headingId}-choose`} className="p-4 sm:border-r sm:border-border sm:p-6">
            <h3 className="text-base font-bold" id={`${headingId}-choose`}>Choose a list</h3>
            <p className="mt-1 text-xs text-muted">Keep this title with the stories you want to remember.</p>

            {lists.length ? (
              <ul className="mt-4 max-h-56 divide-y divide-border overflow-y-auto sm:mt-5">
                {lists.map(list => {
                  const justAdded = addedSlug === list.slug
                  return (
                    <li className="flex min-h-[60px] items-center justify-between gap-3 py-2.5" key={list.id}>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{list.name}</span>
                        <span className="mt-0.5 block text-[11px] tabular-nums text-muted">{list.itemCount} {list.itemCount === 1 ? 'title' : 'titles'} <span aria-hidden="true">·</span> {list.visibility}</span>
                      </span>
                      <Button
                        className="min-w-[72px] shrink-0"
                        disabled={busyId !== null || justAdded}
                        onClick={() => void add(list)}
                        size="sm"
                        variant={justAdded ? 'secondary' : 'ghost'}
                      >
                        {busyId === list.id ? 'Adding…' : justAdded ? <><Check aria-hidden="true" className="size-4" /> Added</> : <><Plus aria-hidden="true" className="size-4" /> Add</>}
                      </Button>
                    </li>
                  )
                })}
              </ul>
            ) : loading ? (
              <p className="mt-5 text-sm text-copy" role="status">Finding your lists…</p>
            ) : error ? (
              <div className="mt-5 flex items-center justify-between gap-3 rounded-control bg-surface-raised px-3 py-2.5">
                <p className="text-xs text-copy" role="alert">Your lists could not load.</p>
                <button className="min-h-9 shrink-0 px-2 text-xs font-bold text-orange outline-none focus-visible:ring-2 focus-visible:ring-orange" onClick={() => void load()} type="button">Try again</button>
              </div>
            ) : (
              <p className="mt-5 text-sm text-copy">Your next collection starts here.</p>
            )}

            {cursor ? <button className="mt-3 min-h-10 text-xs font-bold text-orange outline-none focus-visible:ring-2 focus-visible:ring-orange" disabled={loading} onClick={() => void load(cursor)} type="button">{loading ? 'Loading…' : 'Load more lists'}</button> : null}
          </section>

          <section aria-labelledby={`${headingId}-create`} className="border-t border-border p-4 sm:border-t-0 sm:p-6">
            <h3 className="text-base font-bold" id={`${headingId}-create`}>Create a list</h3>
            <p className="mt-1 text-xs text-muted">Give this pick a new home.</p>
            <label className="mt-4 block text-xs font-semibold text-copy sm:mt-5" htmlFor={`${headingId}-name`}>
              List name
              <input
                className="mt-1.5 h-11 w-full rounded-control border border-control-outline bg-field px-3 text-sm text-ink outline-none placeholder:text-muted focus-visible:border-orange focus-visible:ring-2 focus-visible:ring-orange"
                disabled={pendingCreatedList !== null}
                id={`${headingId}-name`}
                maxLength={120}
                onChange={event => setNewName(event.currentTarget.value)}
                value={newName}
              />
            </label>
            <div className="mt-3">
              <p className="text-xs font-semibold text-copy">Visibility</p>
              <Select
                className="mt-1.5"
                disabled={pendingCreatedList !== null}
                hideLabel
                id={`${headingId}-visibility`}
                label="Visibility"
                onValueChange={value => setVisibility(value as 'public' | 'private')}
                options={[{ value: 'public', label: 'Public' }, { value: 'private', label: 'Private' }]}
                value={visibility}
              />
            </div>
            <Button className="mt-4 min-h-11 w-full" disabled={busyId !== null || !newName.trim()} onClick={() => void createAndAdd()} size="sm" variant="primary">
              {busyId === 'new' ? 'Creating…' : pendingCreatedList ? 'Retry add title' : 'Create and add title'}
            </Button>
          </section>
        </div>

        {message ? (
          <p className={`mx-4 mb-4 rounded-control px-3 py-2 text-xs sm:mx-6 sm:mb-5 ${error ? 'bg-danger/10 text-danger' : 'bg-orange/10 text-copy'}`} role={error ? 'alert' : 'status'}>
            {message}{addedSlug ? <> <Link className="ml-1 font-bold text-orange underline underline-offset-2" href={`/lists/${addedSlug}`}>Open list</Link></> : null}
          </p>
        ) : null}
      </div>
    </dialog>
  )
}
