'use client'

import { titleHref, type CatalogKind, type CatalogRef, type CatalogTitleSummary, type MemberListDetail } from '@consumit/contracts'
import { Button } from '@consumit/next-ui'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, useEffect, useMemo, useState } from 'react'

import { browserSearchCatalog } from '@/lib/catalog-browser'
import { deleteMemberList, IdentityApiError, createMemberList, updateMemberListContent } from '@/lib/identity-browser'

function refKey(ref: CatalogRef) { return `${ref.kind}:${ref.id}` }

export function CreateListForm() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [requestKey, setRequestKey] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function changed<T>(setter: (value: T) => void, value: T) {
    setter(value)
    setRequestKey(null)
    setError(null)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    const idempotencyKey = requestKey ?? crypto.randomUUID()
    setRequestKey(idempotencyKey)
    setSaving(true)
    setError(null)
    try {
      const list = await createMemberList({ description: description.trim() || null, idempotencyKey, name: name.trim(), visibility: 'private' })
      router.push(`/lists/${list.list.slug}`)
      router.refresh()
    } catch {
      setError('The list could not be created. Retry to safely continue.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="border-t border-[var(--fs-line)] py-5" aria-labelledby="new-list-heading">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl text-[var(--fs-ink)]" id="new-list-heading">Start a new list</h2>
          <p className="mt-1 text-sm text-[var(--fs-muted)]">Bring titles together in your own order.</p>
        </div>
        {!open ? <Button onClick={() => setOpen(true)} variant="primary">Create list</Button> : null}
      </div>
      {open ? (
        <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={(event) => void submit(event)}>
          <label className="grid gap-2 text-xs font-bold text-[var(--fs-secondary)] sm:col-span-2">List name
            <input autoFocus className="h-11 rounded-control border border-[var(--fs-field-border)] bg-transparent px-3 text-sm text-[var(--fs-ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" maxLength={120} onChange={(event) => changed(setName, event.currentTarget.value)} required value={name} />
          </label>
          <label className="grid gap-2 text-xs font-bold text-[var(--fs-secondary)] sm:col-span-2">Description
            <textarea className="min-h-24 rounded-control border border-[var(--fs-field-border)] bg-transparent p-3 text-sm leading-6 text-[var(--fs-ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" maxLength={2_000} onChange={(event) => changed(setDescription, event.currentTarget.value)} value={description} />
          </label>
          <div className="flex flex-wrap items-end gap-3">
            <Button disabled={saving || !name.trim()} type="submit" variant="primary">{saving ? 'Creating…' : 'Create list'}</Button>
            <Button disabled={saving} onClick={() => { setOpen(false); setError(null) }} type="button" variant="secondary">Cancel</Button>
          </div>
          {error ? <p className="text-sm text-orange sm:col-span-2" role="alert">{error}</p> : null}
        </form>
      ) : null}
    </section>
  )
}

type EditableTitle = CatalogRef & { note: string }

export function ListEditor({ data, titles }: { data: MemberListDetail; titles: readonly CatalogTitleSummary[] }) {
  const router = useRouter()
  const [name, setName] = useState(data.list.name)
  const [description, setDescription] = useState(data.list.description ?? '')
  const [items, setItems] = useState<EditableTitle[]>(data.items.map(({ id, kind, note }) => ({ id, kind, note: note ?? '' })))
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<CatalogKind | 'all'>('all')
  const [results, setResults] = useState<readonly CatalogTitleSummary[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const titleMap = useMemo(() => new Map([...titles, ...results].map((title) => [refKey(title), title])), [results, titles])

  useEffect(() => {
    const value = query.trim()
    if (value.length < 2) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setSearching(true)
      setSearchError(false)
      void browserSearchCatalog(value, kind, controller.signal).then(
        (page) => { if (!controller.signal.aborted) setResults(page.items) },
        () => { if (!controller.signal.aborted) { setResults([]); setSearchError(true) } },
      ).finally(() => { if (!controller.signal.aborted) setSearching(false) })
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [kind, query])

  function move(index: number, offset: -1 | 1) {
    const target = index + offset
    if (target < 0 || target >= items.length) return
    setItems((current) => {
      const next = [...current]
      ;[next[index], next[target]] = [next[target]!, next[index]!]
      return next
    })
  }

  function add(ref: CatalogRef) {
    if (items.some((item) => refKey(item) === refKey(ref)) || items.length >= 500) return
    setItems((current) => [...current, { ...ref, note: '' }])
  }

  async function save() {
    if (saving || !name.trim()) return
    setSaving(true)
    setError(null)
    try {
      await updateMemberListContent(data.list.id, {
        description: description.trim() || null,
        items: items.map(({ id, kind: titleKind, note }) => ({ id, kind: titleKind, note: note.trim() || null })),
        name: name.trim(),
        visibility: 'private',
      })
      router.refresh()
    } catch (cause) {
      setError(cause instanceof IdentityApiError && cause.status === 404 ? 'This list is no longer editable.' : 'Your changes were not saved. Try again; the current draft is still here.')
    } finally {
      setSaving(false)
    }
  }

  async function removeList() {
    if (saving || !window.confirm(`Delete “${data.list.name}” and its ordered titles? This cannot be undone.`)) return
    setSaving(true)
    setError(null)
    try {
      await deleteMemberList(data.list.id)
      router.replace(`/profile/${encodeURIComponent(data.owner.username)}/lists`)
      router.refresh()
    } catch {
      setError('This list could not be deleted. Your list is still here; try again.')
    } finally {
      setSaving(false)
    }
  }

  const visibleResults = results.filter((result) => !items.some((item) => refKey(item) === refKey(result)))
  return (
    <section aria-labelledby="edit-list-heading" className="rounded-2xl border border-[var(--fs-field-border)] bg-[var(--fs-field)] p-5 sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--fs-accent)]">List editor</p><h2 className="mt-2 font-display text-3xl text-[var(--fs-ink)]" id="edit-list-heading">Shape the order</h2></div><p className="text-xs text-[var(--fs-muted)]">{items.length} / 500 titles</p></div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-xs font-bold text-[var(--fs-secondary)] sm:col-span-2">List name<input className="h-11 rounded-control border border-[var(--fs-field-border)] bg-transparent px-3 text-sm text-[var(--fs-ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" maxLength={120} onChange={(event) => setName(event.currentTarget.value)} value={name} /></label>
        <label className="grid gap-2 text-xs font-bold text-[var(--fs-secondary)] sm:col-span-2">Description<textarea className="min-h-24 rounded-control border border-[var(--fs-field-border)] bg-transparent p-3 text-sm leading-6 text-[var(--fs-ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" maxLength={2_000} onChange={(event) => setDescription(event.currentTarget.value)} value={description} /></label>
      </div>

      <div className="mt-8 border-t border-[var(--fs-line)] pt-6"><h3 className="font-display text-2xl text-[var(--fs-ink)]">Add a title</h3><div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]"><label className="grid gap-2 text-xs font-bold text-[var(--fs-secondary)]">Search movies, series, or anime<input autoComplete="off" className="h-11 rounded-control border border-[var(--fs-field-border)] bg-transparent px-3 text-sm text-[var(--fs-ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" onChange={(event) => { const value = event.currentTarget.value; setQuery(value); setResults([]); setSearching(false); setSearchError(false) }} placeholder="Search titles" type="search" value={query} /></label><label className="grid gap-2 text-xs font-bold text-[var(--fs-secondary)]">Catalog<select className="h-11 rounded-control border border-[var(--fs-field-border)] bg-[var(--fs-field)] px-3 text-sm text-[var(--fs-ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" onChange={(event) => setKind(event.currentTarget.value as CatalogKind | 'all')} value={kind}><option value="all">All titles</option><option value="movie">Movies</option><option value="series">Series</option><option value="anime">Anime</option></select></label></div>
        {query.trim().length >= 2 ? <div aria-live="polite" className="mt-3 rounded-control border border-[var(--fs-line)] bg-[var(--fs-rail)] p-2">{searching ? <p className="px-3 py-2 text-sm text-[var(--fs-muted)]">Searching the catalog…</p> : searchError ? <p className="px-3 py-2 text-sm text-orange" role="alert">Catalog search is unavailable. Try again.</p> : visibleResults.length ? <ul className="divide-y divide-[var(--fs-line)]">{visibleResults.slice(0, 8).map((title) => <li className="flex items-center justify-between gap-3 py-2" key={refKey(title)}><span className="min-w-0"><span className="block truncate text-sm font-bold text-[var(--fs-ink)]">{title.title}</span><span className="text-xs text-[var(--fs-muted)]">{title.year ?? 'Year unavailable'} · {title.kind}</span></span><Button disabled={items.length >= 500} onClick={() => add(title)} size="sm" type="button" variant="secondary">Add</Button></li>)}</ul> : <p className="px-3 py-2 text-sm text-[var(--fs-muted)]">No matching titles yet.</p>}</div> : <p className="mt-3 text-xs text-[var(--fs-muted)]">Enter at least two characters.</p>}</div>

      <div className="mt-8 border-t border-[var(--fs-line)] pt-6"><h3 className="font-display text-2xl text-[var(--fs-ink)]">Titles in your order</h3>{items.length === 0 ? <p className="mt-4 rounded-xl border border-dashed border-[var(--fs-field-border)] p-5 text-sm text-[var(--fs-muted)]">This list is empty. Search above to add the first title.</p> : <ol className="mt-4 divide-y divide-[var(--fs-line)]">{items.map((item, index) => { const title = titleMap.get(refKey(item)); const label = title?.title ?? `${item.kind} #${item.id}`; return <li className="grid gap-3 py-4 sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:items-center" key={refKey(item)}><span className="font-mono text-xs tabular-nums text-[var(--fs-muted)]">{String(index + 1).padStart(2, '0')}</span><div className="min-w-0"><Link className="truncate text-sm font-bold text-[var(--fs-ink)] hover:text-[var(--fs-accent)]" href={titleHref(item)}>{label}</Link><label className="mt-2 block"><span className="sr-only">Note for {label}</span><input className="h-9 w-full rounded-control border border-[var(--fs-field-border)] bg-transparent px-3 text-xs text-[var(--fs-secondary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" maxLength={500} onChange={(event) => { const note = event.currentTarget.value; setItems((current) => current.map((entry) => refKey(entry) === refKey(item) ? { ...entry, note } : entry)) }} placeholder="Add a note (optional)" value={item.note} /></label></div><div className="flex gap-2 sm:justify-end"><Button aria-label={`Move ${label} up`} disabled={index === 0} onClick={() => move(index, -1)} size="sm" type="button" variant="secondary">↑</Button><Button aria-label={`Move ${label} down`} disabled={index === items.length - 1} onClick={() => move(index, 1)} size="sm" type="button" variant="secondary">↓</Button><Button aria-label={`Remove ${label}`} onClick={() => setItems((current) => current.filter((entry) => refKey(entry) !== refKey(item)))} size="sm" type="button" variant="secondary">Remove</Button></div></li> })}</ol>}</div>

      <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-[var(--fs-line)] pt-6"><Button disabled={saving || !name.trim()} onClick={() => void save()} variant="primary">{saving ? 'Saving list…' : 'Save changes'}</Button><span className="text-xs text-[var(--fs-muted)]">Order, notes, and details save together. Your list is private.</span><Button disabled={saving} onClick={() => void removeList()} type="button" variant="secondary">Delete list</Button>{error ? <p className="basis-full text-sm text-orange" role="alert">{error}</p> : null}</div>
    </section>
  )
}
