'use client'

import { ArrowRight, EllipsisVertical } from 'lucide-react'
import { useState } from 'react'

import {
  Badge,
  Button,
  CompatibilityPanel,
  ContentCard,
  ContinueCard,
  CuratedListCard,
  DiaryRow,
  Footer,
  GlobalNavigation,
  MemberByline,
  ProfileMasthead,
  ProfileReviewCard,
  RatingRhythm,
  SectionHeading,
  TasteSignature,
  Tabs,
} from '@consumit/ui'

const artwork = {
  backdrop: '/assets/cinematic-backdrop.svg',
  northbound: '/assets/posters/northbound.svg',
  saltwater: '/assets/posters/saltwater.svg',
  thirdSun: '/assets/posters/third-sun.svg',
  violetHours: '/assets/posters/violet-hours.svg',
} as const

const mutuals = [
  { name: 'Yasmine' },
  { name: 'Omar' },
  { name: 'Nadia' },
] as const

const favoriteTitles = [
  { artworkSrc: artwork.northbound, kind: 'Film', meta: '2019 · ★★★★★', title: 'Northbound' },
  { artworkSrc: artwork.violetHours, kind: 'Series', meta: '2022– · ★★★★½', title: 'Violet Hours' },
  { artworkSrc: artwork.thirdSun, kind: 'Film', meta: '2021 · ★★★★★', title: 'Third Sun' },
  { artworkSrc: artwork.saltwater, kind: 'Series', meta: '2024– · ★★★★★', title: 'Saltwater' },
] as const

const diaryEntries = [
  { artworkSrc: artwork.northbound, date: '26 Aug', detail: 'Rewatched', note: 'Still hurts in exactly the right places.', rating: 4.5, title: 'Atlas Motel' },
  { artworkSrc: artwork.saltwater, date: '23 Aug', detail: 'Watched with Yasmine and Omar', rating: 5, title: 'Sea of Names' },
  { artworkSrc: artwork.violetHours, date: '19 Aug', detail: 'First watch · Liked', rating: 3.5, title: 'The Returning' },
  { artworkSrc: artwork.thirdSun, date: '14 Aug', detail: 'Rewatched · Favorite', rating: 5, title: 'Third Sun' },
] as const

const circleMembers = [
  { name: 'Yasmine', overlap: 91 },
  { name: 'Omar', overlap: 84 },
  { name: 'Nadia', overlap: 82 },
  { name: 'Adam', overlap: 79 },
] as const

const profileTabs = [
  { href: '#overview', label: 'Overview', value: 'overview' },
  { href: '#diary', label: 'Diary', value: 'diary' },
  { href: '#favorites', label: 'Favorites', value: 'favorites' },
  { href: '#reviews', label: 'Reviews', value: 'reviews' },
  { href: '#lists', label: 'Lists', value: 'lists' },
  { href: '#circle', label: 'Circle', value: 'circle' },
] as const

function SectionAction({ href, label }: { href: string; label: string }) {
  return (
    <a
      className="inline-flex min-h-11 items-center gap-2 rounded-control px-1 text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-orange outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-orange motion-reduce:transition-none"
      href={href}
    >
      {label}
      <ArrowRight aria-hidden="true" className="size-3.5" />
    </a>
  )
}

