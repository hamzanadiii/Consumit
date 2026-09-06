'use client'

import { ArrowRight, Bookmark, Play } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'

import {
  ActivityItem,
  Badge,
  ContentCard,
  CuratedListCard,
  FilterChip,
  FriendRow,
  SectionHeading,
  SocialProof,
  Tabs,
  buttonVariants,
} from '@consumit/ui'

import { ScreenShell, artwork, circle } from '../screens/screen-shell'

const feed = [
  {
    context: 'Rated a film · 18 minutes ago',
    detail: '2026 · Mystery · 2h 08m',
    member: 'Yasmine El Idrissi',
    quote: 'It moves like a dream where you know something terrible happened, but not to whom.',
    rating: 4.5,
    src: artwork.northbound,
    title: 'The Last City After Rain',
  },
  {
    context: 'Finished a series · 1 hour ago',
    detail: 'Season 2 · Eight episodes',
    member: 'Omar Benjelloun',
    quote: 'The last hallway finally makes sense. I wish that made me feel better.',
    rating: 5,
    src: artwork.violetHours,
    title: 'Violet Hours',
  },
  {
    context: 'Added a favorite · 3 hours ago',
    detail: '2025 · Drama · 1h 52m',
    member: 'Nadia Alaoui',
    quote: 'Quiet, tidal, and absolutely certain of its ending.',
    rating: 4.5,
    src: artwork.saltwater,
    title: 'Sea of Names',
  },
] as const

const suggestions = [
  ['Leila Mansouri', 91, 'Patient cinema and difficult homecomings'],
  ['Adam Rouissi', 86, 'Small films with enormous weather'],
  ['Mina Serraj', 82, 'Tender horror and impossible cities'],
] as const

const talkedAbout = [
  ['Violet Hours', artwork.violetHours, '11 people · 4.5 avg'],
  ['Sea of Names', artwork.saltwater, '8 people · 4.7 avg'],
  ['Third Sun', artwork.thirdSun, '7 people · 4.3 avg'],
  ['Atlas Motel', artwork.northbound, '6 people · 4.6 avg'],
  ['The Returning', artwork.violetHours, '5 people · 4.1 avg'],
  ['Saltwater', artwork.saltwater, '4 people · 4.4 avg'],
] as const

function slugify(value: string) {
  return value.toLowerCase().replaceAll(' ', '-')
}

