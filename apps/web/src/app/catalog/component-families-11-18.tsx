'use client'

import { ArrowRight, Play, Plus, RefreshCw } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import {
  AuthField,
  AuthShell,
  Badge,
  Button,
  CastCard,
  CompatibilityPanel,
  ConsumitPlayer,
  CuratorPanel,
  DiaryRow,
  Dropzone,
  EmptyState,
  EpisodeRow,
  ErrorState,
  FilterChip,
  Footer,
  HealthSummary,
  ImportOption,
  LibraryToolbar,
  LoadingState,
  MemberPulse,
  MemberSuggestion,
  OnboardingHeader,
  OrderedTitleRow,
  PlaybackReport,
  PlaybackTrustNote,
  PreferenceRow,
  ProfileMasthead,
  SavedTitleCard,
  SeasonSelector,
  SelectableTitle,
  SettingsRail,
  SettingsSection,
  SocialAuthButton,
  SocialProof,
  SourceSelector,
  TasteSignature,
  TitleMasthead,
  Toggle,
  TrustNote,
  WatchHeader,
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
        <span className="font-interface text-xs font-bold tracking-[0.12em] text-orange">{number}</span>
      </h2>
      <p className="mt-3 max-w-[36ch] text-sm leading-6 text-muted">{description}</p>
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

const familyClasses =
  'border-t border-border py-10 lg:grid lg:grid-cols-[16rem_1fr] lg:gap-12'

export function ComponentFamiliesCatalog1118() {
  const [season, setSeason] = useState('2')
  const [source, setSource] = useState('source-1')
  const [diarySharing, setDiarySharing] = useState(true)
  const [followedMembers, setFollowedMembers] = useState(['@yasmineframes'])
  const [selectedTitles, setSelectedTitles] = useState(['silent-year', 'violet-hours'])
  const activeSourceLabel =
    source === 'source-1'
      ? 'Source 1'
      : source === 'source-2'
        ? 'Source 2'
        : 'Source 3'

  function toggleTitle(value: string) {
    setSelectedTitles((current) =>
      current.includes(value)
        ? current.filter((title) => title !== value)
        : [...current, value],
    )
  }

  function setMemberFollowing(handle: string, following: boolean) {
    setFollowedMembers((current) =>
      following
        ? Array.from(new Set([...current, handle]))
        : current.filter((member) => member !== handle),
    )
  }

  return (
    <>
      <section className={`${familyClasses} mt-16 lg:mt-24`} data-component-family="11">
        <FamilyHeader
          description="A public identity built from taste, history, and relationships—not vanity metrics alone."
          number="11"
          title="Profile"
        />
        <div className="mt-8 min-w-0 space-y-8 lg:mt-0">
          <Specimen label="Profile masthead">
            <ProfileMasthead
              actions={<Button>Follow</Button>}
              avatarSrc="/assets/hamza-avatar.svg"
              backgroundSrc={artwork.backdrop}
              bio="Chasing films that feel like memories I never had."
              handle="@hamza"
              joined="Joined 2024"
              location="Rabat, Morocco"
              name="Hamza"
              stats={[{ label: 'films', value: 284 }, { label: 'series', value: 39 }, { label: 'lists', value: 23 }, { label: 'followers', value: 186 }]}
              status="online"
            />
          </Specimen>
          <div className="grid gap-6 lg:grid-cols-2">
            <Specimen label="Compatibility panel">
              <CompatibilityPanel
                items={people}
                memberName="Hamza"
                mutuals="12 shared circle members · 46 shared favorites"
                reason="You both love slow science fiction, uneasy cities, and endings that refuse to explain themselves."
                score={87}
              />
            </Specimen>
            <Specimen label="Taste signature">
              <TasteSignature
                detail="Rates fewer titles than 82% of members · Average 4.1"
                statement="Restless futures. Quiet dread. People trying to come home."
                worlds={[{ label: 'Sci-fi', tone: 'orange' }, { label: 'Mystery', tone: 'lilac' }, { label: 'Slow cinema', tone: 'lime' }]}
              />
            </Specimen>
          </div>
          <Specimen label="Diary rows">
            <div className="rounded-card border border-border bg-surface px-4">
              <DiaryRow artworkSrc={artwork.northbound} date="26 Aug" detail="Rewatched · Review" note="Still hurts in exactly the right places." rating={4.5} title="Atlas Motel" />
              <DiaryRow artworkSrc={artwork.saltwater} date="23 Aug" detail="Watched with Yasmine and Omar" rating={5} title="Sea of Names" />
              <DiaryRow artworkSrc={artwork.violetHours} date="19 Aug" detail="First watch · Liked" rating={3.5} title="The Returning" />
            </div>
          </Specimen>
        </div>
      </section>

      <section className={familyClasses} data-component-family="12">
        <FamilyHeader
          description="Title and series decisions combine one cinematic promise with honest member evidence and continuation state."
          number="12"
          title="Title & series"
        />
        <div className="mt-8 min-w-0 space-y-8 lg:mt-0">
          <Specimen label="Title masthead">
            <TitleMasthead
              actions={<><Button><Play aria-hidden="true" /> Play now</Button><Button variant="secondary">Trailer</Button><Button aria-label="Save title" size="icon" variant="secondary"><Plus aria-hidden="true" /></Button></>}
              backgroundSrc={artwork.backdrop}
              context="Consumit premiere · Film"
              metadata="2026 · 2h 08m · Drama · Mystery · 4K"
              socialProof={<SocialProof items={people} label="Yasmine, Omar, and Nadia" text="8 people in your circle watched" detail="4.6 average" />}
              synopsis="A cartographer returns to a city that has erased every street she remembers—and finds one stranger still living inside her old map."
              tasteReason="Strong fit: slow mysteries, hostile cities, and endings that refuse to explain themselves."
              tasteScore={92}
              title="The Last City After Rain"
            />
          </Specimen>
          <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
            <Specimen label="Season selector + episode rows">
              <div className="mb-5 flex items-center gap-4">
                <SeasonSelector onValueChange={setSeason} options={[{ label: 'Season 1', value: '1' }, { label: 'Season 2', value: '2' }]} value={season} />
                <span className="text-xs text-muted">8 episodes</span>
              </div>
              <div className="space-y-3">
                <EpisodeRow action={<Button size="sm">Continue</Button>} artworkSrc={artwork.violetHours} description="Mina follows a violet reflection into an apartment that does not exist by day." episode="Episode 4" meta="52 min · 31% watched" progress={31} status="Continue · Episode 4" title="Glass Teeth" />
                <EpisodeRow action={<Button size="sm" variant="secondary">Play</Button>} artworkSrc={artwork.saltwater} description="A silent tenant offers Mina a key—but only if she promises never to use it." episode="Episode 5" meta="48 min" title="The Quiet Floor" />
              </div>
            </Specimen>
            <Specimen label="Member pulse">
              <MemberPulse count="12,846 ratings" value={4.3} />
            </Specimen>
          </div>
          <Specimen label="Cast cards">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {([
                ['Sara El Amrani', 'Mara'],
                ['Youssef Naciri', 'The Watchman'],
                ['Nora Rahal', 'Salma'],
                ['Malik Bensaid', 'Young Idris'],
                ['Leila Mansouri', 'Director'],
              ] as const).map(([name, role]) => <CastCard character={role} key={name} name={name} />)}
            </div>
          </Specimen>
        </div>
      </section>

      <section className={familyClasses} data-component-family="13">
        <FamilyHeader
          description="Library and list surfaces keep search, state, order, proof, and curatorship visible without turning into a dashboard."
          number="13"
          title="Library & lists"
        />
        <div className="mt-8 min-w-0 space-y-8 lg:mt-0">
          <Specimen label="Library toolbar">
            <LibraryToolbar
              controls={<Button size="sm" variant="secondary">Recently saved <ArrowRight aria-hidden="true" /></Button>}
              filters={<><FilterChip selected>All</FilterChip><FilterChip>Movies</FilterChip><FilterChip>Series</FilterChip><FilterChip signal="orange">Unwatched</FilterChip></>}
            />
          </Specimen>
          <Specimen label="Saved title cards">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <SavedTitleCard artworkSrc={artwork.northbound} badge={<Badge tone="orange">96% match</Badge>} meta="2025 · Movie · 1h 47m" signal="3 people in your circle rated it 4★+" title="The Silent Year" />
              <SavedTitleCard artworkSrc={artwork.violetHours} badge={<Badge tone="lime">New episode</Badge>} meta="2022 · Series · 2 seasons" progress={31} signal="Continue S2 E04" title="Violet Hours" />
              <SavedTitleCard artworkSrc={artwork.saltwater} badge={<Badge tone="orange">Favorite</Badge>} meta="2025 · Limited series" signal="All episodes available" title="No One Leaves Sunday" />
              <SavedTitleCard artworkSrc={artwork.thirdSun} badge={<Badge tone="lilac">82% match</Badge>} meta="2021 · Movie · 1h 38m" signal="In your library since May" title="Little Gods" />
            </div>
          </Specimen>
          <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
            <Specimen label="Ordered title rows">
              <div className="space-y-3">
                <OrderedTitleRow action={<Button size="sm">View title</Button>} artworkSrc={artwork.northbound} index={1} match={96} meta="2021 · Movie · 1h 47m · Mystery" proof="3 people in your circle rated it 4★+" quote="Every hallway feels like it is listening." title="The Silent Year" />
                <OrderedTitleRow action={<Button size="sm" variant="secondary">View series</Button>} artworkSrc={artwork.violetHours} index={2} meta="2022 · Series · 2 seasons" proof="Omar finished the season" quote="The building edits everyone who enters." title="Violet Hours" />
              </div>
            </Specimen>
            <Specimen label="Curator panel">
              <CuratorPanel
                curators={[{ name: 'Omar Benjelloun', role: 'Owner', detail: '612 films' }, { name: 'Yasmine', role: 'Collaborator', detail: 'Added 7 titles' }, { name: 'Nadia', role: 'Collaborator', detail: 'Added 4 titles' }]}
                description="A collection about places that store grief, rewrite memory, and refuse to stay passive."
                tags={['Mystery', 'Architecture', 'Memory']}
              />
            </Specimen>
          </div>
        </div>
      </section>

      <section className={familyClasses} data-component-family="14">
        <FamilyHeader
          description="Authentication uses a reduced shell, explicit field states, familiar providers, and plain privacy language."
          number="14"
          title="Authentication"
        />
        <div className="mt-8 min-w-0 lg:mt-0">
          <Specimen label="Auth shell + fields + provider + trust">
            <AuthShell
              artworkSrc={artwork.backdrop}
              asideDescription="Return to the films, people, and lists that know what your next night should feel like."
              asideTitle="Your taste is waiting."
              description="Sign in to continue your library and circle."
              footer={<>New to Consumit? <a className="font-bold text-ink" href="#create">Create your taste space</a></>}
              title="Welcome back."
            >
              <div className="space-y-3">
                <SocialAuthButton label="Continue with Google" provider="Google" tone="light" />
                <SocialAuthButton label="Continue with Apple" provider="Apple" />
              </div>
              <div className="my-6 flex items-center gap-4 text-[0.6875rem] uppercase tracking-[0.12em] text-muted"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>
              <form className="space-y-5">
                <AuthField autoComplete="email" defaultValue="hamza@example.com" id="auth-email" label="Email" type="email" />
                <AuthField action={<a className="font-bold text-orange" href="#forgot">Forgot password?</a>} autoComplete="current-password" defaultValue="password" id="auth-password" label="Password" type="password" />
                <Button className="w-full" type="submit" variant="accent">Sign in</Button>
              </form>
              <TrustNote className="mt-6" title="Your library stays private by default" tone="lime">You decide what appears on your public profile.</TrustNote>
            </AuthShell>
          </Specimen>
        </div>
      </section>

      <section className={familyClasses} data-component-family="15">
        <FamilyHeader
          description="Onboarding makes every step optional, shows what each choice changes, and begins with taste rather than popularity."
          number="15"
          title="Onboarding"
        />
        <div className="mt-8 min-w-0 space-y-8 lg:mt-0">
          <Specimen label="Onboarding header">
            <OnboardingHeader current={2} skipHref="#skip" total={3} />
          </Specimen>
          <Specimen label="Import options">
            <div className="grid gap-4">
              <ImportOption action={<Button>Choose export file</Button>} benefits={['Watched films and diary dates', 'Ratings, likes, and favorites', 'Watchlist and personal lists']} description="Upload your Letterboxd export. Takes about 30 seconds." selected title="Import from Letterboxd" />
              <ImportOption action={<Button variant="secondary">Start clean</Button>} description="Pick a few favorites next. You can import later from Settings." icon="minus" title="Start fresh" />
            </div>
          </Specimen>
          <Specimen label="Selectable titles">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {([
                ['silent-year', 'The Silent Year', artwork.northbound],
                ['violet-hours', 'Violet Hours', artwork.violetHours],
                ['third-sun', 'Third Sun', artwork.thirdSun],
                ['saltwater', 'Saltwater', artwork.saltwater],
              ] as const).map(([value, title, src]) => (
                <SelectableTitle
                  checked={selectedTitles.includes(value)}
                  key={value}
                  meta="Movie · 2025"
                  onChange={() => toggleTitle(value)}
                  title={title}
                  artworkSrc={src}
                />
              ))}
            </div>
          </Specimen>
          <Specimen label="Member suggestions">
            <div className="grid gap-3 lg:grid-cols-2">
              <MemberSuggestion detail="Noir, moral fog, patient endings" films="428 films" following={followedMembers.includes('@yasmineframes')} handle="@yasmineframes" name="Yasmine El Idrissi" onFollowingChange={(following) => setMemberFollowing('@yasmineframes', following)} overlap={93} />
              <MemberSuggestion detail="Architecture, memory, long silences" films="612 films" following={followedMembers.includes('@slowcuts')} handle="@slowcuts" name="Omar Benjelloun" onFollowingChange={(following) => setMemberFollowing('@slowcuts', following)} overlap={87} />
            </div>
          </Specimen>
        </div>
      </section>

      <section className={familyClasses} data-component-family="16">
        <FamilyHeader
          description="Settings and support make ownership, control, source health, and diagnostic consent obvious."
          number="16"
          title="Settings & support"
        />
        <div className="mt-8 grid min-w-0 gap-6 lg:mt-0 lg:grid-cols-[15rem_1fr]">
          <Specimen label="Settings rail">
            <SettingsRail
              activeHref="#privacy"
              avatarSrc="/assets/hamza-avatar.svg"
              handle="@hamza"
              items={[{ href: '#account', label: 'Account' }, { href: '#profile', label: 'Profile' }, { href: '#privacy', label: 'Privacy & social' }, { href: '#playback', label: 'Streaming services' }, { href: '#notifications', label: 'Notifications' }, { href: '#security', label: 'Data & security' }]}
              memberName="Hamza"
            />
          </Specimen>
          <div className="min-w-0 space-y-8">
            <Specimen label="Settings section + preference rows">
              <SettingsSection action={<Button size="sm">Save changes</Button>} description="Decide what becomes part of your public taste." title="Privacy & social">
                <PreferenceRow control={<Button size="sm" variant="secondary">Public</Button>} description="Controls who can open your complete profile." label="Profile visibility" />
                <PreferenceRow control={<Toggle checked={diarySharing} label="Share diary activity" onCheckedChange={setDiarySharing} />} description="People in your circle can see what you watched after you log it." label="Share diary activity" />
              </SettingsSection>
            </Specimen>
            <div className="grid gap-6 sm:grid-cols-2">
              <Specimen label="Health summary">
                <HealthSummary entries={[{ label: 'Recommended source', status: 'healthy' }, { label: 'Backup source 2', status: 'healthy' }, { detail: 'Slow', label: 'Backup source 3', status: 'slow' }]} />
              </Specimen>
              <Specimen label="Dropzone">
                <Dropzone description="PNG, JPG, or MP4 · up to 25 MB" title="Add screenshot or short screen recording" />
              </Specimen>
            </div>
          </div>
        </div>
      </section>

      <section className={familyClasses} data-component-family="17">
        <FamilyHeader
          description="A reduced watch shell pairs source recovery with a first-party Consumit player and direct media playback."
          number="17"
          title="Playback shell"
        />
        <div className="mt-8 min-w-0 space-y-6 lg:mt-0">
          <Specimen label="Watch header">
            <WatchHeader backHref="#title" exitHref="#title" meta="2026 · 2h 08m" status={`${activeSourceLabel} selected`} title="The Last City After Rain" />
          </Specimen>
          <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
            <Specimen label="Consumit player">
              <ConsumitPlayer
                loop
                onDurationChange={(event) => {
                  const video = event.currentTarget
                  if (Number.isFinite(video.duration) && video.currentTime > video.duration) video.currentTime = 0
                }}
                onLoadedMetadata={(event) => {
                  if (!Number.isFinite(event.currentTarget.duration)) event.currentTarget.currentTime = Number.MAX_SAFE_INTEGER
                }}
                posterSrc={artwork.backdrop}
                src="/assets/demo-playback.webm"
                status={`${activeSourceLabel} selected · Consumit controls stay in view`}
                title="The Last City After Rain"
              />
            </Specimen>
            <Specimen label="Source selector">
              <SourceSelector
                description="If playback fails, switch sources without leaving the film."
                name="catalog-source"
                onValueChange={setSource}
                sources={[
                  { detail: source === 'source-1' ? 'Active · Recommended' : 'Recommended', label: 'Source 1', status: 'healthy', value: 'source-1' },
                  { detail: source === 'source-2' ? 'Active · Backup' : 'Available backup', label: 'Source 2', status: 'healthy', value: 'source-2' },
                  { detail: source === 'source-3' ? 'Active · Checking' : 'Checking availability', label: 'Source 3', status: 'checking', value: 'source-3' },
                ]}
                value={source}
              />
            </Specimen>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <Specimen label="Playback report">
              <PlaybackReport description="Wrong language, broken video, or bad subtitles—we will route the report." href="#report" />
            </Specimen>
            <Specimen label="Playback trust note">
              <PlaybackTrustNote>Consumit never asks you to install extensions or download software. Close anything that does.</PlaybackTrustNote>
            </Specimen>
          </div>
        </div>
      </section>

      <section className={familyClasses} data-component-family="18">
        <FamilyHeader
          description="The interface finishes with consistent legal navigation and recovery states that say what happened and what works next."
          number="18"
          title="Global finish"
        />
        <div className="mt-8 min-w-0 space-y-8 lg:mt-0">
          <div className="grid gap-6 lg:grid-cols-3">
            <Specimen label="Empty composition">
              <EmptyState action={<Button><Plus aria-hidden="true" /> Add a title</Button>} description="Save something you want to watch and it will wait here without making noise." title="Your library is quiet" />
            </Specimen>
            <Specimen label="Loading composition">
              <LoadingState rows={4} title="Loading your library" />
            </Specimen>
            <Specimen label="Error composition">
              <ErrorState action={<Button><RefreshCw aria-hidden="true" /> Try again</Button>} description="Your saved titles are safe. Check your connection, then try loading them again." detail="Request failed before any library data changed." title="Your library did not load" />
            </Specimen>
          </div>
          <Specimen label="Footer">
            <Footer copyright="© 2026 Consumit" links={[{ href: '#help', label: 'Help' }, { href: '#privacy', label: 'Privacy' }, { href: '#terms', label: 'Terms' }, { href: '#accessibility', label: 'Accessibility' }]} />
          </Specimen>
        </div>
      </section>
    </>
  )
}
