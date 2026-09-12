'use client'

import { titleHref, watchHref, type CatalogPage } from '@consumit/contracts'
import { ArrowRight, Play, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'

import {
  buttonVariants,
  Button,
  EmptyState,
  FilterChip,
  MoodSelector,
  SectionHeading,
} from '@consumit/ui'

import { CatalogGrid, CatalogStaleNotice, titleMeta } from '../catalog/catalog-ui'
import { ScreenShell } from '../screens/screen-shell'

type SearchScreenProps = {
  initialQuery: string
  page: CatalogPage
  queryTooShort: boolean
}

const moodOptions = [
  { label: 'Slow & beautiful', tone: 'orange', value: 'slow' },
  { label: 'Mess with my head', tone: 'lilac', value: 'strange' },
  { label: 'Easy comfort', tone: 'lime', value: 'comfort' },
  { label: 'Laugh with friends', tone: 'orange', value: 'funny' },
  { label: 'Pure tension', tone: 'rose', value: 'tense' },
] as const

export function SearchScreen({ initialQuery, page, queryTooShort }: SearchScreenProps) {
  const [activeKind, setActiveKind] = useState<'all' | 'movie' | 'series'>('all')
  const [mood, setMood] = useState<string>()
  const results = useMemo(() => activeKind === 'all' ? page.items : page.items.filter((item) => item.kind === activeKind), [activeKind, page.items])
  const best = results[0] ?? page.items[0]

  return (
    <ScreenShell activeHref="/search" searchDefaultValue={initialQuery}>
      <CatalogStaleNotice meta={page.meta} />
      <main className="mx-auto w-full max-w-[90rem]" data-consumit-search-screen>
        <section className="relative isolate overflow-hidden border-b border-border px-5 py-16 sm:px-8 sm:py-20 lg:px-[50px] lg:py-24">
          {best?.backdropUrl ? <Image alt="" className="-z-20 object-cover opacity-35" fill priority sizes="100vw" src={best.backdropUrl} /> : null}
          <span aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(9,9,11,.98),rgba(9,9,11,.76)_58%,rgba(9,9,11,.42))]" />
          <div className="max-w-4xl">
            <h1 className="max-w-[13ch] text-balance font-display text-5xl leading-[0.95] tracking-[-0.03em] text-ink sm:text-6xl lg:text-[5.25rem]">Find the thing that stays with you.</h1>
            <p className="mt-6 max-w-[62ch] text-sm leading-7 text-copy sm:text-base">Search real movies and series, explore the details, and choose what deserves tonight.</p>
            <form action="/search" className="relative mt-9 max-w-3xl" method="get" role="search">
              <label className="sr-only" htmlFor="explore-search">Search movies and series</label>
              <Search aria-hidden="true" className="absolute top-1/2 left-5 size-5 -translate-y-1/2 text-muted" />
              <input className="h-16 w-full rounded-control border border-control-outline bg-canvas/90 pr-36 pl-14 text-base text-ink outline-none placeholder:text-muted focus-visible:border-orange focus-visible:ring-2 focus-visible:ring-orange sm:pr-40" defaultValue={initialQuery} id="explore-search" maxLength={100} name="q" placeholder="Try ‘Dune’ or ‘Severance’" type="search" />
              <Button className="absolute top-2 right-2 h-12" type="submit" variant="accent">Search</Button>
            </form>
            {queryTooShort ? <p className="mt-3 text-xs text-orange" role="alert">Type at least two characters. Discovery titles are shown below.</p> : null}
          </div>
        </section>

        <div className="px-5 sm:px-8 lg:px-[50px]">
          {best ? (
            <section className="py-14 sm:py-16 lg:py-20" aria-labelledby="best-match-heading">
              <SectionHeading id="best-match-heading" title={initialQuery.length >= 2 ? `Best match for “${initialQuery}”` : 'A strong place to begin'} />
              <article className="relative isolate mt-8 min-h-[27rem] overflow-hidden rounded-card border border-border">
                {best.backdropUrl ? <Image alt="" className="-z-20 object-cover" fill sizes="100vw" src={best.backdropUrl} /> : null}
                <span aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(9,9,11,.98)_0%,rgba(9,9,11,.87)_48%,rgba(9,9,11,.3)_100%)]" />
                <div className="flex flex-col justify-center p-6 sm:p-10 lg:p-14">
                  <h2 className="max-w-[13ch] font-display text-4xl leading-none tracking-[-0.025em] text-ink sm:text-5xl">{best.title}</h2>
                  <p className="mt-4 text-sm text-copy">{titleMeta(best)}</p>
                  <p className="mt-6 max-w-[54ch] text-sm leading-7 text-copy">{best.overview || 'More information will be available soon.'}</p>
                  <div className="mt-7 flex flex-wrap gap-3">
                    <Link className={buttonVariants()} href={titleHref(best)}>View title <ArrowRight aria-hidden="true" /></Link>
                    <Link className={buttonVariants({ variant: 'secondary' })} href={watchHref(best)}><Play aria-hidden="true" /> Watch</Link>
                  </div>
                </div>
              </article>
            </section>
          ) : null}

          <section className="border-t border-border py-14 sm:py-16 lg:py-20" id="results" aria-labelledby="results-heading">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <SectionHeading description={`${results.length} real catalog ${results.length === 1 ? 'match' : 'matches'}`} id="results-heading" title={initialQuery.length >= 2 ? 'Search results' : 'Explore the catalog'} />
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filter results">
                {([['all', 'All'], ['movie', 'Movies'], ['series', 'Series']] as const).map(([value, label]) => <FilterChip key={value} onClick={() => setActiveKind(value)} selected={activeKind === value}>{label}</FilterChip>)}
              </div>
            </div>
            <div className="mt-9">
              {results.length > 0 ? <CatalogGrid items={results} /> : <EmptyState description="Try a different title, spelling, or switch back to all results." title="No titles found" />}
            </div>
          </section>

          <section className="border-t border-border py-14 sm:py-16 lg:py-20" id="people" aria-labelledby="people-heading"><SectionHeading description="Member discovery arrives with the social slice." id="people-heading" title="People" /><EmptyState description="No member suggestions yet. Consumit does not fabricate profiles, follows, or activity." title="Social discovery is not available" /></section>

          <section className="border-t border-border py-14 sm:py-16 lg:py-20" aria-labelledby="mood-heading">
            <SectionHeading description="Pick a lane and jump back to the results." id="mood-heading" title="What kind of night is it?" />
            <div className="mt-7 flex flex-col gap-4 xl:flex-row xl:items-start">
              <MoodSelector className="flex-1" label="Choose tonight’s mood" onValueChange={setMood} options={moodOptions} value={mood} />
              <a className={`${buttonVariants({ size: 'lg' })} justify-between xl:min-w-[19rem]`} href="#results">Surprise me tonight<ArrowRight aria-hidden="true" /></a>
            </div>
          </section>
        </div>
      </main>
    </ScreenShell>
  )
}
