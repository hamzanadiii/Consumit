import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MemberProfileData } from '@consumit/contracts'
import { movieSummary, seriesSummary } from '@/test/catalog-fixtures'
import { renderWithProviders as render } from '@/test/render'
import { SessionProvider } from '../session/session'
import { ProfileScreen } from './public-profile-screen'

const mocks = vi.hoisted(() => ({
  browserSearchCatalog: vi.fn(),
  refresh: vi.fn(),
  saveMemberFavorites: vi.fn(),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: mocks.refresh }) }))

vi.mock('@/lib/catalog-browser', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/catalog-browser')>()),
  browserSearchCatalog: mocks.browserSearchCatalog,
}))

vi.mock('@/lib/identity-browser', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/identity-browser')>()),
  saveMemberFavorites: mocks.saveMemberFavorites,
}))

const viewer = {
  avatarStyle: 'dusk',
  avatarUrl: null,
  createdAt: '2026-09-07T12:00:00.000Z',
  displayName: null,
  email: 'member@example.com',
  emailVerified: true,
  id: '9e0a21f4-31bc-4aa7-98ae-b3cb8da0a8ca',
  role: 'member',
  username: 'cinema_fan',
} as const

afterEach(() => {
  vi.unstubAllGlobals()
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.browserSearchCatalog.mockResolvedValue({ items: [], page: 1, totalPages: 0, totalResults: 0 })
  mocks.saveMemberFavorites.mockResolvedValue({})
})
const profile: MemberProfileData = {
  canonicalUsername: 'alex_sample', profile: { avatarStyle: 'dusk', avatarUrl: null, bannerUrl: null, bio: null, createdAt: '2026-01-01T00:00:00Z', displayName: 'Alex', location: null, nextUsernameChangeAt: null, username: 'alex_sample', usernameChangedAt: null, visibility: 'private' },
  diary: [], favorites: [], lists: [], reviews: [], social: { followers: 0, following: 0 }, statistics: { diaryEntries: 0, lists: 0, reviews: 0, watched: 0 },
}

