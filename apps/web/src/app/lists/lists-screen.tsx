import Link from 'next/link'
import { ListVideo } from 'lucide-react'

import { ArtworkFrame, SectionHeading, Tabs } from '@consumit/ui'

import { FilScreenShell } from '../shared'

export type ListsScreenList = {
  description: string | null
  itemCount: number
  name: string
  posters: readonly (string | undefined)[]
  slug: string
  visibility: 'private' | 'public'
}

function ListCollageCard({ list }: { list: ListsScreenList }) {
  const posters = list.posters.slice(0, 5)
  return (
    <li>
      <Link
        aria-label={`${list.name}, ${list.itemCount} ${list.itemCount === 1 ? 'film' : 'films'}`}
        className="group block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]"
        href={`/lists/${list.slug}`}
        prefetch={false}
      >
        {posters.length === 0 ? (
          <span className="grid aspect-[16/10] w-full place-items-center rounded-2xl border border-dashed border-[var(--fs-field-border)] bg-[var(--fs-field)]">
            <ListVideo aria-hidden="true" className="size-8 text-[var(--fs-muted)]" />
          </span>
        ) : (
          <span className="relative block aspect-[16/10] w-full overflow-hidden rounded-2xl border border-[var(--fs-field-border)] bg-[var(--fs-field)] transition-all duration-200 ease-out group-hover:-translate-y-1 group-hover:border-[var(--fs-accent)]/60 group-hover:shadow-[0_16px_40px_rgba(0,0,0,0.4)] motion-reduce:transition-none motion-reduce:transform-none">
            {posters.map((src, index) => (
              <span
                className="absolute top-[6%] aspect-[2/3] h-[88%] overflow-hidden rounded-md border border-white/15 shadow-lg"
                key={`${src ?? 'missing'}-${index}`}
                style={{ left: `${4 + index * 15.5}%`, width: '30%', zIndex: index }}
              >
                <ArtworkFrame alt="" className="h-full w-full rounded-none border-0" src={src} />
              </span>
            ))}
            <span aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(0deg,rgba(0,0,0,0.35)_0%,transparent_35%)]" />
          </span>
        )}
        <span className="mt-4 block font-display text-2xl leading-tight tracking-[-0.02em] text-[var(--fs-ink)] transition-colors group-hover:text-[var(--fs-accent)]">
          {list.name}
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--fs-muted)]">
          <span>Created by You</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{list.itemCount} {list.itemCount === 1 ? 'film' : 'films'}</span>
          {list.visibility === 'private' ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="rounded-full border border-[var(--fs-field-border)] bg-[var(--fs-rail)] px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase">
                Private
              </span>
            </>
          ) : null}
        </span>
        {list.description ? (
          <span className="mt-2 block text-sm leading-6 text-[var(--fs-secondary)] line-clamp-2">
            {list.description}
          </span>
        ) : null}
      </Link>
    </li>
  )
}

/**
 * The member's own lists with real collage artwork, plus an honest discovery
 * placeholder. List discovery has no backend yet, so no member evidence is
 * invented — public lists from followed members will surface here once the
 * social slice lands.
 */
export function ListsScreen({ catalogUnavailable = false, lists }: {
  catalogUnavailable?: boolean
  lists: readonly ListsScreenList[]
}) {
  return (
    <FilScreenShell pageHeading={undefined}>
      <main className="mx-auto w-full max-w-[90rem]" data-consumit-lists-screen>
        <h1 className="sr-only">Your lists</h1>
        <div className="px-1 sm:px-3 lg:px-4">
          <p className="text-xs font-bold tracking-[0.18em] text-[var(--fs-muted)] uppercase">Collect</p>
          <p className="mt-2 max-w-3xl font-display text-[clamp(2.25rem,4.5vw,3.75rem)] leading-[0.95] font-normal tracking-[-0.025em] text-[var(--fs-ink)]">
            Lists.
          </p>
          <p className="mt-4 max-w-[62ch] text-sm leading-6 text-[var(--fs-secondary)]">
            Collect, curate, and share. Lists group films and series into something worth passing on.
          </p>

          <div className="mt-8">
            <Tabs
              activeValue="your-lists"
              aria-label="Lists sections"
              items={[
                { href: '#your-lists', label: 'Your lists', value: 'your-lists' },
                { href: '#discover', label: 'Discover', value: 'discover' },
              ]}
            />
          </div>

          {catalogUnavailable ? (
            <p className="mt-6 rounded-[16px] border border-[var(--fs-field-border)] bg-[var(--fs-field)] p-4 text-xs leading-5 text-[var(--fs-muted)]" role="status">
              Your lists are available, but TMDB artwork and title details could not load.
            </p>
          ) : null}

          <section className="py-10 sm:py-12 lg:py-14" id="your-lists" aria-labelledby="your-lists-heading">
            <SectionHeading
              description={lists.length === 0 ? undefined : `${lists.length} ${lists.length === 1 ? 'list' : 'lists'}, most recently touched first.`}
              id="your-lists-heading"
              title="Your lists"
            />
            {lists.length === 0 ? (
              <div className="mt-8 rounded-[16px] border border-dashed border-[var(--fs-field-border)] bg-[var(--fs-field)] px-6 py-10 text-sm leading-6 text-[var(--fs-muted)]">
                No lists yet — lists you import will live here.{' '}
                <Link className="font-bold text-[var(--fs-accent)] underline decoration-[var(--fs-accent)]/40 underline-offset-4 outline-none hover:text-[var(--fs-ink)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" href="/settings/imports/letterboxd">
                  Import from Letterboxd
                </Link>
              </div>
            ) : (
              <ul className="mt-8 grid gap-x-6 gap-y-10 sm:grid-cols-2 xl:grid-cols-3">
                {lists.map((list) => <ListCollageCard key={list.slug} list={list} />)}
              </ul>
            )}
          </section>

          <section className="border-t border-[var(--fs-line)] py-10 sm:py-12 lg:py-14" id="discover" aria-labelledby="discover-heading">
            <SectionHeading id="discover-heading" title="Discover lists" />
            <div className="mt-8 rounded-[16px] border border-dashed border-[var(--fs-field-border)] bg-[var(--fs-field)] px-6 py-10 text-sm leading-6 text-[var(--fs-muted)]">
              List discovery hasn&apos;t landed yet. Public lists from members you follow will surface here once the social slice is built — nothing here is sampled or ranked today.
            </div>
          </section>
        </div>
      </main>
    </FilScreenShell>
  )
}
