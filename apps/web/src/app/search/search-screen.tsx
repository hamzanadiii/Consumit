'use client'

import { ArrowRight, Play, Search, SlidersHorizontal } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'

import {
  Badge,
  Button,
  ContentCard,
  CuratedListCard,
  FilterChip,
  MemberSuggestion,
  SectionHeading,
  TasteMatch,
  Tabs,
  buttonVariants,
} from '@consumit/ui'

import { ScreenShell, artwork, circle } from '../screens/screen-shell'

const results = [
  { kind: 'Film', match: 94, meta: '2026 · Mystery · 2h 08m', src: artwork.northbound, title: 'The Last City After Rain' },
  { kind: 'Series', match: 91, meta: '2022– · 2 seasons', src: artwork.violetHours, title: 'Violet Hours' },
  { kind: 'Film', match: 89, meta: '2024 · Drama · 1h 52m', src: artwork.saltwater, title: 'Sea of Names' },
  { kind: 'Film', match: 87, meta: '2021 · Sci-fi · 2h 14m', src: artwork.thirdSun, title: 'Third Sun' },
  { kind: 'Series', match: 84, meta: '2025– · Limited series', src: artwork.northbound, title: 'No One Leaves Sunday' },
  { kind: 'Film', match: 82, meta: '2023 · Mystery · 1h 47m', src: artwork.violetHours, title: 'The Returning' },
] as const

const lists = [
  ['Films that feel like a memory', 'Yasmine', '1.2K', [artwork.northbound, artwork.thirdSun, artwork.saltwater, artwork.violetHours]],
  ['Quiet mysteries for late nights', 'Omar', '846', [artwork.violetHours, artwork.saltwater, artwork.northbound, artwork.thirdSun]],
  ['Cities that remember too much', 'Nadia', '633', [artwork.thirdSun, artwork.northbound, artwork.violetHours, artwork.saltwater]],
] as const