export function FriendsScreen() {
  const [filter, setFilter] = useState('Everything')
  const [following, setFollowing] = useState<Record<string, boolean>>({})

  return (
    <ScreenShell activeHref="/friends">
      <main className="mx-auto w-full max-w-[90rem]" data-consumit-friends-screen>
        <section className="relative isolate overflow-hidden border-b border-border px-5 py-16 sm:px-8 sm:py-20 lg:px-[62px] lg:py-24">
          <Image alt="" className="-z-20 object-cover opacity-30" fill priority sizes="100vw" src={artwork.backdrop} />
          <span aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(9,9,11,.98),rgba(9,9,11,.72)_62%,rgba(9,9,11,.44))]" />
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-end">
            <div>
              <h1 className="max-w-[11ch] text-balance font-display text-5xl leading-[0.95] tracking-[-0.03em] text-ink sm:text-6xl lg:text-[5.25rem]">Your circle, in motion.</h1>
              <p className="mt-6 max-w-[62ch] text-sm leading-7 text-copy sm:text-base">See what trusted people finished, loved, questioned, and carefully placed on a list.</p>
            </div>
            <SocialProof detail="12 new ratings since last night" items={circle} label="Yasmine, Omar, and Nadia are active" text={<strong className="text-ink">Three people you trust are watching now</strong>} />
          </div>
        </section>

        <div className="px-5 sm:px-8 lg:px-[62px]">
          <Tabs
            activeValue="activity"
            aria-label="Circle sections"
            items={[
              { href: '#activity', label: 'Activity', value: 'activity' },
              { href: '#talked-about', label: 'Talked about', value: 'talked' },
              { href: '#circulating-lists', label: 'Lists', value: 'lists' },
              { href: '#people', label: 'People', value: 'people' },
            ]}
          />

          <section className="py-14 sm:py-16 lg:py-20" id="activity" aria-labelledby="activity-heading">
            <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_23rem] xl:gap-14">
              <div className="min-w-0">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                  <SectionHeading description="Asynchronous updates from people you follow—no private messaging or live chat." id="activity-heading" title="From your circle" />
                  <div className="flex flex-wrap gap-2">
                    {['Everything', 'Ratings', 'Reviews', 'Lists'].map((label) => (
                      <FilterChip key={label} onClick={() => setFilter(label)} selected={filter === label}>{label}</FilterChip>
                    ))}
                  </div>
                </div>
                <p aria-live="polite" className="mt-5 text-xs text-muted">Showing {filter.toLowerCase()} from your circle.</p>
                <div className="mt-8 space-y-5">
                  {feed.map((item) => (
                    <ActivityItem
                      action={<Link className={buttonVariants({ size: 'sm', variant: 'secondary' })} href={`/title/${item.title.toLowerCase().replaceAll(' ', '-')}`} prefetch={false}>View title <ArrowRight aria-hidden="true" /></Link>}
                      artworkSrc={item.src}
                      context={item.context}
                      detail={item.detail}
                      key={item.member}
                      memberHref={`/profile/${slugify(item.member.split(' ')[0]!)}`}
                      memberName={item.member}
                      quote={item.quote}
                      rating={item.rating}
                      title={item.title}
                      titleHref={`/title/${item.title.toLowerCase().replaceAll(' ', '-')}`}
                    />
                  ))}
                </div>
              </div>

              <aside className="space-y-6 xl:sticky xl:top-7 xl:self-start" aria-label="Circle context">
                <section className="rounded-card border border-border bg-surface p-5" id="people">
                  <h2 className="font-display text-2xl text-ink">People worth following</h2>
                  <p className="mt-2 text-xs leading-5 text-muted">Suggested by shared favorites and matching rating habits.</p>
                  <div className="mt-4">
                    {suggestions.map(([name, overlap, detail]) => (
                      <FriendRow
                        detail={detail}
                        following={Boolean(following[name])}
                        href={`/profile/${slugify(name.split(' ')[0]!)}`}
                        key={name}
                        name={name}
                        onAction={() => setFollowing((current) => ({ ...current, [name]: !current[name] }))}
                        overlap={overlap}
                      />
                    ))}
                  </div>
                </section>
                <section className="rounded-card border border-border bg-surface p-5">
                  <h2 className="text-sm font-bold text-ink">Your circle pulse</h2>
                  <dl className="mt-5 grid grid-cols-2 gap-5">
                    <div><dt className="text-xs text-muted">Active today</dt><dd className="mt-1 font-display text-3xl text-ink">14</dd></div>
                    <div><dt className="text-xs text-muted">Shared saves</dt><dd className="mt-1 font-display text-3xl text-ink">38</dd></div>
                  </dl>
                </section>
              </aside>
            </div>
          </section>

          <section className="scroll-mt-8 border-t border-border py-14 sm:py-16 lg:py-20" id="talked-about" aria-labelledby="talked-heading">
            <SectionHeading description="Titles creating useful conversation across your circle." id="talked-heading" title="Talked about tonight" />
            <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-9 sm:grid-cols-4 lg:grid-cols-6">
              {talkedAbout.map(([title, src, meta]) => (
                <ContentCard artworkSrc={src} badge={<Badge tone="lilac">Circle pick</Badge>} friends={circle} href={`/title/${slugify(title)}`} key={title} meta={meta} title={title} />
              ))}
            </div>
          </section>

          <section className="scroll-mt-8 border-t border-border py-14 sm:py-16 lg:py-20" id="circulating-lists" aria-labelledby="circulating-heading">
            <SectionHeading description="Lists being saved and revised by people you trust." id="circulating-heading" title="Circulating through your circle" />
            <div className="mt-8 grid gap-5 md:grid-cols-3">
              <CuratedListCard artworkSources={[artwork.northbound, artwork.thirdSun, artwork.saltwater, artwork.violetHours]} curator="Yasmine" href="/lists/films-that-feel-like-a-memory" saves="1.2K" title="Films that feel like a memory" />
              <CuratedListCard artworkSources={[artwork.violetHours, artwork.saltwater, artwork.northbound, artwork.thirdSun]} curator="Omar" href="/lists/one-perfect-film-for-every-mood" saves="846" title="One perfect film for every mood" />
              <CuratedListCard artworkSources={[artwork.saltwater, artwork.northbound, artwork.violetHours, artwork.thirdSun]} curator="Nadia" href="/lists/beautifully-strange" saves="633" title="Beautifully strange and worth it" />
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className={buttonVariants({ variant: 'primary' })} href="/lists/films-that-feel-like-a-memory" prefetch={false}><Bookmark aria-hidden="true" /> Open a list</Link>
              <Link className={buttonVariants({ variant: 'secondary' })} href="/watch/violet-hours-s2-e4" prefetch={false}><Play aria-hidden="true" /> Watch what’s moving</Link>
            </div>
          </section>
        </div>
      </main>
    </ScreenShell>
  )
}
