'use client'

import { titleHref, type CatalogTitleSummary } from '@consumit/contracts'
import { ArrowRight, Bookmark } from 'lucide-react'
import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'

import { ActivityItem, Badge, ContentCard, CuratedListCard, FilterChip, FriendRow, SectionHeading, SocialProof, Tabs, buttonVariants } from '@consumit/ui'

import { titleMeta, CatalogStaleNotice } from '../catalog/catalog-ui'
import { ScreenShell, circle } from '../screens/screen-shell'

const members = ['Yasmine El Idrissi', 'Omar Benjelloun', 'Nadia Alaoui'] as const
const quotes = ['It kept unfolding after the credits.', 'Patient, exact, and worth the wait.', 'The ending knows precisely when to leave.'] as const

export function FriendsScreen({ stale, titles }: { stale: boolean; titles: readonly CatalogTitleSummary[] }) {
  const [filter, setFilter] = useState('Everything')
  const [following, setFollowing] = useState<Record<string, boolean>>({})
  const feed = titles.slice(0, 3)
  const backdrop = titles.find((title) => title.backdropUrl)?.backdropUrl
  return (
    <ScreenShell activeHref="/friends">
      {stale ? <CatalogStaleNotice meta={{ fetchedAt: new Date(0).toISOString(), language: 'en-US', region: 'US', source: 'tmdb', stale }} /> : null}
      <main className="mx-auto w-full max-w-[90rem]" data-consumit-friends-screen>
        <section className="relative isolate overflow-hidden border-b border-border px-5 py-16 sm:px-8 sm:py-20 lg:px-[62px] lg:py-24">
          {backdrop ? <Image alt="" className="-z-20 object-cover opacity-30" fill priority sizes="100vw" src={backdrop} /> : null}<span aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(9,9,11,.98),rgba(9,9,11,.72)_62%,rgba(9,9,11,.44))]" />
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-end"><div><h1 className="max-w-[11ch] text-balance font-display text-5xl leading-[0.95] tracking-[-0.03em] text-ink sm:text-6xl lg:text-[5.25rem]">Your circle, in motion.</h1><p className="mt-6 max-w-[62ch] text-sm leading-7 text-copy sm:text-base">See what trusted people finished, loved, questioned, and carefully placed on a list.</p></div><SocialProof detail="12 new ratings since last night" items={circle} label="Yasmine, Omar, and Nadia are active" text={<strong className="text-ink">Three people you trust are watching now</strong>} /></div>
        </section>
        <div className="px-5 sm:px-8 lg:px-[62px]">
          <Tabs activeValue="activity" aria-label="Circle sections" items={[{ href: '#activity', label: 'Activity', value: 'activity' }, { href: '#talked-about', label: 'Talked about', value: 'talked' }, { href: '#lists', label: 'Lists', value: 'lists' }, { href: '#people', label: 'People', value: 'people' }]} />
          <section className="py-14 sm:py-16 lg:py-20" id="activity" aria-labelledby="activity-heading">
            <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_23rem] xl:gap-14"><div><div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><SectionHeading description="Asynchronous updates only—no private messaging or live chat." id="activity-heading" title="From your circle" /><div className="flex flex-wrap gap-2">{['Everything', 'Ratings', 'Reviews', 'Lists'].map((label) => <FilterChip key={label} onClick={() => setFilter(label)} selected={filter === label}>{label}</FilterChip>)}</div></div><p aria-live="polite" className="mt-5 text-xs text-muted">Showing {filter.toLowerCase()} from your circle.</p><div className="mt-8 space-y-5">{feed.map((title, index) => <ActivityItem action={<a className={buttonVariants({ size: 'sm', variant: 'secondary' })} href={titleHref(title)}>View title <ArrowRight aria-hidden="true" /></a>} artworkSrc={title.posterUrl ?? undefined} context={`${index === 0 ? 'Rated' : index === 1 ? 'Finished' : 'Favorited'} · ${index + 1} hour ago`} detail={titleMeta(title)} key={`${title.kind}:${title.id}`} memberHref={`/profile/${(members[index] ?? 'Hamza').split(' ')[0]?.toLowerCase()}`} memberName={members[index] ?? 'Hamza'} quote={quotes[index]} rating={5 - index * 0.5} title={title.title} titleHref={titleHref(title)} />)}</div></div>
              <aside className="space-y-6 xl:sticky xl:top-7 xl:self-start" id="people"><section className="rounded-card border border-border bg-surface p-5"><h2 className="font-display text-2xl text-ink">People worth following</h2><p className="mt-2 text-xs leading-5 text-muted">Suggested by shared favorites and rating habits.</p><div className="mt-4">{[['Leila Mansouri', 91, 'Patient cinema and difficult homecomings'], ['Adam Rouissi', 86, 'Small films with enormous weather'], ['Mina Serraj', 82, 'Tender horror and impossible cities']].map(([name, overlap, detail]) => <FriendRow detail={String(detail)} following={Boolean(following[String(name)])} href={`/profile/${String(name).split(' ')[0]?.toLowerCase()}`} key={String(name)} name={String(name)} onAction={() => setFollowing((current) => ({ ...current, [String(name)]: !current[String(name)] }))} overlap={Number(overlap)} />)}</div></section></aside>
            </div>
          </section>
          <section className="border-t border-border py-14 sm:py-16 lg:py-20" id="talked-about" aria-labelledby="talked-heading"><SectionHeading description="Titles creating useful conversation across your circle." id="talked-heading" title="Talked about tonight" /><div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-9 sm:grid-cols-4 lg:grid-cols-6">{titles.slice(3, 9).map((title) => <ContentCard artworkSrc={title.posterUrl ?? undefined} badge={<Badge tone="lilac">Circle pick</Badge>} friends={circle} href={titleHref(title)} key={`${title.kind}:${title.id}`} meta="People you follow are watching" title={title.title} />)}</div></section>
          <section className="border-t border-border py-14 sm:py-16 lg:py-20" id="lists" aria-labelledby="circulating-heading"><SectionHeading description="Lists being saved and revised by people you trust." id="circulating-heading" title="Circulating through your circle" /><div className="mt-8 grid gap-5 md:grid-cols-3">{members.map((member, index) => <CuratedListCard artworkSources={titles.slice(index, index + 4).map((title) => title.posterUrl ?? undefined)} curator={member.split(' ')[0] ?? member} href="/lists/films-that-feel-like-a-memory" key={member} saves={String(633 + index * 213)} title={['Films that feel like a memory', 'One perfect film for every mood', 'Beautifully strange and worth it'][index] ?? 'A circle list'} />)}</div><Link className={`${buttonVariants()} mt-8`} href="/lists/films-that-feel-like-a-memory"><Bookmark aria-hidden="true" /> Open a list</Link></section>
        </div>
      </main>
    </ScreenShell>
  )
}
