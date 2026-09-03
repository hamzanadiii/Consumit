'use client'

import { ArrowRight, Play, Plus } from 'lucide-react'
import { useState } from 'react'

import {
  Badge,
  Button,
  ContentCard,
  ContinueCard,
  CuratedListCard,
  EditorialFeature,
  FilterChip,
  Footer,
  GlobalNavigation,
  MemberByline,
  MoodSelector,
  RatingDisplay,
  SectionHeading,
  SocialProof,
  TitleMasthead,
  TrendingCard,
} from '@consumit/ui'

const artwork = {
  backdrop: '/assets/cinematic-backdrop.svg',
  northbound: '/assets/posters/northbound.svg',
  saltwater: '/assets/posters/saltwater.svg',
  thirdSun: '/assets/posters/third-sun.svg',
  violetHours: '/assets/posters/violet-hours.svg',
} as const

const people = [
  { name: 'Yasmine' },
  { name: 'Omar' },
  { name: 'Nadia' },
] as const

const circleTitles = [
  {
    artworkSrc: artwork.northbound,
    badge: <Badge tone="orange">96% match</Badge>,
    friends: people,
    meta: '2025 · 1h 49m',
    title: 'Northbound',
  },
  {
    artworkSrc: artwork.violetHours,
    badge: <Badge tone="lilac">New episode</Badge>,
    friends: [people[0]],
    meta: 'Series · S2 E04',
    title: 'Violet Hours',
  },
  {
    artworkSrc: artwork.thirdSun,
    badge: <Badge tone="neutral">Nadia’s pick</Badge>,
    friends: [people[2]],
    meta: '2024 · 2h 11m',
    title: 'The Quiet Signal',
  },
  {
    artworkSrc: artwork.saltwater,
    badge: <Badge tone="neutral">Friend favorite</Badge>,
    friends: people.slice(0, 2),
    meta: '2026 · 1h 56m',
    title: 'Saltwater',
  },
  {
    artworkSrc: artwork.violetHours,
    badge: <Badge tone="neutral">Hidden gem</Badge>,
    friends: [people[1]],
    meta: '2023 · 1h 38m',
    title: 'Before the Dust',
  },
] as const

const continueTitles = [
  {
    artworkSrc: artwork.northbound,
    meta: '41 min left',
    progress: 62,
    title: 'Harbor of Glass',
  },
  {
    artworkSrc: artwork.saltwater,
    meta: 'S1 E06 · 29 min left',
    progress: 34,
    title: 'Fault Lines',
  },
  {
    artworkSrc: artwork.violetHours,
    meta: '18 min left',
    progress: 79,
    title: 'No One Leaves Sunday',
  },
  {
    artworkSrc: artwork.thirdSun,
    meta: 'S3 E02 · 47 min left',
    progress: 22,
    title: 'The Hour Before Morning',
  },
] as const

const trendingTitles = [
  {
    artworkSrc: artwork.saltwater,
    completionProof: '18K watched · 94% finished',
    memberScore: 8.7,
    title: 'Sea of Names',
  },
  {
    artworkSrc: artwork.northbound,
    completionProof: '15K watched · 91% finished',
    memberScore: 8.4,
    title: 'Atlas Motel',
  },
  {
    artworkSrc: artwork.violetHours,
    completionProof: '13K watched · 89% finished',
    memberScore: 8.3,
    title: 'Little Gods',
  },
  {
    artworkSrc: artwork.thirdSun,
    completionProof: '11K watched · 88% finished',
    memberScore: 8.1,
    title: 'The Returning',
  },
  {
    artworkSrc: artwork.saltwater,
    completionProof: '10K watched · 86% finished',
    memberScore: 7.9,
    title: 'Third Sun',
  },
] as const

const moodOptions = [
  { label: 'Slow & beautiful', tone: 'orange', value: 'slow' },
  { label: 'Mess with my head', tone: 'lilac', value: 'strange' },
  { label: 'Easy comfort', tone: 'lime', value: 'comfort' },
  { label: 'Laugh with friends', tone: 'orange', value: 'funny' },
  { label: 'Pure tension', tone: 'rose', value: 'tense' },
] as const