function displayNameFromUsername(username: string) {
  return username
    .split(/[-_.]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ') || 'Member'
}

export function PublicProfileScreen({ username }: { username: string }) {
  const [following, setFollowing] = useState(false)
  const normalizedUsername = username.trim().replace(/^@+/, '') || 'member'
  const name = displayNameFromUsername(normalizedUsername)
  const profilePath = `/profile/${encodeURIComponent(normalizedUsername)}`

  return (
    <>
      <GlobalNavigation
        activeHref={profilePath}
        avatarSrc="/assets/hamza-avatar.svg"
        profileHref={profilePath}
        profileName={name}
        searchPlaceholder="Search titles, people, lists"
        sticky={false}
      />

      <main className="mx-auto min-h-screen w-full max-w-[90rem]" data-consumit-public-profile>
        <h1 className="sr-only">{name}&apos;s public profile</h1>
        <ProfileMasthead
          actions={(
            <>
              <Button
                aria-pressed={following}
                onClick={() => setFollowing((current) => !current)}
                variant={following ? 'secondary' : 'primary'}
              >
                {following ? 'Following' : 'Follow'}
              </Button>
              <Button aria-label="More profile actions" size="icon" variant="secondary">
                <EllipsisVertical aria-hidden="true" />
              </Button>
            </>
          )}
          avatarClassName="size-28 lg:size-36"
          avatarSrc="/assets/hamza-avatar.svg"
          backgroundSrc="/assets/cinematic-backdrop.svg"
          bio="Chasing films that feel like memories I never had."
          className="rounded-none border-x-0 border-t-0 lg:min-h-[24.75rem] lg:px-[62px]"
          contentClassName="lg:inset-x-[62px]"
          handle={`@${normalizedUsername}`}
          joined="Joined 2024"
          location="Rabat, Morocco"
          name={name}
          stats={[
            { label: 'films', value: 284 },
            { label: 'series', value: 39 },
            { label: 'lists', value: 23 },
            { label: 'followers', value: 186 },
          ]}
          status="online"
        />
        <Tabs
          activeValue="overview"
          aria-label={`${name} profile sections`}
          className="bg-navigation px-5 sm:px-8 lg:px-[62px]"
          items={profileTabs}
        />
        <div className="px-5 sm:px-8 lg:px-[62px]" id="overview">
          <section
            aria-labelledby="favorites-heading"
            className="scroll-mt-20 py-14 sm:py-16 lg:py-20"
            id="favorites"
          >
            <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_26.5rem]">
              <div className="min-w-0">
                <SectionHeading
                  description="Favorite movies and series, mixed together"
                  id="favorites-heading"
                  title="The four that explain me"
                />
                <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {favoriteTitles.map((item) => (
                    <ContentCard
                      artworkSrc={item.artworkSrc}
                      badge={<Badge tone="neutral">{item.kind}</Badge>}
                      href={`#${item.title.toLowerCase().replaceAll(' ', '-')}`}
                      key={item.title}
                      meta={item.meta}
                      title={item.title}
                    />
                  ))}
                </div>
              </div>

              <aside className="space-y-5" aria-label="Taste compatibility and current watch">
                <CompatibilityPanel
                  items={mutuals}
                  memberName={name}
                  mutuals="12 shared circle members · 46 shared favorites"
                  reason="You both love slow science fiction, uneasy cities, and endings that refuse to explain themselves."
                  score={87}
                />
                <div className="rounded-card border border-border bg-surface p-5">
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="text-sm font-bold text-ink">Watching now</h3>
                    <span className="inline-flex items-center gap-2 text-xs text-muted">
                      <span aria-hidden="true" className="size-2 rounded-full bg-lime" />
                      <span className="sr-only">{name} is online</span>
                    </span>
                  </div>
                  <ContinueCard
                    artworkSrc={artwork.violetHours}
                    className="mt-4"
                    href="#fault-lines"
                    layout="compact"
                    meta="Season 1 · Episode 6 · This show is cooking."
                    progress={37}
                    title="Fault Lines"
                  />
                </div>
              </aside>
            </div>
          </section>

          <section
            aria-labelledby="diary-heading"
            className="scroll-mt-20 border-t border-border py-14 sm:py-16 lg:py-20"
            id="diary"
          >
            <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_26.5rem]">
              <div className="min-w-0">
                <SectionHeading
                  action={<SectionAction href="#full-diary" label="Full diary" />}
                  id="diary-heading"
                  title="Recent diary"
                />
                <div className="mt-6">
                  {diaryEntries.map((entry, index) => (
                    <DiaryRow
                      action={index === 0 ? <a className="inline-flex min-h-11 items-center text-xs text-muted outline-none hover:text-orange focus-visible:ring-2 focus-visible:ring-orange" href="#atlas-review">Review</a> : undefined}
                      artworkSrc={entry.artworkSrc}
                      date={entry.date}
                      detail={entry.detail}
                      href={`#diary-${entry.title.toLowerCase().replaceAll(' ', '-')}`}
                      key={`${entry.date}-${entry.title}`}
                      note={'note' in entry ? entry.note : undefined}
                      rating={entry.rating}
                      title={entry.title}
                    />
                  ))}
                </div>
              </div>

              <aside className="space-y-5" aria-label={`${name} taste summary`}>
                <TasteSignature
                  detail="Rates fewer titles than 82% of members · Average 4.1"
                  statement="Restless futures. Quiet dread. People trying to come home."
                  worlds={[
                    { label: 'Sci-fi', tone: 'orange' },
                    { label: 'Mystery', tone: 'lilac' },
                    { label: 'Slow cinema', tone: 'lime' },
                  ]}
                />
                <RatingRhythm values={[5, 10, 18, 24, 31, 21, 14, 8]} />
              </aside>
            </div>
          </section>

          <section
            aria-labelledby="reviews-heading"
            className="scroll-mt-20 border-t border-border py-14 sm:py-16 lg:py-20"
            id="reviews"
          >
            <SectionHeading
              action={<SectionAction href="#all-reviews" label="All reviews" />}
              id="reviews-heading"
              title="Reviews that stayed with people"
            />
            <div className="mt-8 grid gap-5 lg:grid-cols-2">
              <ProfileReviewCard
                artworkSrc={artwork.northbound}
                excerpt="Some movies explain loneliness. This one just leaves the door open and lets it sit beside you."
                href="#atlas-motel"
                likes="73"
                rating={5}
                reviewedOn="26 August"
                title="Atlas Motel"
              />
              <ProfileReviewCard
                artworkSrc={artwork.thirdSun}
                excerpt="I understood maybe half of it. Unfortunately, the half I understood changed my entire week."
                href="#third-sun"
                likes="119"
                rating={5}
                reviewedOn="14 August"
                title="Third Sun"
              />
            </div>
          </section>

          <section
            aria-labelledby="lists-heading"
            className="scroll-mt-20 border-t border-border py-14 sm:py-16 lg:py-20"
            id="lists"
          >
            <SectionHeading
              action={<SectionAction href="#all-lists" label="All lists" />}
              id="lists-heading"
              title={`${name}’s lists`}
            />
            <div className="mt-8 grid gap-5 md:grid-cols-3">
              <CuratedListCard
                artworkSources={[artwork.northbound, artwork.thirdSun, artwork.saltwater, artwork.violetHours]}
                curator={name}
                href="#films-like-memory"
                saves="426"
                title="Films that feel like a memory"
              />
              <CuratedListCard
                artworkSources={[artwork.saltwater, artwork.northbound, artwork.thirdSun, artwork.violetHours]}
                curator={name}
                href="#quiet-breakdown"
                saves="319"
                title="Movies for a quiet breakdown"
              />
              <CuratedListCard
                artworkSources={[artwork.violetHours, artwork.saltwater, artwork.northbound, artwork.thirdSun]}
                curator={name}
                href="#beautifully-strange"
                saves="588"
                title="Beautifully strange and worth it"
              />
            </div>
          </section>

          <section
            aria-labelledby="circle-heading"
            className="scroll-mt-20 border-t border-border py-14 sm:py-16 lg:py-20"
            id="circle"
          >
            <SectionHeading
              action={<span className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-orange">186 followers</span>}
              id="circle-heading"
              title={`People in ${name}’s circle`}
            />
            <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_21rem] xl:items-center">
              <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
                {circleMembers.map((member) => (
                  <MemberByline
                    key={member.name}
                    meta={`${member.overlap}% taste overlap`}
                    name={member.name}
                  />
                ))}
              </div>
              <aside className="rounded-card border border-border bg-surface p-5">
                <p className="text-sm font-bold text-ink">Follow {name} to improve your feed</p>
                <p className="mt-2 text-xs leading-5 text-muted">His ratings will appear beside your recommendations.</p>
              </aside>
            </div>
          </section>
        </div>
      </main>

      <Footer
        copyright="© 2026 Consumit"
        links={[
          { href: '#about', label: 'About' },
          { href: '#help', label: 'Help' },
          { href: '#apps', label: 'Apps' },
          { href: '#terms', label: 'Terms' },
          { href: '#privacy', label: 'Privacy' },
          { href: '/components', label: 'Components' },
        ]}
      />
    </>
  )
}
