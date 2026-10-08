import type { CatalogTitleSummary, MemberProfileData, SafeMember } from '@consumit/contracts'
import Link from 'next/link'
import { notFound } from 'next/navigation'
export const metadata = { robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'
import { ProfileScreen } from '../profile/public-profile-screen'
import { SettingsScreen } from '../settings/settings-screen'
import { FilScreenHome } from '../home/filscreen-home'
import { SessionProvider } from '../session/session'
import { DesignLabPlayer } from './player'
import fixture from './titles.json'

const titles = fixture.items as CatalogTitleSummary[]
const member: SafeMember = { id: '9e0a21f4-31bc-4aa7-98ae-b3cb8da0a8ca', username: 'cinema_sample', displayName: 'Alex Morgan', avatarStyle: 'dusk', avatarUrl: '/assets/hamza-avatar.svg', createdAt: '2026-01-01T00:00:00Z', email: 'sample@example.com', emailVerified: true, role: 'member' }
const data: MemberProfileData = {
  canonicalUsername: member.username,
  profile: { username: member.username, displayName: member.displayName, avatarStyle: 'dusk', avatarUrl: member.avatarUrl, bannerUrl: titles[0]!.backdropUrl, bio: 'Other worlds. Ordinary lives. Films that feel like somewhere I have been.', createdAt: member.createdAt, location: 'A seat by the aisle', nextUsernameChangeAt: null, usernameChangedAt: null, visibility: 'private' },
  favorites: titles.map((title, index) => ({ id: title.id, kind: title.kind, position: index + 1, origin: 'native' as const, sourceKey: null })),
  diary: titles.map((title, index) => ({ id: title.id, kind: title.kind, entryId: `diary-${index}`, origin: 'native' as const, sourceKey: null, rewatch: index === 1, watchedOn: ['2026-10-07', '2026-10-05', '2026-10-03', '2026-09-28'][index]!, tags: [] })),
  reviews: [{ id: titles[0]!.id, kind: 'movie', reviewId: 'review-1', origin: 'native', sourceKey: null, reviewedOn: '2026-10-07', tags: [], body: 'The scale is enormous, but the quiet moments are what I kept thinking about. A world that feels lived in long before the camera arrives.' }],
  lists: [{ id: 'list-1', name: 'Worlds worth getting lost in', description: 'A few places to return to.', slug: 'sample-worlds', visibility: 'private', itemCount: 4, origin: 'native' }],
  statistics: { watched: 38, diaryEntries: 17, reviews: 6, lists: 3 }, social: { followers: 0, following: 0 },
  ratingDistribution: Array.from({ length: 10 }, (_, index) => ({ value: index + 1, count: [0, 0, 1, 2, 3, 5, 7, 10, 6, 4][index]! })),
}

export default async function MuseumPreview({ searchParams }: { searchParams: Promise<{ surface?: string; empty?: string }> }) {
  if (process.env.CONSUMIT_DESIGN_LAB !== '1') notFound()
  const params = await searchParams
  const preview = params.empty ? { ...data, favorites: [], diary: [], reviews: [], lists: [], ratingDistribution: [], statistics: { watched: 0, diaryEntries: 0, reviews: 0, lists: 0 }, profile: { ...data.profile, bannerUrl: null, bio: null, displayName: 'Your museum begins here.' } } : data
  return <SessionProvider initialMember={member} initialStatus="authenticated">
    <nav aria-label="Design preview" style={{ padding: '8px 16px', fontSize: 12, background: '#27272a', color: '#f4f0e8', display: 'flex', flexWrap: 'wrap', gap: 16 }}><span>Design preview · sample member records</span><Link href="/design-lab">Profile</Link><Link href="/design-lab?surface=home">Home</Link><Link href="/design-lab?surface=player">Player</Link><Link href="/design-lab?surface=settings">Settings</Link><Link href="/design-lab?empty=1">Empty profile</Link></nav>
    {params.surface === 'player' ? <DesignLabPlayer title={titles[0]!} /> : params.surface === 'settings' ? <SettingsScreen initialProfile={data.profile} /> : params.surface === 'home' ? <FilScreenHome hero={{ ...titles[0]!, kind: 'movie', runtimeMinutes: 166, certification: 'PG-13', creators: [], tagline: 'Long live the fighters.' }} spotlight={titles.slice(1).map(title => ({ ...title, creators: [], tagline: title.overview.slice(0,70), runtimeMinutes: 120 }))} trendingMovies={titles} topRatedMovies={[...titles].reverse()} /> : <ProfileScreen data={preview} listPosters={{ 'sample-worlds': titles.map((title) => title.posterUrl ?? undefined) }} owner savedPreview={{ hasMore: false, items: params.empty ? [] : titles.map(({ id, kind }) => ({ id, kind })) }} titles={titles} />}
  </SessionProvider>
}