function SectionAction({ href = '#', label = 'View all' }: { href?: string; label?: string }) {
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

export function HomeScreen() {
  const [circleFilter, setCircleFilter] = useState('all')
  const [mood, setMood] = useState<string>()
  const [savedHero, setSavedHero] = useState(false)

  return (
    <>
      <GlobalNavigation
        activeHref="/"
        avatarSrc="/assets/hamza-avatar.svg"
        profileHref="/profile/hamza"
        profileName="Hamza"
        searchPlaceholder="Search titles, people, lists"
        sticky={false}
      />

      <main className="mx-auto w-full max-w-[90rem]" data-consumit-home>
        <h1 className="sr-only">Consumit home</h1>
        <TitleMasthead
          actions={(
            <>
              <Button>
                <Play aria-hidden="true" />
                Play now
              </Button>
              <Button
                aria-label={savedHero ? 'Remove from library' : 'Save to library'}
                aria-pressed={savedHero}
                onClick={() => setSavedHero((current) => !current)}
                size="icon"
                variant="secondary"
              >
                <Plus aria-hidden="true" />
              </Button>
            </>
          )}
          backgroundSrc={artwork.backdrop}
          className="rounded-none border-x-0 border-t-0 px-5 py-14 sm:px-8 lg:min-h-[36.5rem] lg:px-[62px] lg:py-20"
          context="Consumit premiere · Film"
          metadata="2026 · 2h 08m · Drama · Mystery · 16+"
          synopsis="A cartographer returns to a city that has erased every street she remembers—and finds one stranger still living inside her old map."
          tasteReason="Because you loved slow mysteries—and Yasmine rated it 4½."
          tasteScore={92}
          title="The Last City After Rain"
        />

        <div className="px-5 sm:px-8 lg:px-[62px]">
          <section className="py-14 sm:py-16 lg:py-20" aria-labelledby="circle-heading">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <SectionHeading
                description="What people you trust are loving tonight"
                id="circle-heading"
                title="From your circle"
              />
              <div aria-label="Filter circle titles" className="flex flex-wrap gap-2" role="group">
                {['all', 'movies', 'series', 'lists'].map((filter) => (
                  <FilterChip
                    key={filter}
                    onClick={() => setCircleFilter(filter)}
                    selected={circleFilter === filter}
                  >
                    {filter.charAt(0).toUpperCase() + filter.slice(1)}
                  </FilterChip>
                ))}
              </div>
            </div>

            <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_19rem]">
              <div className="grid auto-cols-[minmax(10rem,72vw)] grid-flow-col gap-3 overflow-x-auto pb-4 sm:auto-cols-[12rem] xl:grid-flow-row xl:grid-cols-5 xl:overflow-visible xl:pb-0">
                {circleTitles.map((item) => (
                  <ContentCard
                    artworkSrc={item.artworkSrc}
                    badge={item.badge}
                    friends={item.friends}
                    href={`#${item.title.toLowerCase().replaceAll(' ', '-')}`}
                    key={item.title}
                    meta={item.meta}
                    title={item.title}
                  />
                ))}
              </div>

              <aside className="border-t border-border pt-6 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-7" aria-labelledby="friends-watching">
                <div className="flex items-center justify-between gap-4">
                  <h3 className="text-sm font-bold text-ink" id="friends-watching">Your circle is watching</h3>
                  <SectionAction label="See all" />
                </div>
                <div className="mt-3 divide-y divide-border">
                  <div className="py-4">
                    <MemberByline meta="watched The Quiet Signal" name="Yasmine" />
                    <RatingDisplay className="mt-2 pl-11" value={4.5} />
                  </div>
                  <div className="py-4">
                    <MemberByline meta="added Violet Hours to a list" name="Omar" />
                    <p className="mt-2 pl-11 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-orange">12 titles</p>
                  </div>
                  <div className="py-4">
                    <MemberByline meta="reviewed Northbound" name="Nadia" />
                    <RatingDisplay className="mt-2 pl-11" value={4} />
                  </div>
                </div>
              </aside>
            </div>
          </section>

          <section className="border-t border-border py-14 sm:py-16 lg:py-20" aria-labelledby="continue-heading">
            <SectionHeading
              action={<SectionAction />}
              id="continue-heading"
              title="Continue watching"
            />
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {continueTitles.map((item) => (
                <ContinueCard
                  artworkSrc={item.artworkSrc}
                  href={`#continue-${item.title.toLowerCase().replaceAll(' ', '-')}`}
                  key={item.title}
                  meta={item.meta}
                  progress={item.progress}
                  title={item.title}
                />
              ))}
            </div>
          </section>

          <section className="border-t border-border py-14 sm:py-16 lg:py-20" aria-label="Personalized editorial pick">
            <EditorialFeature
              action={(
                <Button>
                  <Play aria-hidden="true" />
                  Play now
                </Button>
              )}
              alt="A Place Between Signals artwork"
              context="Because you loved Arrival"
              metadata="2025 · 1h 57m · Science fiction · Drama"
              secondaryAction={<Button variant="secondary">Why this pick?</Button>}
              socialProof={<SocialProof detail="Average 4.6" items={people.slice(0, 2)} label="Yasmine and Omar" text="2 people in your circle loved it" />}
              src={artwork.backdrop}
              synopsis="A linguist receives one signal from a future that never happened. To answer it, she has to remember a life she never lived."
              title="A Place Between Signals"
            />
          </section>

          <section className="border-t border-border py-14 sm:py-16 lg:py-20" aria-labelledby="trending-heading">
            <SectionHeading
              action={<SectionAction />}
              description="What Consumit members are actually finishing"
              id="trending-heading"
              title="Trending tonight"
            />
            <div className="mt-8 grid auto-cols-[minmax(11rem,72vw)] grid-flow-col gap-5 overflow-x-auto pb-4 sm:auto-cols-[13rem] xl:grid-flow-row xl:grid-cols-5 xl:overflow-visible xl:pb-0">
              {trendingTitles.map((item, index) => (
                <TrendingCard
                  artworkSrc={item.artworkSrc}
                  completionProof={item.completionProof}
                  href={`#trending-${item.title.toLowerCase().replaceAll(' ', '-')}`}
                  key={item.title}
                  memberScore={item.memberScore}
                  rank={index + 1}
                  title={item.title}
                />
              ))}
            </div>
          </section>

          <section className="border-t border-border py-14 sm:py-16 lg:py-20" aria-labelledby="lists-heading">
            <SectionHeading
              description="Made by people you follow, not a content department"
              id="lists-heading"
              title="Lists worth stealing"
            />
            <div className="mt-8 grid gap-5 md:grid-cols-3">
              <CuratedListCard
                artworkSources={[artwork.northbound, artwork.saltwater, artwork.thirdSun, artwork.violetHours]}
                curator="Yasmine"
                href="#yasmine-list"
                saves="426"
                title="Films that feel like a memory"
              />
              <CuratedListCard
                artworkSources={[artwork.saltwater, artwork.thirdSun, artwork.northbound, artwork.violetHours]}
                curator="Omar"
                href="#omar-list"
                saves="319"
                title="One perfect film for every mood"
              />
              <CuratedListCard
                artworkSources={[artwork.violetHours, artwork.northbound, artwork.saltwater, artwork.thirdSun]}
                curator="Nadia"
                href="#nadia-list"
                saves="588"
                title="Beautifully strange and worth it"
              />
            </div>
          </section>

          <section className="border-t border-border py-14 sm:py-16 lg:py-20" aria-labelledby="mood-heading">
            <SectionHeading id="mood-heading" title="What kind of night is it?" />
            <div className="mt-7 flex flex-col gap-4 xl:flex-row xl:items-start">
              <MoodSelector
                className="flex-1"
                label="Choose tonight’s mood"
                onValueChange={setMood}
                options={moodOptions}
                value={mood}
              />
              <Button className="justify-between xl:min-w-[19rem]" size="lg">
                Surprise me based on my taste
                <ArrowRight aria-hidden="true" />
              </Button>
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
