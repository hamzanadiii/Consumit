'use client'

import { titleHref, type CatalogRef, type CatalogTitleSummary, type MemberLibrary } from '@consumit/contracts'
import { ArrowUpRight, BookOpen, Search } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'

import { ArtworkFrame, CuratedListCard, DiaryRow, FilterChip, SavedTitleCard, SectionHeading, SegmentedControl, buttonVariants } from '@consumit/ui'

import { ScreenShell } from '../screens/screen-shell'
import { SaveTitleButton } from '../catalog/save-title-button'

function key(ref: CatalogRef) { return `${ref.kind}:${ref.id}` }

export function LibraryScreen({ catalogUnavailable = false, library, titles }: { catalogUnavailable?: boolean; library: MemberLibrary; titles: readonly CatalogTitleSummary[] }) {
  const [filter, setFilter] = useState<'All' | 'Movies' | 'Series'>('All')
  const [view, setView] = useState('shelves')
  const [query, setQuery] = useState('')
  const titleMap = useMemo(() => new Map(titles.map((title) => [key(title), title])), [titles])
  const saved = library.saved.filter((entry) => {
    const title = titleMap.get(key(entry))
    const matchesKind = filter === 'All' || (filter === 'Movies' ? entry.kind === 'movie' : entry.kind === 'series')
    return matchesKind && (title?.title ?? `${entry.kind} #${entry.id}`).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  })
  const heroTitles = library.saved.map((entry) => titleMap.get(key(entry))).filter((title): title is CatalogTitleSummary => Boolean(title)).slice(0, 5)
  const filtered = query.trim() !== '' || filter !== 'All'
  return (
    <ScreenShell activeHref="/library">
      <main className="consumit-library mx-auto w-full max-w-[90rem]" data-consumit-library-screen>
        <header className="consumit-library-opening">
          <div>
            <h1>Your library<span>.</span></h1>
            <p>Saved for later, watched and remembered. Your collection, in one place.</p>
            <a className={buttonVariants({ variant: 'secondary' })} href="#saved">Explore your shelves <ArrowUpRight aria-hidden="true" /></a>
          </div>
          <div className="consumit-library-display" aria-label="A selection from your saved titles">
            {heroTitles.length ? heroTitles.map((title) => <Link aria-label={title.title} href={titleHref(title)} key={key(title)}><ArtworkFrame alt="" src={title.posterUrl ?? undefined} /></Link>) : <div className="consumit-library-bookplate"><BookOpen aria-hidden="true" /><span>Your first shelf<br />starts here.</span><Link href="/movies">Find something to keep <ArrowUpRight aria-hidden="true" /></Link></div>}
          </div>
        </header>
        <div className="consumit-library-body">
          <nav aria-label="Library sections" className="consumit-shelf-index">
            <a href="#saved"><span>Saved titles</span><span>{library.saved.length}</span></a>
            <a href="#lists"><span>Your lists</span><span>{library.lists.length}</span></a>
            <a href="#history"><span>Watch diary</span><span>{library.diary.length}</span></a>
          </nav>
          {catalogUnavailable ? <p className="mt-8 rounded-control border border-border bg-surface p-4 text-sm text-muted" role="status">Your library is safe. Title details are temporarily unavailable.</p> : null}
          <section className="consumit-library-section" id="saved" aria-labelledby="saved-heading">
            <SectionHeading description="Everything you have saved for later." id="saved-heading" title="On your shelves" />
            <div className="consumit-shelf-toolbar">
              <label className="consumit-shelf-search"><Search aria-hidden="true" /><span className="sr-only">Search your saved titles</span><input onChange={(event) => setQuery(event.target.value)} placeholder="Search saved titles" type="search" value={query} /></label>
              <div aria-label="Filter saved titles" className="flex flex-wrap gap-2" role="group">{(['All', 'Movies', 'Series'] as const).map((label) => <FilterChip key={label} onClick={() => setFilter(label)} selected={filter === label}>{label}</FilterChip>)}</div>
              <SegmentedControl legend="Library view" name="library-view" onValueChange={setView} options={[{ label: 'Shelves', value: 'shelves' }, { label: 'Grid', value: 'grid' }, { label: 'List', value: 'list' }]} value={view} />
            </div>
            <p className="my-5 text-xs text-muted" role="status">{saved.length} {saved.length === 1 ? 'title' : 'titles'}{filtered ? ' found' : ' saved for another night'}</p>
            {saved.length === 0 ? <div className="consumit-shelf-empty"><BookOpen aria-hidden="true" /><h3>{filtered ? 'No saved titles match.' : 'Nothing on this shelf yet.'}</h3><p>{filtered ? 'Try another title or clear your filters.' : 'Save a title while you explore. We will keep a place for it here.'}</p>{filtered ? <button className={buttonVariants({ variant: 'secondary' })} onClick={() => { setQuery(''); setFilter('All') }} type="button">Clear filters</button> : <Link className={buttonVariants()} href="/movies">Explore movies <ArrowUpRight aria-hidden="true" /></Link>}</div> : (
              <div className={`consumit-saved-display consumit-saved-display--${view}`}>
                {saved.map((entry) => {
                  const title = titleMap.get(key(entry))
                  const label = title?.title ?? `${entry.kind === 'movie' ? 'Movie' : 'Series'} #${entry.id}`
                  return <SavedTitleCard action={<SaveTitleButton id={entry.id} kind={entry.kind} title={label} />} artworkSrc={title?.posterUrl ?? undefined} href={titleHref(entry)} key={key(entry)} meta={title?.year ? `${title.year} · ${entry.kind === 'movie' ? 'Movie' : 'Series'}` : 'Catalog details unavailable'} title={label} />
                })}
              </div>
            )}
          </section>
          <section className="consumit-library-section" id="lists" aria-labelledby="library-lists-heading"><SectionHeading description="Titles you have brought together." id="library-lists-heading" title="Your lists" /><div className="mt-8 grid gap-5 md:grid-cols-3">{library.lists.length === 0 ? <p className="col-span-full py-8 text-sm text-muted">Your lists will live here. Imported lists stay private until you publish them.</p> : library.lists.map((list) => <CuratedListCard artworkSources={[]} curator="You" href={`/lists/${list.slug}`} key={list.id} meta={`${list.itemCount} titles`} title={list.name} />)}</div></section>
          <section className="consumit-library-section" id="history" aria-labelledby="history-heading"><SectionHeading description="Your watches and rewatches, by date." id="history-heading" title="Watch diary" /><div className="mt-6">{library.diary.length === 0 ? <p className="py-8 text-sm text-muted">Your diary is still unwritten. Log a watch to start your story.</p> : library.diary.map((entry) => { const title = titleMap.get(key(entry)); return <DiaryRow artworkSrc={title?.posterUrl ?? undefined} date={new Date(`${entry.watchedOn}T00:00:00Z`).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })} detail={entry.rewatch ? 'Rewatched' : 'Watched'} href={titleHref(entry)} key={entry.entryId} title={title?.title ?? `Movie #${entry.id}`} /> })}</div></section>
        </div>
      </main>
    </ScreenShell>
  )
}
