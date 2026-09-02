'use client'

import { ArrowRight, Play } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import {
  ActivityItem,
  ArtworkFrame,
  Avatar,
  AvatarGroup,
  Badge,
  Button,
  CommentCard,
  ContentCard,
  ContinueCard,
  CuratedListCard,
  EditorialFeature,
  FilterChip,
  FriendRow,
  IssueSelector,
  LandscapeStill,
  MemberByline,
  MoodSelector,
  PosterCard,
  ProgressRail,
  RatingDisplay,
  SectionHeading,
  SegmentedControl,
  ServiceMark,
  SocialProof,
  StatusDot,
  Tabs,
  TasteMatch,
  Toggle,
  TrendingCard,
  TrustedReaction,
} from '@consumit/ui'

const avatars = [
  { name: 'Yasmine' },
  { name: 'Omar' },
  { name: 'Nadia' },
  { name: 'Samir' },
] as const

const posterPaths = {
  northbound: '/assets/posters/northbound.svg',
  saltwater: '/assets/posters/saltwater.svg',
  thirdSun: '/assets/posters/third-sun.svg',
  violetHours: '/assets/posters/violet-hours.svg',
} as const

function FamilyHeader({
  description,
  number,
  title,
}: {
  description: ReactNode
  number: string
  title: string
}) {
  return (
    <div>
      <h2 className="font-display text-2xl tracking-[-0.02em] text-ink">
        {title}{' '}
        <span className="font-interface text-xs font-bold tracking-[0.12em] text-orange">
          {number}
        </span>
      </h2>
      <p className="mt-3 max-w-[34ch] text-sm leading-6 text-muted">{description}</p>
    </div>
  )
}

function Specimen({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="min-w-0 border-b border-border pb-8">
      <p className="mb-5 text-xs uppercase tracking-[0.12em] text-muted">{label}</p>
      {children}
    </div>
  )
}

