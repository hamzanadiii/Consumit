'use client'

import type { PublicMemberPage } from '@consumit/contracts'
import { Button, FilterChip, Input } from '@consumit/ui'
import Link from 'next/link'
import { useRef, useState } from 'react'
import { searchMembers } from '@/lib/identity-browser'
import { FilScreenShell } from '../shared'
import { MemberRows } from '../profile/member-rows'

export function PeopleSearchScreen({ initialQuery, initialPage }: { initialQuery: string; initialPage: PublicMemberPage | null }) {
  const [page, setPage] = useState(initialPage)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(initialQuery.length >= 3 && !initialPage)
  const lock = useRef(false)
  async function load() {
    if (lock.current) return
    lock.current = true; setBusy(true); setError(false)
    try { const result = await searchMembers(initialQuery, page?.nextCursor ?? undefined); setPage(current => ({ items: [...(current?.items ?? []), ...result.items], nextCursor: result.nextCursor })) }
    catch { setError(true) }
    finally { lock.current = false; setBusy(false) }
  }
  return <FilScreenShell pageHeading={undefined}><main className="mx-auto w-full max-w-[90rem] px-5 sm:px-8 lg:px-[50px]" data-consumit-people-search><header className="border-b border-[var(--fs-line)] py-14 sm:py-20"><h1 className="font-display text-5xl leading-[.95] tracking-[-.03em] text-[var(--fs-ink)] sm:text-6xl">Find your kind of people.</h1><p className="mt-6 max-w-[62ch] text-sm leading-7 text-[var(--fs-secondary)] sm:text-base">Discover public profiles by name or username. Explore their taste and follow what speaks to you.</p><form action="/search" className="mt-8 flex max-w-3xl flex-wrap gap-3" method="get" role="search"><label className="sr-only" htmlFor="people-query">Search people</label><Input className="min-w-0 flex-1" defaultValue={initialQuery} id="people-query" maxLength={100} minLength={3} name="q" placeholder="Name or username" type="search" /><input name="type" type="hidden" value="people" /><Button type="submit">Search</Button></form></header><section aria-busy={busy} className="py-10"><div aria-label="Filter results" className="mb-6 flex flex-wrap gap-2" role="group">{[['all', 'All'], ['movie', 'Movies'], ['series', 'Series'], ['anime', 'Anime']].map(([kind, label]) => <Link className="inline-flex min-h-11 items-center rounded-control border border-[var(--fs-line)] px-4 text-sm text-[var(--fs-secondary)] hover:text-[var(--fs-ink)]" href={`/search?q=${encodeURIComponent(initialQuery)}&type=${kind}`} key={kind}>{label}</Link>)}<FilterChip selected>People</FilterChip></div><h2 className="font-display text-3xl text-[var(--fs-ink)]">People</h2>{initialQuery.length < 3 ? <p className="mt-6 text-sm text-[var(--fs-muted)]">Enter at least three characters to search public profiles.</p> : null}{page?.items.length === 0 ? <p className="mt-6 text-sm text-[var(--fs-muted)]">No people found for “{initialQuery}”. Try another name or spelling.</p> : null}{page ? <MemberRows items={page.items} /> : null}{error ? <p className="mt-6 text-sm text-[var(--fs-danger)]" role="alert">People search could not load. Try again.</p> : null}{error || page?.nextCursor ? <Button className="mt-6" disabled={busy} onClick={() => void load()} variant="secondary">{busy ? 'Searching…' : error ? 'Try again' : 'Load more'}</Button> : null}<p className="sr-only" role="status">{busy ? 'Searching people' : ''}</p></section></main></FilScreenShell>
}