export function SearchScreen({ initialQuery }: { initialQuery: string }) {
  const [activeFilter, setActiveFilter] = useState('All')
  const [feeling, setFeeling] = useState('')
  const [following, setFollowing] = useState<Record<string, boolean>>({ Omar: true })

  return (
    <ScreenShell activeHref="/search" searchDefaultValue={initialQuery}>
      <main className="mx-auto w-full max-w-[90rem]" data-consumit-search-screen>
        <section className="relative isolate overflow-hidden border-b border-border px-5 py-16 sm:px-8 sm:py-20 lg:px-[62px] lg:py-28">
          <Image alt="" className="-z-20 object-cover opacity-35" fill priority sizes="100vw" src={artwork.backdrop} />
          <span aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(9,9,11,.98),rgba(9,9,11,.76)_58%,rgba(9,9,11,.42))]" />
          <div className="max-w-4xl">
            <h1 className="max-w-[13ch] text-balance font-display text-5xl leading-[0.95] tracking-[-0.03em] text-ink sm:text-6xl lg:text-[5.25rem]">
              Find the thing that stays with you.
            </h1>
            <p className="mt-6 max-w-[62ch] text-sm leading-7 text-copy sm:text-base">
              Search titles, people, and human-made lists—or begin with the feeling you want tonight.
            </p>
            <form action="/search" className="relative mt-9 max-w-3xl" method="get" role="search">
              <label className="sr-only" htmlFor="explore-search">Search Consumit</label>
              <Search aria-hidden="true" className="absolute top-1/2 left-5 size-5 -translate-y-1/2 text-muted" />
              <input
                className="h-16 w-full rounded-control border border-control-outline bg-canvas/90 pr-36 pl-14 text-base text-ink outline-none placeholder:text-muted focus-visible:border-orange focus-visible:ring-2 focus-visible:ring-orange sm:pr-40"
                defaultValue={initialQuery}
                id="explore-search"
                name="q"
                placeholder="Try ‘quiet mystery’"
                type="search"
              />
              <Button className="absolute top-2 right-2 h-12" type="submit" variant="accent">Search</Button>
            </form>
            <div className="mt-5 flex flex-wrap items-center gap-2" aria-label="Search by feeling">
              {['Unsettling', 'Quiet', 'Hopeful', 'Beautifully strange'].map((label, index) => (
                <FilterChip key={label} onClick={() => setFeeling(label)} selected={feeling === label} signal={index === 2 ? 'lime' : index === 3 ? 'lilac' : 'orange'}>{label}</FilterChip>
              ))}
            </div>
          </div>
        </section>

        <div className="px-5 sm:px-8 lg:px-[62px]">
          <Tabs
            activeValue="all"
            aria-label="Search result types"
            items={[
              { href: '#results', label: 'All', value: 'all' },
              { href: '#results', label: 'Movies', value: 'movies' },
              { href: '#results', label: 'Series', value: 'series' },
              { href: '#people', label: 'People', value: 'people' },
              { href: '#lists', label: 'Lists', value: 'lists' },
            ]}
          />

          <section className="py-14 sm:py-16 lg:py-20" aria-labelledby="best-match-heading">
            <SectionHeading id="best-match-heading" title={initialQuery ? `Best match for “${initialQuery}”` : 'A strong place to begin'} />
            <article className="relative isolate mt-8 grid min-h-[27rem] overflow-hidden rounded-card border border-border lg:grid-cols-[1fr_0.82fr]">
              <Image alt="The Last City After Rain cinematic still" className="-z-20 object-cover" fill sizes="100vw" src={artwork.backdrop} />
              <span aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(9,9,11,.98)_0%,rgba(9,9,11,.87)_48%,rgba(9,9,11,.3)_100%)]" />
              <div className="flex flex-col justify-center p-6 sm:p-10 lg:p-14">
                <h2 className="max-w-[13ch] font-display text-4xl leading-none tracking-[-0.025em] text-ink sm:text-5xl">The Last City After Rain</h2>
                <p className="mt-4 text-sm text-copy">2026 · Drama · Mystery · 2h 08m</p>
                <p className="mt-6 max-w-[54ch] text-sm leading-7 text-copy">A cartographer returns to a city that has erased every street she remembers—and finds one stranger still living inside her old map.</p>
                <div className="mt-7 flex flex-wrap gap-3">
                  <Link className={buttonVariants({ variant: 'primary' })} href="/title/the-last-city-after-rain" prefetch={false}>View title <ArrowRight aria-hidden="true" /></Link>
                  <Link className={buttonVariants({ variant: 'secondary' })} href="/watch/the-last-city-after-rain" prefetch={false}><Play aria-hidden="true" /> Play</Link>
                </div>
              </div>
              <aside className="flex items-end p-6 sm:p-10 lg:justify-end lg:p-14" aria-label="Why this matches">
                <div className="w-full max-w-sm rounded-card border border-border bg-canvas/90 p-5">
                  <TasteMatch detail="Yasmine, Omar, and Nadia rated it above 4 stars" reason="Slow mystery, hostile city, unresolved ending" score={94} />
                </div>
              </aside>
            </article>
          </section>

          <section className="scroll-mt-8 border-t border-border py-14 sm:py-16 lg:py-20" id="results" aria-labelledby="results-heading">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <SectionHeading description={`${results.length} deterministic matches across films and series`} id="results-heading" title="Explore the results" />
              <div className="flex flex-wrap items-center gap-2">
                <SlidersHorizontal aria-hidden="true" className="mr-1 size-4 text-muted" />
                {['All', 'Mystery', 'Drama', 'Sci-fi'].map((filter) => (
                  <FilterChip key={filter} onClick={() => setActiveFilter(filter)} selected={activeFilter === filter}>{filter}</FilterChip>
                ))}
              </div>
            </div>
            <div className="mt-9 grid grid-cols-2 gap-x-4 gap-y-9 sm:grid-cols-3 lg:grid-cols-6">
              {results.map((result) => (
                <ContentCard
                  artworkSrc={result.src}
                  badge={<Badge tone="neutral">{result.kind}</Badge>}
                  friends={circle}
                  href={result.kind === 'Series' ? `/series/${result.title.toLowerCase().replaceAll(' ', '-')}` : `/title/${result.title.toLowerCase().replaceAll(' ', '-')}`}
                  key={result.title}
                  meta={result.meta}
                  signal={<span className="text-lilac">{result.match}% taste match</span>}
                  title={result.title}
                />
              ))}
            </div>
          </section>

          <section className="scroll-mt-8 border-t border-border py-14 sm:py-16 lg:py-20" id="people" aria-labelledby="people-heading">
            <SectionHeading description="Follow people whose reasons feel useful, not just popular." id="people-heading" title="People who see films like you do" />
            <div className="mt-8 grid gap-4 lg:grid-cols-2">
              {[
                ['Yasmine El Idrissi', '@yasmineframes', 93, 'Noir, moral fog, patient endings'],
                ['Omar Benjelloun', '@slowcuts', 87, 'Architecture, memory, long silences'],
                ['Nadia Alaoui', '@nadiaafterdark', 84, 'Tender horror and impossible cities'],
                ['Adam Rouissi', '@lastreel', 79, 'Small films with enormous weather'],
              ].map(([name, handle, overlap, detail]) => (
                <MemberSuggestion
                  detail={String(detail)}
                  films="428 films"
                  following={Boolean(following[String(name)])}
                  handle={String(handle)}
                  key={String(name)}
                  name={String(name)}
                  onFollowingChange={(value) => setFollowing((current) => ({ ...current, [String(name)]: value }))}
                  overlap={Number(overlap)}
                />
              ))}
            </div>
          </section>

          <section className="scroll-mt-8 border-t border-border py-14 sm:py-16 lg:py-20" id="lists" aria-labelledby="lists-heading">
            <SectionHeading description="Ordered by people, with a reason for every inclusion." id="lists-heading" title="Lists worth following home" />
            <div className="mt-8 grid gap-5 md:grid-cols-3">
              {lists.map(([title, curator, saves, sources]) => (
                <CuratedListCard artworkSources={sources} curator={curator} href={`/lists/${title.toLowerCase().replaceAll(' ', '-')}`} key={title} saves={saves} title={title} />
              ))}
            </div>
          </section>
        </div>
      </main>
    </ScreenShell>
  )
}