describe('profile as a personal cinema', () => {
  it('previews five saved titles with their original destinations and honest pagination language', () => {
    render(<ProfileScreen data={profile} owner savedPreview={{ hasMore: true, items: Array.from({ length: 5 }, (_, index) => ({ kind: 'anime', id: 100 + index })) }} titles={[]} />)
    const preview = screen.getByRole('region', { name: 'Watchlist' })
    expect(within(preview).getAllByRole('link')).toHaveLength(6)
    expect(within(preview).getByRole('link', { name: 'Anime #104' })).toHaveAttribute('href', '/anime/104')
    expect(within(preview).getByText('Latest 5 saved titles · more in your Watchlist')).toBeInTheDocument()
  })
  it('keeps an empty public profile honest and hides owner editing controls', () => {
    render(<ProfileScreen data={profile} titles={[]} />)
    expect(screen.getByText('No Favorite titles yet.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit favorites' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Favorite titles' })).toBeInTheDocument()
    expect(screen.queryByText(/Taste Match/i)).not.toBeInTheDocument()
  })
  it('derives genre evidence from available Favorites while preserving unavailable title destinations', () => {
    render(<ProfileScreen catalogUnavailable data={{ ...profile, favorites: [{ id: movieSummary.id, kind: 'movie', position: 1, origin: 'native', sourceKey: null }, { id: 99, kind: 'movie', position: 2, origin: 'native', sourceKey: null }] }} titles={[movieSummary]} />)
    expect(screen.getByText('Genres across 1 selected title.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Movie #99' })).toHaveAttribute('href', '/title/99')
    expect(screen.getByText('The profile is here, but catalog artwork and title details could not load.')).toHaveAttribute('role', 'status')
  })
  it('links unavailable anime favorites into the anime namespace', () => {
    render(<ProfileScreen catalogUnavailable data={{ ...profile, favorites: [{ id: 21, kind: 'anime', position: 1, origin: 'native', sourceKey: null }] }} titles={[]} />)
    expect(screen.getByRole('link', { name: 'Anime #21' })).toHaveAttribute('href', '/anime/21')
  })
  it('keeps other member profiles personal with no follow actions', () => {
    render(<SessionProvider initialMember={{ ...viewer }} initialStatus="authenticated"><ProfileScreen data={{ ...profile, social: { followers: 4, following: 2 } }} titles={[]} /></SessionProvider>)
    expect(screen.queryByRole('button', { name: /follow/i })).not.toBeInTheDocument()
    expect(screen.queryByText('followers')).not.toBeInTheDocument()
    expect(screen.queryByText('following')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Network' })).toHaveAttribute('href', '/profile/alex_sample/network')
    expect(screen.queryByRole('link', { name: 'Followers' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Following' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /share/i })).not.toBeInTheDocument()
  })
  it('renders profile stats, collection links, and recent activity', () => {
    render(
      <ProfileScreen owner
        data={{
          ...profile,
          diary: [{ entryId: 'e1', id: movieSummary.id, kind: 'movie', origin: 'native', sourceKey: null, rewatch: false, tags: [], watchedOn: `${new Date().getUTCFullYear()}-01-02` }, { entryId: 'e2', episode: 3, id: seriesSummary.id, kind: 'series', origin: 'native', rewatch: false, season: 1, sourceKey: null, tags: [], watchedOn: `${new Date().getUTCFullYear()}-01-01` }],
          favorites: [{ id: movieSummary.id, kind: 'movie', position: 1, origin: 'native', sourceKey: null }],
          lists: [{ description: null, id: 'l1', itemCount: 2, name: 'Shortlist', origin: 'native', slug: 'shortlist', visibility: 'private' }],
          reviews: [{ body: 'A patient masterpiece.', id: movieSummary.id, kind: 'movie', origin: 'native', sourceKey: null, reviewId: 'r1', reviewedOn: '2026-09-06', tags: [] }],
          statistics: { diaryEntries: 1, lists: 1, reviews: 1, watched: 1 },
        }}
        titles={[movieSummary, seriesSummary]}
      />,
    )
    const stats = screen.getByRole('navigation', { name: 'Alex profile statistics' })
    expect(within(stats).getByText('watched').closest('a')).toHaveAttribute('href', '/profile/alex_sample/films')
    expect(within(stats).getByText('diary').closest('a')).toHaveAttribute('href', '/profile/alex_sample/diary')
    const tabs = screen.getByRole('navigation', { name: 'Alex profile sections' })
    expect(within(tabs).getByRole('link', { name: 'Watched, 1' })).toHaveAttribute('href', '/profile/alex_sample/films')
    expect(within(tabs).getByRole('link', { name: 'Diary, 1' })).toHaveAttribute('href', '/profile/alex_sample/diary')
    expect(within(tabs).getByRole('link', { name: 'Reviews, 1' })).toHaveAttribute('href', '/profile/alex_sample/reviews')
    expect(within(tabs).getByRole('link', { name: 'Lists, 1' })).toHaveAttribute('href', '/profile/alex_sample/lists')
    expect(screen.getByRole('heading', { name: 'Favorite titles' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Recent activity' })).toBeInTheDocument()
    const activityList = document.querySelector('[data-consumit-profile-activity]')
    expect(activityList).not.toBeNull()
    expect(within(activityList as HTMLElement).getAllByText(/watched/i)).toHaveLength(2)
    expect(screen.getAllByText(/Watched · S01 E03/).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: `${seriesSummary.title}` }).some((link) => link.getAttribute('href') === `/watch/series/${seriesSummary.id}?season=1&episode=3`)).toBe(true)
    expect(within(activityList as HTMLElement).getByText(/reviewed/i)).toBeInTheDocument()
  })
  it('hides follow actions on the owner profile', () => {
    render(<SessionProvider initialMember={{ ...viewer, username: 'alex_sample' }} initialStatus="authenticated"><ProfileScreen data={profile} owner titles={[]} /></SessionProvider>)
    expect(screen.getByRole('link', { name: 'Edit profile' })).toHaveAttribute('href', '/settings')
    expect(screen.queryByRole('button', { name: /follow/i })).not.toBeInTheDocument()
  })
  it('hides favorite controls from visitors', () => {
    render(
      <ProfileScreen
        data={{ ...profile, favorites: [{ id: movieSummary.id, kind: 'movie', position: 1, origin: 'native', sourceKey: null }] }}
        titles={[movieSummary]}
      />,
    )
    expect(screen.getByRole('link', { name: 'Dune: Part Two' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /remove .* from favorites/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add favorite/i })).not.toBeInTheDocument()
  })
  it('removes a favorite from its hover action and saves the rest', async () => {
    const user = userEvent.setup()
    render(
      <SessionProvider initialMember={{ ...viewer, username: 'alex_sample' }} initialStatus="authenticated">
        <ProfileScreen
          data={{
            ...profile,
            favorites: [
              { id: movieSummary.id, kind: 'movie', position: 1, origin: 'native', sourceKey: null },
              { id: 99, kind: 'movie', position: 2, origin: 'native', sourceKey: null },
            ],
          }}
          owner
          titles={[movieSummary]}
        />
      </SessionProvider>,
    )
    await user.click(screen.getByRole('button', { name: 'Remove Movie #99 from favorites' }))
    await waitFor(() => expect(mocks.saveMemberFavorites).toHaveBeenCalledWith([{ id: movieSummary.id, kind: 'movie' }]))
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('link', { name: 'Movie #99' })).not.toBeInTheDocument()
  })
  it('adds a favorite through the pick palette', async () => {
    const user = userEvent.setup()
    mocks.browserSearchCatalog.mockResolvedValue({ items: [movieSummary], page: 1, totalPages: 1, totalResults: 1 })
    render(
      <SessionProvider initialMember={{ ...viewer, username: 'alex_sample' }} initialStatus="authenticated">
        <ProfileScreen data={profile} owner titles={[]} />
      </SessionProvider>,
    )
    await user.click(screen.getByRole('button', { name: 'Add favorite 1' }))
    await user.type(screen.getByRole('searchbox', { name: 'Name of movie, series, or anime' }), 'dune')
    expect(await screen.findByRole('button', { name: 'Pick Dune: Part Two' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Pick Dune: Part Two' }))
    await waitFor(() => expect(mocks.saveMemberFavorites).toHaveBeenCalledWith([{ id: movieSummary.id, kind: 'movie' }]))
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('searchbox', { name: 'Name of movie, series, or anime' })).not.toBeInTheDocument()
  })
})
