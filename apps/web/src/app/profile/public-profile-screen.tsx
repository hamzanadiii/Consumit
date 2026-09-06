'use client'

import { titleHref, watchHref, type CatalogTitleSummary } from '@consumit/contracts'
import { EllipsisVertical, Eye, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'

import { Badge, Button, ContentCard, ContinueCard, CuratedListCard, DiaryRow, MemberByline, ProfileMasthead, ProfileReviewCard, SectionHeading, Tabs, buttonVariants } from '@consumit/ui'

import { CatalogStaleNotice, titleMeta } from '../catalog/catalog-ui'
import { ScreenShell } from '../screens/screen-shell'

const circleMembers = [{ name: 'Yasmine' }, { name: 'Omar' }, { name: 'Nadia' }, { name: 'Adam' }] as const

function displayName(username: string) {
  return username.split(/[-_.]+/).filter(Boolean).map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(' ') || 'Member'
}

function ProfileScreen({ owner = false, stale, titles, username }: { owner?: boolean; stale: boolean; titles: readonly CatalogTitleSummary[]; username: string }) {
  const [following, setFollowing] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const normalized = username.trim().replace(/^@+/, '') || 'member'
  const name = displayName(normalized)
  const ownerView = owner && !previewing
  const featured = titles[6] ?? titles[0]
  return (
    <ScreenShell activeHref={`/profile/${encodeURIComponent(normalized)}`}>
      {stale ? <CatalogStaleNotice meta={{ fetchedAt: new Date(0).toISOString(), language: 'en-US', region: 'US', source: 'tmdb', stale }} /> : null}
      <main className="mx-auto min-h-screen w-full max-w-[90rem]" data-consumit-owner-profile={ownerView || undefined} data-consumit-public-profile={!ownerView || undefined}>
        <h1 className="sr-only">{ownerView ? 'Your profile' : `${name}'s public profile`}</h1>
        <ProfileMasthead actions={ownerView ? <><a className={buttonVariants()} href="/settings"><Pencil aria-hidden="true" /> Edit profile</a><Button onClick={() => setPreviewing(true)} variant="secondary"><Eye aria-hidden="true" /> Preview</Button><Button aria-label="Create a new list" size="icon" variant="secondary"><Plus aria-hidden="true" /></Button></> : <>{owner ? <Button onClick={() => setPreviewing(false)}>Exit preview</Button> : <Button aria-pressed={following} onClick={() => setFollowing((value) => !value)} variant={following ? 'secondary' : 'primary'}>{following ? 'Following' : 'Follow'}</Button>}<Button aria-label="More profile actions" size="icon" variant="secondary"><EllipsisVertical aria-hidden="true" /></Button></>} avatarClassName="size-28 lg:size-36" avatarSrc="/assets/hamza-avatar.svg" backgroundSrc={titles.find((title) => title.backdropUrl)?.backdropUrl ?? undefined} bio="Chasing stories that feel like memories I never had." className="rounded-none border-x-0 border-t-0 lg:min-h-[24.75rem] lg:px-[62px]" contentClassName="lg:inset-x-[62px]" handle={`@${normalized}`} joined="Joined 2024" location="Rabat, Morocco" name={name} stats={[{ label: 'films', value: 284 }, { label: 'series', value: 39 }, { label: 'lists', value: 23 }, { label: 'followers', value: 186 }]} status="online" />
        <Tabs activeValue="overview" aria-label={`${name} profile sections`} className="bg-navigation px-5 sm:px-8 lg:px-[62px]" items={[{ href: '#overview', label: 'Overview', value: 'overview' }, { href: '#diary', label: 'Diary', value: 'diary' }, { href: '#favorites', label: 'Favorites', value: 'favorites' }, { href: '#reviews', label: 'Reviews', value: 'reviews' }, { href: '#lists', label: 'Lists', value: 'lists' }, { href: '#circle', label: 'Circle', value: 'circle' }]} />
        <div className="px-5 sm:px-8 lg:px-[62px]" id="overview">
          <section className="py-12 sm:py-14 lg:py-16" id="favorites" aria-labelledby="favorites-heading"><div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_26.5rem]"><div><SectionHeading description="Favorite movies and series, mixed together" id="favorites-heading" title="The four that explain me" /><div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">{titles.slice(0, 4).map((title) => <ContentCard artworkSrc={title.posterUrl ?? undefined} badge={<Badge tone="neutral">{title.kind === 'movie' ? 'Film' : 'Series'}</Badge>} href={titleHref(title)} key={`${title.kind}:${title.id}`} meta={titleMeta(title)} title={title.title} />)}</div></div>{featured ? <aside className="self-start rounded-card border border-border bg-surface p-5"><h2 className="text-sm font-bold text-ink">Watching now</h2><ContinueCard artworkSrc={featured.backdropUrl ?? featured.posterUrl ?? undefined} className="mt-4" href={watchHref(featured)} layout="compact" meta={featured.kind === 'series' ? 'Season 1 · Episode 3' : '42 minutes left'} progress={37} title={featured.title} /></aside> : null}</div></section>
          <section className="border-t border-border py-12 sm:py-14 lg:py-16" id="diary" aria-labelledby="diary-heading"><div className="max-w-5xl"><SectionHeading id="diary-heading" title="Recent diary" /><div className="mt-6">{titles.slice(4, 8).map((title, index) => <DiaryRow artworkSrc={title.posterUrl ?? undefined} date={['26 Aug', '23 Aug', '19 Aug', '14 Aug'][index] ?? 'Recently'} detail={index === 1 ? 'Watched with Yasmine and Omar' : 'Finished'} href={titleHref(title)} key={`${title.kind}:${title.id}`} note={index === 0 ? 'Still holds up in exactly the right places.' : undefined} title={title.title} />)}</div></div></section>
          <section className="border-t border-border py-12 sm:py-14 lg:py-16" id="reviews" aria-labelledby="reviews-heading"><SectionHeading id="reviews-heading" title="Reviews that stayed with people" /><div className="mt-8 grid gap-5 lg:grid-cols-2">{titles.slice(8, 10).map((title, index) => <ProfileReviewCard artworkSrc={title.posterUrl ?? undefined} excerpt={index === 0 ? 'Some stories explain loneliness. This one lets it sit beside you.' : 'I understood only half of it. That half changed my week.'} href={titleHref(title)} key={`${title.kind}:${title.id}`} likes={String(73 + index * 46)} reviewedOn={index === 0 ? '26 August' : '14 August'} title={title.title} />)}</div></section>
          <section className="border-t border-border py-12 sm:py-14 lg:py-16" id="lists" aria-labelledby="lists-heading"><SectionHeading id="lists-heading" title={`${name}’s lists`} /><div className="mt-8 grid gap-5 md:grid-cols-3">{['Films that feel like a memory', 'Movies for a quiet breakdown', 'Beautifully strange and worth it'].map((list, index) => <CuratedListCard artworkSources={titles.slice(index, index + 4).map((title) => title.posterUrl ?? undefined)} curator={name} href="/lists/films-that-feel-like-a-memory" key={list} saves={String(319 + index * 107)} title={list} />)}</div></section>
          <section className="border-t border-border py-12 sm:py-14 lg:py-16" id="circle" aria-labelledby="circle-heading"><SectionHeading action={<span className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-orange">186 followers</span>} id="circle-heading" title={`People in ${name}’s circle`} /><div className="mt-8 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">{circleMembers.map((member) => <MemberByline key={member.name} meta="In the circle" name={member.name} />)}</div></section>
        </div>
      </main>
    </ScreenShell>
  )
}

export function PublicProfileScreen(props: { stale: boolean; titles: readonly CatalogTitleSummary[]; username: string }) { return <ProfileScreen {...props} /> }
export function OwnerProfileScreen(props: { stale: boolean; titles: readonly CatalogTitleSummary[]; username?: string }) { return <ProfileScreen owner stale={props.stale} titles={props.titles} username={props.username ?? 'hamza'} /> }
