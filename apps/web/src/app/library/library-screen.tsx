'use client'

import { titleHref, type CatalogRef, type CatalogTitleSummary, type MemberLibrary } from '@consumit/contracts'
import { SlidersHorizontal } from 'lucide-react'
import Image from 'next/image'
import { useMemo, useState } from 'react'

import { CuratedListCard, DiaryRow, FilterChip, LibraryToolbar, SavedTitleCard, SectionHeading, SegmentedControl, Tabs } from '@consumit/ui'

import { ScreenShell } from '../screens/screen-shell'
import { SaveTitleButton } from '../catalog/save-title-button'

function key(ref: CatalogRef) { return `${ref.kind}:${ref.id}` }
function Empty({ children }: { children: string }) { return <p className="rounded-card border border-dashed border-border bg-surface p-8 text-sm text-muted">{children}</p> }

export function LibraryScreen({ catalogUnavailable = false, library, titles }: { catalogUnavailable?: boolean; library: MemberLibrary; titles: readonly CatalogTitleSummary[] }) {
  const [filter, setFilter] = useState<'All' | 'Movies' | 'Series'>('All')
  const [view, setView] = useState('grid')
  const titleMap = useMemo(() => new Map(titles.map((title) => [key(title), title])), [titles])
  const saved = useMemo(() => library.saved.filter((entry) => filter === 'All' || (filter === 'Movies' ? entry.kind === 'movie' : entry.kind === 'series')), [filter, library.saved])
  const heroTitles = library.saved.map((entry) => titleMap.get(key(entry))).filter((title): title is CatalogTitleSummary & { posterUrl: string } => Boolean(title?.posterUrl)).slice(0, 4)
  return (
    <ScreenShell activeHref="/library">
      <main className="mx-auto w-full max-w-[90rem]" data-consumit-library-screen>
        <section className="overflow-hidden border-b border-border px-5 py-14 sm:px-8 lg:px-[50px] lg:py-24"><div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(28rem,1.1fr)] lg:items-center"><div><h1 className="max-w-[11ch] text-balance font-display text-5xl leading-[0.95] tracking-[-0.03em] text-ink sm:text-6xl lg:text-[5.25rem]">Everything you chose to keep.</h1><p className="mt-6 max-w-[58ch] text-sm leading-7 text-copy sm:text-base">Your real saved titles, watch history, and lists.</p><dl className="mt-9 flex flex-wrap gap-x-8 gap-y-4 border-t border-border pt-6">{[['Saved', library.saved.length], ['Watched', library.watched.length], ['Lists', library.lists.length]].map(([label, value]) => <div key={label}><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 font-display text-3xl tabular-nums text-ink">{value}</dd></div>)}</dl></div>{heroTitles.length > 0 ? <div aria-hidden="true" className="relative mx-auto h-72 w-full max-w-2xl sm:h-96">{heroTitles.map((title, index) => title.posterUrl ? <Image alt="" className="absolute bottom-0 left-1/2 aspect-[2/3] h-[88%] w-auto rounded-card border border-border object-cover" height={600} key={key(title)} src={title.posterUrl} style={{ transform: `translateX(calc(-50% + ${(index - (heroTitles.length - 1) / 2) * 22}%)) rotate(${(index - (heroTitles.length - 1) / 2) * 5}deg)`, zIndex: index }} width={400} /> : null)}</div> : null}</div></section>
        <div className="px-5 sm:px-8 lg:px-[50px]">
          <Tabs activeValue="saved" aria-label="Library sections" items={[{ count: library.saved.length, href: '#saved', label: 'Saved', value: 'saved' }, { count: library.diary.length, href: '#history', label: 'Watch history', value: 'history' }, { count: library.lists.length, href: '#lists', label: 'Lists', value: 'lists' }]} />
          {catalogUnavailable ? <p className="mt-8 rounded-control border border-border bg-surface p-4 text-xs text-muted">Your library is safe. TMDB title details are temporarily unavailable.</p> : null}
          <section className="py-14 sm:py-16 lg:py-20" id="saved"><SectionHeading description="Filters never change saved state." id="saved-heading" title="Saved titles" /><LibraryToolbar action="/library" className="mt-8" controls={<SegmentedControl className="w-28" legend="Library view" name="library-view" onValueChange={setView} options={[{ label: 'Grid', value: 'grid' }, { label: 'List', value: 'list' }]} value={view} />} filters={<><SlidersHorizontal aria-hidden="true" className="size-4 text-muted" />{(['All', 'Movies', 'Series'] as const).map((label) => <FilterChip key={label} onClick={() => setFilter(label)} selected={filter === label}>{label}</FilterChip>)}</>} />{saved.length === 0 ? <div className="mt-8"><Empty>No saved titles yet.</Empty></div> : <div className={view === 'grid' ? 'mt-8 grid grid-cols-2 gap-x-4 gap-y-9 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6' : 'mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4'}>{saved.map((entry) => { const title = titleMap.get(key(entry)); return <SavedTitleCard action={<SaveTitleButton id={entry.id} kind={entry.kind} title={title?.title ?? `${entry.kind === 'movie' ? 'Movie' : 'Series'} #${entry.id}`} />} artworkSrc={title?.posterUrl ?? undefined} href={titleHref(entry)} key={key(entry)} meta={title?.year ? String(title.year) : 'Catalog details unavailable'} title={title?.title ?? `${entry.kind === 'movie' ? 'Movie' : 'Series'} #${entry.id}`} /> })}</div>}</section>
          <section className="border-t border-border py-14 sm:py-16 lg:py-20" id="lists"><SectionHeading description="Imported lists stay private until you publish them." id="library-lists-heading" title="Your lists" /><div className="mt-8 grid gap-5 md:grid-cols-3">{library.lists.length === 0 ? <div className="md:col-span-3"><Empty>No lists yet.</Empty></div> : library.lists.map((list) => <CuratedListCard artworkSources={[]} curator="You" href={`/lists/${list.slug}`} key={list.id} meta={`${list.itemCount} titles`} title={list.name} />)}</div></section>
          <section className="border-t border-border py-14 sm:py-16 lg:py-20" id="history"><div className="max-w-5xl"><SectionHeading id="history-heading" title="Recently watched" /><div className="mt-6">{library.diary.length === 0 ? <Empty>No diary entries yet.</Empty> : library.diary.map((entry) => { const title = titleMap.get(key(entry)); return <DiaryRow artworkSrc={title?.posterUrl ?? undefined} date={new Date(`${entry.watchedOn}T00:00:00Z`).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })} detail={entry.rewatch ? 'Rewatched' : 'Watched'} href={titleHref(entry)} key={entry.entryId} title={title?.title ?? `Movie #${entry.id}`} /> })}</div></div></section>
        </div>
      </main>
    </ScreenShell>
  )
}
