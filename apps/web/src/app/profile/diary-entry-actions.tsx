'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Pencil, Trash2 } from 'lucide-react'

import { deleteDiaryEntry, updateDiaryEntry } from '@/lib/identity-browser'

function parseTags(raw: string) {
  return raw.split(',').map((tag) => tag.trim().slice(0, 100)).filter(Boolean).slice(0, 50)
}

export function DiaryEntryActions({ compact = false, entryId, onDeleted, onSaved, rewatch: initialRewatch, tags: initialTags, title, watchedOn: initialWatchedOn }: {
  compact?: boolean
  entryId: string
  onDeleted?: () => void
  onSaved?: (changes: { rewatch: boolean; tags: string[]; watchedOn: string }) => void
  rewatch: boolean
  tags: readonly string[]
  title: string
  watchedOn: string
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [watchedOn, setWatchedOn] = useState(initialWatchedOn)
  const [rewatch, setRewatch] = useState(initialRewatch)
  const [tags, setTags] = useState(initialTags.join(', '))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dateRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const editRef = useRef<HTMLButtonElement>(null)
  const deleteRef = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef<'edit' | 'delete' | null>(null)

  useEffect(() => {
    if (editing) dateRef.current?.focus()
    else if (confirmDelete) confirmRef.current?.focus()
    else if (returnFocus.current) {
      (returnFocus.current === 'edit' ? editRef : deleteRef).current?.focus()
      returnFocus.current = null
    }
  }, [editing, confirmDelete])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const changes = { rewatch, tags: parseTags(tags), watchedOn }
      await updateDiaryEntry(entryId, changes)
      setEditing(false)
      onSaved?.(changes)
      router.refresh()
    } catch {
      setError('This diary entry could not be saved. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      await deleteDiaryEntry(entryId)
      setConfirmDelete(false)
      onDeleted?.()
      router.refresh()
    } catch {
      setError('This diary entry could not be deleted. Try again.')
    } finally {
      setBusy(false)
    }
  }

  function cancelEdit() {
    setWatchedOn(initialWatchedOn)
    setRewatch(initialRewatch)
    setTags(initialTags.join(', '))
    setEditing(false)
    setError(null)
  }

  return (
    <div className={compact ? 'contents' : 'flex flex-wrap items-center gap-2'} data-consumit-diary-actions>
      {!editing && !confirmDelete ? (
        <div className={compact ? 'col-start-3 inline-flex justify-end gap-1 lg:col-start-auto' : 'inline-flex gap-2'}>
          <button
            aria-label={`Edit diary entry for ${title}`}
            className={compact ? 'grid size-10 place-items-center rounded-control text-[var(--fs-muted)] outline-none hover:bg-[var(--fs-hover)] hover:text-[var(--fs-ink)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]' : 'inline-flex min-h-10 items-center rounded-control border border-[var(--fs-field-border)] px-3 text-xs font-bold text-[var(--fs-secondary)] outline-none transition-colors hover:bg-[var(--fs-hover)] hover:text-[var(--fs-ink)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]'}
            onClick={() => { returnFocus.current = 'edit'; setEditing(true) }}
            ref={editRef}
            title="Edit entry"
            type="button"
          >
            {compact ? <Pencil aria-hidden="true" className="size-4" /> : 'Edit log'}
          </button>
          <button
            aria-label={`Delete diary entry for ${title}`}
            className={compact ? 'grid size-10 place-items-center rounded-control text-[var(--fs-muted)] outline-none hover:bg-[var(--fs-hover)] hover:text-[var(--fs-danger)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]' : 'inline-flex min-h-10 items-center rounded-control border border-[var(--fs-field-border)] px-3 text-xs font-bold text-[var(--fs-secondary)] outline-none transition-colors hover:border-red-400/50 hover:text-[var(--fs-danger)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]'}
            onClick={() => { returnFocus.current = 'delete'; setConfirmDelete(true) }}
            ref={deleteRef}
            title="Delete entry"
            type="button"
          >
            {compact ? <Trash2 aria-hidden="true" className="size-4" /> : 'Delete'}
          </button>
        </div>
      ) : null}

      {editing ? (
        <form aria-label={`Edit ${title} diary entry`} className={compact ? 'col-span-full grid w-full gap-3 rounded-control border border-[var(--fs-field-border)] bg-[var(--fs-field)] p-4 lg:grid-cols-[minmax(10rem,1fr)_auto_minmax(12rem,2fr)_auto] lg:items-end' : 'grid w-full gap-3 rounded-xl border border-[var(--fs-field-border)] bg-[var(--fs-field)] p-3 sm:min-w-64'} onSubmit={(event) => void save(event)}>
          <label className="grid gap-1 text-xs font-bold text-[var(--fs-secondary)]">
            Watched date
            <input className="h-10 rounded-control border border-[var(--fs-field-border)] bg-[var(--fs-field)] px-3 text-sm text-[var(--fs-ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" disabled={busy} onChange={(event) => setWatchedOn(event.currentTarget.value)} ref={dateRef} required type="date" value={watchedOn} />
          </label>
          <label className="flex min-h-10 cursor-pointer items-center gap-2 text-xs text-[var(--fs-secondary)]">
            <input checked={rewatch} className="size-4 accent-[var(--fs-accent)]" disabled={busy} onChange={(event) => setRewatch(event.currentTarget.checked)} type="checkbox" />
            Rewatch
          </label>
          <label className="grid gap-1 text-xs font-bold text-[var(--fs-secondary)]">
            Tags
            <input className="h-10 rounded-control border border-[var(--fs-field-border)] bg-[var(--fs-field)] px-3 text-sm text-[var(--fs-ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" disabled={busy} onChange={(event) => setTags(event.currentTarget.value)} value={tags} />
          </label>
          {error ? <p className="col-span-full text-xs text-[var(--fs-danger)] lg:row-start-2" role="alert">{error}</p> : null}
          <div className={compact ? 'flex gap-2 lg:col-start-4 lg:row-start-1' : 'flex gap-2'}>
            <button className="inline-flex min-h-10 items-center rounded-control bg-[var(--fs-accent)] px-3 text-xs font-bold text-[var(--fs-on-accent)] outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)] disabled:opacity-50" disabled={busy} type="submit">{busy ? 'Saving…' : 'Save entry'}</button>
            <button className="inline-flex min-h-10 items-center rounded-control px-3 text-xs font-bold text-[var(--fs-secondary)] outline-none hover:text-[var(--fs-ink)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)] disabled:opacity-50" disabled={busy} onClick={cancelEdit} type="button">Cancel</button>
          </div>
        </form>
      ) : null}

      {confirmDelete ? (
        <div className={compact ? 'col-span-full flex w-full flex-wrap items-center justify-between gap-3 rounded-control border border-[var(--fs-field-border)] bg-[var(--fs-field)] p-4' : 'grid w-full gap-2 rounded-xl border border-red-400/30 bg-[var(--fs-field)] p-3 sm:min-w-64'} role="group" aria-label={`Delete ${title} diary entry`}>
          <p className="text-xs leading-5 text-[var(--fs-secondary)]">Delete this diary entry? {`“${title}”`} will remain in your watched library.</p>
          {error ? <p className="text-xs text-[var(--fs-danger)]" role="alert">{error}</p> : null}
          <div className="flex gap-2">
            <button className="inline-flex min-h-10 items-center rounded-control border border-[var(--fs-danger)] px-3 text-xs font-bold text-[var(--fs-danger)] outline-none hover:bg-[var(--fs-hover)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)] disabled:opacity-50" disabled={busy} onClick={() => void remove()} ref={confirmRef} type="button">{busy ? 'Deleting…' : 'Delete entry'}</button>
            <button className="inline-flex min-h-10 items-center rounded-control px-3 text-xs font-bold text-[var(--fs-secondary)] outline-none hover:text-[var(--fs-ink)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)] disabled:opacity-50" disabled={busy} onClick={() => { setConfirmDelete(false); setError(null) }} type="button">Keep entry</button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
