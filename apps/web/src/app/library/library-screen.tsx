'use client'

import { ArrowRight, Plus, SlidersHorizontal } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'

import {
  Badge,
  Button,
  ContinueCard,
  CuratedListCard,
  DiaryRow,
  FilterChip,
  LibraryToolbar,
  RatingRhythm,
  SavedTitleCard,
  SectionHeading,
  SegmentedControl,
  TasteSignature,
  Tabs,
  buttonVariants,
} from '@consumit/ui'

import { ScreenShell, artwork } from '../screens/screen-shell'

const savedTitles = [
  ['The Last City After Rain', artwork.northbound, '2026 · Film', 92, 0],
  ['Violet Hours', artwork.violetHours, '2022– · Series', 89, 31],
  ['Sea of Names', artwork.saltwater, '2025 · Film', 87, 0],
  ['Third Sun', artwork.thirdSun, '2021 · Film', 86, 100],
  ['Atlas Motel', artwork.northbound, '2024 · Film', 84, 67],
  ['The Returning', artwork.violetHours, '2023 · Film', 81, 0],
  ['Saltwater', artwork.saltwater, '2024– · Series', 79, 18],
  ['Little Gods', artwork.thirdSun, '2023 · Series', 77, 0],
] as const

export function LibraryScreen() {
  const [filter, setFilter] = useState('All')
  const [view, setView] = useState('grid')

  return (
    <ScreenShell activeHref="/library">
      <main className="mx-auto w-full max-w-[90rem]" data-consumit-library-screen>
        <section className="overflow-hidden border-b border-border px-5 py-14 sm:px-8 sm:py-18 lg:px-[62px] lg:py-24">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(28rem,1.1fr)] lg:items-center">
            <div>
              <h1 className="max-w-[11ch] text-balance font-display text-5xl leading-[0.95] tracking-[-0.03em] text-ink sm:text-6xl lg:text-[5.25rem]">Everything you chose to keep.</h1>
              <p className="mt-6 max-w-[58ch] text-sm leading-7 text-copy sm:text-base">Saved titles, unfinished stories, private history, and the lists you’re still shaping.</p>
              <dl className="mt-9 flex flex-wrap gap-x-8 gap-y-4 border-t border-border pt-6">
                {[
                  ['Saved', '148'],
                  ['Favorites', '24'],
                  ['Watched', '323'],
                  ['Lists', '8'],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-muted">{label}</dt>
                    <dd className="mt-1 font-display text-3xl tabular-nums text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div aria-hidden="true" className="relative mx-auto h-72 w-full max-w-2xl sm:h-96">
              {[artwork.thirdSun, artwork.saltwater, artwork.violetHours, artwork.northbound].map((src, index) => (
                <Image
                  alt=""
                  className="absolute bottom-0 left-1/2 aspect-[2/3] h-[88%] rounded-card border border-border object-cover"
                  height={600}
                  key={src}
                  src={src}
                  style={{ transform: `translateX(calc(-50% + ${(index - 1.5) * 22}%)) rotate(${(index - 1.5) * 5}deg)`, zIndex: index }}
                  width={400}
                />
              ))}
            </div>
          </div>
        </section>

        <div className="px-5 sm:px-8 lg:px-[62px]">
          <Tabs
            activeValue="saved"
            aria-label="Library sections"
            items={[
              { count: 148, href: '#saved', label: 'Saved', value: 'saved' },
              { count: 24, href: '#favorites', label: 'Favorites', value: 'favorites' },
              { count: 323, href: '#history', label: 'Watch history', value: 'history' },
              { count: 8, href: '#lists', label: 'Lists', value: 'lists' },
            ]}
          />

          <section className="py-14 sm:py-16 lg:py-20" aria-labelledby="continue-heading">
            <SectionHeading description="Your place is saved even when the playback source changes." id="continue-heading" title="Continue watching" />
            <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              <ContinueCard artworkSrc={artwork.violetHours} href="/watch/violet-hours-s2-e4" meta="Season 2 · Episode 4 · 36 minutes left" progress={31} title="Violet Hours" />
              <ContinueCard artworkSrc={artwork.northbound} href="/watch/atlas-motel" meta="Film · 42 minutes left" progress={67} title="Atlas Motel" />
              <ContinueCard artworkSrc={artwork.saltwater} href="/watch/saltwater-s1-e3" meta="Season 1 · Episode 3 · 28 minutes left" progress={18} title="Saltwater" />
            </div>
          </section>

          <section className="scroll-mt-8 border-t border-border py-14 sm:py-16 lg:py-20" id="saved" aria-labelledby="saved-heading">
            <SectionHeading description="The queue belongs to you. Filter it without changing its saved state." id="saved-heading" title="Saved titles" />
            <LibraryToolbar
              action="/library"
              className="mt-8"
              controls={(
                <SegmentedControl
                  className="w-28"
                  legend="Library view"
                  name="library-view"
                  onValueChange={setView}
                  options={[
                    { label: 'Grid', value: 'grid' },
                    { label: 'List', value: 'list' },
                  ]}
                  value={view}
                />
              )}
              filters={(
                <>
                  <SlidersHorizontal aria-hidden="true" className="size-4 text-muted" />
                  {['All', 'Movies', 'Series', 'Unwatched'].map((label) => (
                    <FilterChip key={label} onClick={() => setFilter(label)} selected={filter === label}>{label}</FilterChip>
                  ))}
                </>
              )}
            />
            <p aria-live="polite" className="mt-5 text-xs text-muted">Showing {filter.toLowerCase()} titles in {view} view.</p>
            <div className={view === 'grid' ? 'mt-8 grid grid-cols-2 gap-x-4 gap-y-9 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6' : 'mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4'}>
              {savedTitles.map(([title, src, meta, match, progress]) => (
                <SavedTitleCard
                  artworkSrc={src}
                  badge={progress === 100 ? <Badge tone="lime">Watched</Badge> : undefined}
                  href={title === 'Violet Hours' ? '/series/violet-hours' : `/title/${title.toLowerCase().replaceAll(' ', '-')}`}
                  key={title}
                  meta={meta}
                  progress={progress || undefined}
                  signal={<span className="text-lilac">{match}% taste match</span>}
                  title={title}
                />
              ))}
            </div>
          </section>

          <section className="scroll-mt-8 border-t border-border py-14 sm:py-16 lg:py-20" id="lists" aria-labelledby="library-lists-heading">
            <SectionHeading
              action={<Button variant="accent"><Plus aria-hidden="true" /> New list</Button>}
              description="Private drafts and public lists, kept in one place."
              id="library-lists-heading"
              title="Your lists"
            />
            <div className="mt-8 grid gap-5 md:grid-cols-3">
              <CuratedListCard artworkSources={[artwork.northbound, artwork.thirdSun, artwork.saltwater, artwork.violetHours]} curator="Hamza" href="/lists/films-that-feel-like-a-memory" saves="426" title="Films that feel like a memory" />
              <CuratedListCard artworkSources={[artwork.saltwater, artwork.northbound, artwork.thirdSun, artwork.violetHours]} curator="Hamza" href="/lists/movies-for-a-quiet-breakdown" saves="319" title="Movies for a quiet breakdown" />
              <CuratedListCard artworkSources={[artwork.violetHours, artwork.saltwater, artwork.northbound, artwork.thirdSun]} curator="Hamza" href="/lists/beautifully-strange" saves="588" title="Beautifully strange and worth it" />
            </div>
          </section>

          <section className="scroll-mt-8 border-t border-border py-14 sm:py-16 lg:py-20" id="history" aria-labelledby="history-heading">
            <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_25rem]">
              <div>
                <SectionHeading action={<Link className={`${buttonVariants({ variant: 'ghost' })} px-1 text-orange`} href="#full-history">Full history <ArrowRight aria-hidden="true" /></Link>} id="history-heading" title="Recently watched" />
                <div className="mt-6">
                  <DiaryRow artworkSrc={artwork.northbound} date="26 Aug" detail="Rewatched" href="/title/atlas-motel" note="Still hurts in exactly the right places." rating={4.5} title="Atlas Motel" />
                  <DiaryRow artworkSrc={artwork.saltwater} date="23 Aug" detail="Finished" href="/title/sea-of-names" rating={5} title="Sea of Names" />
                  <DiaryRow artworkSrc={artwork.thirdSun} date="14 Aug" detail="Rewatched · Favorite" href="/title/third-sun" rating={5} title="Third Sun" />
                </div>
              </div>
              <aside className="space-y-5" aria-label="Library taste summary">
                <TasteSignature detail="You finish 72% of the films you start." statement="You keep returning to cities, weather, and difficult homecomings." worlds={[{ label: 'Mystery', tone: 'lilac' }, { label: 'Slow cinema', tone: 'lime' }, { label: 'Drama', tone: 'orange' }]} />
                <RatingRhythm values={[3, 7, 12, 21, 35, 30, 22, 14, 8]} />
              </aside>
            </div>
          </section>
        </div>
      </main>
    </ScreenShell>
  )
}
