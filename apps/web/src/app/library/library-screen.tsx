'use client'

import { titleHref, watchHref, type CatalogTitleSummary } from '@consumit/contracts'
import { Plus, SlidersHorizontal } from 'lucide-react'
import { useMemo, useState } from 'react'
import Image from 'next/image'

import { Badge, Button, ContinueCard, CuratedListCard, DiaryRow, FilterChip, LibraryToolbar, SavedTitleCard, SectionHeading, SegmentedControl, Tabs } from '@consumit/ui'

import { CatalogStaleNotice, titleMeta } from '../catalog/catalog-ui'
import { ScreenShell } from '../screens/screen-shell'

export function LibraryScreen({ stale, titles }: { stale: boolean; titles: readonly CatalogTitleSummary[] }) {
  const [filter, setFilter] = useState<'All' | 'Movies' | 'Series' | 'Unwatched'>('All')
  const [view, setView] = useState('grid')
  const visible = useMemo(() => {
    if (filter === 'Movies') return titles.filter((title) => title.kind === 'movie')
    if (filter === 'Series') return titles.filter((title) => title.kind === 'series')
    if (filter === 'Unwatched') return titles.filter((_, index) => index % 4 !== 3)
    return titles
  }, [filter, titles])

  return (
    <ScreenShell activeHref="/library">
      {stale ? <CatalogStaleNotice meta={{ fetchedAt: new Date(0).toISOString(), language: 'en-US', region: 'US', source: 'tmdb', stale }} /> : null}
      <main className="mx-auto w-full max-w-[90rem]" data-consumit-library-screen>
        <section className="overflow-hidden border-b border-border px-5 py-14 sm:px-8 lg:px-[62px] lg:py-24">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(28rem,1.1fr)] lg:items-center">
            <div>
              <h1 className="max-w-[11ch] text-balance font-display text-5xl leading-[0.95] tracking-[-0.03em] text-ink sm:text-6xl lg:text-[5.25rem]">Everything you chose to keep.</h1>
              <p className="mt-6 max-w-[58ch] text-sm leading-7 text-copy sm:text-base">Real titles, unfinished stories, private history, and lists you are still shaping.</p>
              <dl className="mt-9 flex flex-wrap gap-x-8 gap-y-4 border-t border-border pt-6">
                {[['Saved', titles.length], ['Favorites', 4], ['Watched', 7], ['Lists', 3]].map(([label, value]) => <div key={label}><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 font-display text-3xl tabular-nums text-ink">{value}</dd></div>)}
              </dl>
            </div>
            <div aria-hidden="true" className="relative mx-auto h-72 w-full max-w-2xl sm:h-96">
              {titles.slice(0, 4).map((title, index) => title.posterUrl ? <Image alt="" className="absolute bottom-0 left-1/2 aspect-[2/3] h-[88%] w-auto rounded-card border border-border object-cover" height={600} key={`${title.kind}:${title.id}`} src={title.posterUrl} style={{ transform: `translateX(calc(-50% + ${(index - 1.5) * 22}%)) rotate(${(index - 1.5) * 5}deg)`, zIndex: index }} width={400} /> : null)}
            </div>
          </div>
        </section>

        <div className="px-5 sm:px-8 lg:px-[62px]">
          <Tabs activeValue="saved" aria-label="Library sections" items={[{ count: titles.length, href: '#saved', label: 'Saved', value: 'saved' }, { count: 4, href: '#favorites', label: 'Favorites', value: 'favorites' }, { count: 7, href: '#history', label: 'Watch history', value: 'history' }, { count: 3, href: '#lists', label: 'Lists', value: 'lists' }]} />
          <section className="py-14 sm:py-16 lg:py-20" aria-labelledby="continue-heading">
            <SectionHeading description="Progress belongs to Consumit and remains independent from playback sources." id="continue-heading" title="Continue watching" />
            <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {titles.slice(6, 9).map((title, index) => <ContinueCard artworkSrc={title.backdropUrl ?? title.posterUrl ?? undefined} href={watchHref(title)} key={`${title.kind}:${title.id}`} meta={title.kind === 'series' ? `Season 1 · Episode ${index + 2}` : `${34 + index * 8} minutes left`} progress={[31, 67, 18][index] ?? 25} title={title.title} />)}
            </div>
          </section>

          <section className="border-t border-border py-14 sm:py-16 lg:py-20" id="saved" aria-labelledby="saved-heading">
            <SectionHeading description="The queue belongs to you. Filters do not change saved state." id="saved-heading" title="Saved titles" />
            <LibraryToolbar action="/library" className="mt-8" controls={<SegmentedControl className="w-28" legend="Library view" name="library-view" onValueChange={setView} options={[{ label: 'Grid', value: 'grid' }, { label: 'List', value: 'list' }]} value={view} />} filters={<><SlidersHorizontal aria-hidden="true" className="size-4 text-muted" />{(['All', 'Movies', 'Series', 'Unwatched'] as const).map((label) => <FilterChip key={label} onClick={() => setFilter(label)} selected={filter === label}>{label}</FilterChip>)}</>} />
            <p aria-live="polite" className="mt-5 text-xs text-muted">Showing {visible.length} {filter.toLowerCase()} titles in {view} view.</p>
            <div className={view === 'grid' ? 'mt-8 grid grid-cols-2 gap-x-4 gap-y-9 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6' : 'mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4'}>
              {visible.map((title, index) => <SavedTitleCard artworkSrc={title.posterUrl ?? undefined} badge={index === 3 ? <Badge tone="lime">Watched</Badge> : undefined} href={titleHref(title)} key={`${title.kind}:${title.id}`} meta={titleMeta(title)} progress={index % 4 === 0 ? 67 : undefined} title={title.title} />)}
            </div>
          </section>

          <section className="border-t border-border py-14 sm:py-16 lg:py-20" id="lists" aria-labelledby="library-lists-heading">
            <SectionHeading action={<Button variant="accent"><Plus aria-hidden="true" /> New list</Button>} description="Private drafts and public lists, kept in one place." id="library-lists-heading" title="Your lists" />
            <div className="mt-8 grid gap-5 md:grid-cols-3">{['Films that feel like a memory', 'Movies for a quiet breakdown', 'Beautifully strange and worth it'].map((name, index) => <CuratedListCard artworkSources={titles.slice(index, index + 4).map((title) => title.posterUrl ?? undefined)} curator="Hamza" href="/lists/films-that-feel-like-a-memory" key={name} saves={String(319 + index * 107)} title={name} />)}</div>
          </section>

          <section className="border-t border-border py-14 sm:py-16 lg:py-20" id="history" aria-labelledby="history-heading">
            <div className="max-w-5xl"><SectionHeading id="history-heading" title="Recently watched" /><div className="mt-6">{titles.slice(2, 5).map((title, index) => <DiaryRow artworkSrc={title.posterUrl ?? undefined} date={['26 Aug', '23 Aug', '14 Aug'][index] ?? 'Recently'} detail={index === 1 ? 'Finished' : 'Rewatched'} href={titleHref(title)} key={`${title.kind}:${title.id}`} note={index === 0 ? 'Still holds up in exactly the right places.' : undefined} title={title.title} />)}</div></div>
          </section>
        </div>
      </main>
    </ScreenShell>
  )
}