export function ComponentFamiliesCatalog() {
  const [privacy, setPrivacy] = useState('public')
  const [sharing, setSharing] = useState(true)
  const [issue, setIssue] = useState('video')
  const [mood, setMood] = useState('slow')

  return (
    <>
      <section
        className="mt-16 border-t border-border py-10 lg:mt-24 lg:grid lg:grid-cols-[16rem_1fr] lg:gap-12"
        data-component-family="04"
      >
        <FamilyHeader
          description="Route context, compact filters, visible single-choice controls, and honest on/off state."
          number="04"
          title="Selection"
        />

        <div className="mt-8 grid gap-x-10 gap-y-8 lg:mt-0 lg:grid-cols-2">
          <Specimen label="Tabs">
            <div className="overflow-x-auto">
              <Tabs
                activeValue="activity"
                aria-label="Circle sections"
                items={[
                  { href: '#activity', label: 'Activity', value: 'activity' },
                  { href: '#reviews', label: 'Reviews', value: 'reviews' },
                  { href: '#ratings', label: 'Ratings', value: 'ratings' },
                  { href: '#lists', label: 'Lists', value: 'lists' },
                ]}
              />
            </div>
          </Specimen>

          <Specimen label="Filter chips">
            <div className="flex flex-wrap gap-2">
              <FilterChip selected>All</FilterChip>
              <FilterChip signal="orange">Slow-burn tension</FilterChip>
              <FilterChip signal="lilac">Strange &amp; tender</FilterChip>
              <FilterChip signal="lime">Under 100 minutes</FilterChip>
            </div>
          </Specimen>

          <Specimen label="Segmented control">
            <SegmentedControl
              legend="Profile visibility"
              name="catalog-privacy"
              onValueChange={setPrivacy}
              options={[
                { label: 'Public', value: 'public' },
                { label: 'Friends', value: 'friends' },
                { label: 'Private', value: 'private' },
              ]}
              value={privacy}
            />
          </Specimen>

          <Specimen label="Toggle">
            <div className="flex items-center justify-between gap-5 rounded-card border border-border bg-surface p-4">
              <div>
                <p className="text-sm font-bold text-ink">Share diary activity</p>
                <p className="mt-1 text-xs leading-5 text-muted">
                  Friends can see what you watched after you log it.
                </p>
              </div>
              <Toggle
                checked={sharing}
                label="Share diary activity"
                onCheckedChange={setSharing}
              />
            </div>
          </Specimen>

          <div className="border-b border-border pb-8 lg:col-span-2">
            <p className="mb-5 text-xs uppercase tracking-[0.12em] text-muted">
              Issue selector
            </p>
            <IssueSelector
              legend="What went wrong?"
              name="catalog-issue"
              onValueChange={setIssue}
              options={[
                { label: "Video won't load", value: 'video' },
                { label: 'Wrong title', value: 'title' },
                { label: 'Subtitle issue', value: 'subtitle' },
                { label: 'Audio issue', value: 'audio' },
                { label: 'Something else', value: 'other' },
              ]}
              value={issue}
            />
          </div>
        </div>
      </section>

      <section
        className="border-t border-border py-10 lg:grid lg:grid-cols-[16rem_1fr] lg:gap-12"
        data-component-family="05"
      >
        <FamilyHeader
          description="People and services stay recognizable at compact sizes without relying on names alone."
          number="05"
          title="Identity"
        />

        <div className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:mt-0">
          <Specimen label="Avatar scale + presence">
            <div className="flex items-end gap-4">
              <Avatar name="Yasmine" size="sm" status="online" />
              <Avatar name="Omar" size="md" status="away" />
              <Avatar
                name="Hamza"
                size="lg"
                src="/assets/hamza-avatar.svg"
                status="online"
              />
            </div>
          </Specimen>

          <Specimen label="Avatar group">
            <AvatarGroup
              items={avatars}
              label="Yasmine, Omar, Nadia, and Samir"
              max={3}
              size="md"
            />
          </Specimen>

          <Specimen label="Member byline">
            <MemberByline
              href="#member-yasmine"
              meta="reviewed a movie · 18 min ago"
              name="Yasmine El Idrissi"
              status="online"
            />
          </Specimen>

          <Specimen label="Service marks">
            <div className="grid gap-2">
              <ServiceMark
                description="Availability"
                name="Netflix"
                src="/assets/services/netflix.svg"
                status="connected"
              />
              <ServiceMark
                description="Availability"
                name="Shahid"
                src="/assets/services/shahid.svg"
                status="connected"
              />
              <ServiceMark
                description="History imported"
                name="Letterboxd"
                src="/assets/services/letterboxd.svg"
                status="connected"
              />
            </div>
          </Specimen>
        </div>
      </section>

      <section
        className="border-t border-border py-10 lg:grid lg:grid-cols-[16rem_1fr] lg:gap-12"
        data-component-family="06"
      >
        <FamilyHeader
          description="Small signals carry state, progress, rating, and taste meaning without turning into decoration."
          number="06"
          title="Signals"
        />

        <div className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:mt-0">
          <Specimen label="Badges + status">
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone="orange">96% match</Badge>
              <Badge tone="lilac">Friend favorite</Badge>
              <Badge tone="lime">New episode</Badge>
              <StatusDot label="Source healthy" tone="lime" />
            </div>
          </Specimen>

          <Specimen label="Rating display">
            <div className="flex flex-wrap items-center gap-5">
              <RatingDisplay showValue value={4.5} />
              <RatingDisplay value={3} />
              <RatingDisplay value={1.5} />
            </div>
          </Specimen>

          <Specimen label="Progress rails">
            <div className="space-y-4">
              <ProgressRail label="Movie watched" value={62} />
              <ProgressRail label="Taste overlap" tone="lilac" value={87} />
              <ProgressRail label="Import complete" tone="lime" value={100} />
            </div>
          </Specimen>

          <Specimen label="Taste Match">
            <TasteMatch
              detail="Yasmine rated it 4½."
              reason="Because you loved slow mysteries and endings that refuse to explain themselves."
              score={92}
            />
          </Specimen>
        </div>
      </section>

      <section
        className="border-t border-border py-10 lg:grid lg:grid-cols-[16rem_1fr] lg:gap-12"
        data-component-family="07"
      >
        <FamilyHeader
          description="Supplied art remains the hero; frames, stills, and fallbacks only protect its rhythm."
          number="07"
          title="Media"
        />

        <div className="mt-8 grid gap-x-10 gap-y-8 lg:mt-0 lg:grid-cols-2">
          <Specimen label="Artwork frames">
            <div className="grid grid-cols-3 gap-3">
              <ArtworkFrame alt="Northbound poster" src={posterPaths.northbound} />
              <ArtworkFrame alt="Violet Hours poster" src={posterPaths.violetHours} />
              <ArtworkFrame alt="Artwork unavailable" />
            </div>
          </Specimen>

          <Specimen label="Poster card">
            <div className="max-w-44">
              <PosterCard
                badge={<Badge tone="orange">96% match</Badge>}
                href="#northbound"
                meta="2025 · 1h 49m"
                src={posterPaths.northbound}
                title="Northbound"
              />
            </div>
          </Specimen>

          <div className="border-b border-border pb-8 lg:col-span-2">
            <p className="mb-5 text-xs uppercase tracking-[0.12em] text-muted">
              Landscape still + missing state
            </p>
            <div className="grid gap-5 sm:grid-cols-2">
              <LandscapeStill
                alt="Fault Lines episode still"
                playHref="#continue-fault-lines"
                progress={34}
                src="/assets/cinematic-backdrop.svg"
              />
              <LandscapeStill alt="Episode still unavailable" progress={0} />
            </div>
          </div>
        </div>
      </section>

      <section
        className="border-t border-border py-10 lg:grid lg:grid-cols-[16rem_1fr] lg:gap-12"
        data-component-family="08"
      >
        <FamilyHeader
          description="Reusable content modules combine art, context, human proof, and one clear destination."
          number="08"
          title="Content cards"
        />

        <div className="mt-8 min-w-0 lg:mt-0">
          <Specimen label="Default, saved, watched">
            <div className="grid gap-4 sm:grid-cols-3">
              <ContentCard
                artworkSrc={posterPaths.northbound}
                badge={<Badge tone="orange">96% match</Badge>}
                friends={avatars.slice(0, 3)}
                href="#northbound-card"
                meta="2025 · 1h 49m"
                title="Northbound"
              />
              <ContentCard
                artworkSrc={posterPaths.violetHours}
                href="#violet-hours-card"
                meta="Series · S2 E04"
                state="saved"
                title="Violet Hours"
              />
              <ContentCard
                artworkSrc={posterPaths.saltwater}
                href="#saltwater-card"
                meta="2024 · 1h 56m"
                state="watched"
                title="Saltwater"
              />
            </div>
          </Specimen>

          <div className="mt-8 grid gap-x-6 gap-y-8 lg:grid-cols-3">
            <Specimen label="Continue card">
              <ContinueCard
                artworkSrc="/assets/cinematic-backdrop.svg"
                href="#continue-harbor"
                meta="41 min left"
                progress={62}
                title="Harbor of Glass"
              />
            </Specimen>

            <Specimen label="Trending card">
              <TrendingCard
                artworkSrc={posterPaths.saltwater}
                completionProof="14K watched · 94% finished"
                href="#sea-of-names"
                memberScore={8.7}
                rank={1}
                title="Sea of Names"
              />
            </Specimen>

            <Specimen label="Curated-list card">
              <CuratedListCard
                artworkSources={Object.values(posterPaths)}
                curator="Yasmine"
                href="#memory-list"
                saves="426"
                title="Films that feel like a memory"
              />
            </Specimen>
          </div>
        </div>
      </section>

      <section
        className="border-t border-border py-10 lg:grid lg:grid-cols-[16rem_1fr] lg:gap-12"
        data-component-family="09"
      >
        <FamilyHeader
          description="Editorial hierarchy gives discovery a human reason, a cinematic lead, and restrained social evidence."
          number="09"
          title="Editorial"
        />

        <div className="mt-8 min-w-0 lg:mt-0">
          <Specimen label="Section heading">
            <SectionHeading
              action={
                <Button size="sm" variant="ghost">
                  View all <ArrowRight aria-hidden="true" />
                </Button>
              }
              description="What people you trust are loving tonight."
              title="From your circle"
            />
          </Specimen>

          <div className="mt-8 border-b border-border pb-8">
            <p className="mb-5 text-xs uppercase tracking-[0.12em] text-muted">
              Editorial feature + social proof
            </p>
            <EditorialFeature
              action={
                <Button>
                  <Play aria-hidden="true" /> Play now
                </Button>
              }
              alt="A Place Between Signals cinematic artwork"
              context="A Consumit editorial pick"
              metadata="2025 · 1h 57m · Science fiction · Drama"
              secondaryAction={<Button variant="secondary">Why this pick?</Button>}
              socialProof={
                <SocialProof
                  detail="Average 4.6"
                  items={avatars.slice(0, 2)}
                  label="Yasmine and Omar"
                  text="2 friends loved it"
                />
              }
              src="/assets/cinematic-backdrop.svg"
              synopsis="A linguist receives one message from a future that never happened. To answer it, she has to remember a life she never lived."
              title="A Place Between Signals"
            />
          </div>

          <div className="mt-8 border-b border-border pb-8">
            <p className="mb-5 text-xs uppercase tracking-[0.12em] text-muted">
              Mood selector
            </p>
            <MoodSelector
              label="What kind of night is it?"
              onValueChange={setMood}
              options={[
                { label: 'Slow & beautiful', tone: 'orange', value: 'slow' },
                { label: 'Mess with my head', tone: 'lilac', value: 'strange' },
                { label: 'Easy comfort', tone: 'lime', value: 'comfort' },
                { label: 'Pure tension', tone: 'rose', value: 'tension' },
              ]}
              value={mood}
            />
          </div>
        </div>
      </section>

      <section
        className="border-t border-border py-10 lg:grid lg:grid-cols-[16rem_1fr] lg:gap-12"
        data-component-family="10"
      >
        <FamilyHeader
          description="Social modules foreground who acted, what changed, and why that person matters to the member."
          number="10"
          title="Social"
        />

        <div className="mt-8 min-w-0 space-y-8 lg:mt-0">
          <Specimen label="Activity item">
            <ActivityItem
              action={<Button size="sm">View title</Button>}
              artworkSrc={posterPaths.northbound}
              context="reviewed a movie · 18 min ago"
              detail="2021 · Movie · Mystery"
              memberName="Yasmine"
              quote="It respects silence without making silence feel like homework."
              rating={4.5}
              title="The Silent Year"
              titleHref="#silent-year"
            />
          </Specimen>

          <div className="grid gap-x-6 gap-y-8 lg:grid-cols-2">
            <Specimen label="Trusted reactions">
              <div className="grid gap-4">
                <TrustedReaction
                  engagement="73 likes · 11 replies"
                  memberName="Omar"
                  meta="25 August · Review"
                  quote="A mystery that respects you enough to leave the final door closed. Rare."
                  rating={5}
                />
                <TrustedReaction
                  engagement="31 likes · 4 replies"
                  memberName="Nadia"
                  meta="23 August · Review"
                  quote="The city is the best character. Everyone else is just trying not to disappear inside it."
                  rating={4}
                />
              </div>
            </Specimen>

            <Specimen label="Friend + follow rows">
              <div className="rounded-card border border-border bg-surface px-4">
                <FriendRow
                  detail="4 mutuals · patient dramas"
                  name="Lina Serraj"
                  overlap={91}
                  status="online"
                />
                <FriendRow
                  detail="2 mutuals · strange comedies"
                  following
                  name="Ilyas Moreau"
                  overlap={78}
                />
              </div>
            </Specimen>
          </div>

          <Specimen label="Comment cards">
            <div className="grid gap-4 sm:grid-cols-3">
              <CommentCard
                comment="The list order is the argument. Please don't sort this alphabetically."
                engagement="61 likes · 9 replies"
                memberName="Yasmine"
                meta="Top comment · 2h"
                roleLabel="Curator"
              />
              <CommentCard
                comment="This is how I discover six new films and distrust my apartment."
                engagement="28 likes · 3 replies"
                memberName="Hamza"
                meta="45m"
              />
              <CommentCard
                comment="Three titles are fighting for number seven."
                engagement="44 likes · 7 replies"
                memberName="Nadia"
                meta="Yesterday"
                spoilerHidden
              />
            </div>
          </Specimen>
        </div>
      </section>
    </>
  )
}
