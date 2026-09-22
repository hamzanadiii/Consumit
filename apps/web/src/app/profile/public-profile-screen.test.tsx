import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MemberProfileData } from '@consumit/contracts'
import { movieSummary } from '@/test/catalog-fixtures'
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
  canonicalUsername: 'alex_sample', profile: { avatarStyle: 'dusk', avatarUrl: null, bannerUrl: null, bio: null, createdAt: '2026-01-01T00:00:00Z', displayName: 'Alex', location: null, nextUsernameChangeAt: null, username: 'alex_sample', usernameChangedAt: null, visibility: 'public' },
  diary: [], favorites: [], lists: [], reviews: [], social: { followers: 0, following: 0 }, statistics: { diaryEntries: 0, lists: 0, reviews: 0, watched: 0 },
}

describe('profile as a personal cinema', () => {
  it('keeps an empty public profile honest and hides owner editing controls', () => {
    render(<ProfileScreen data={profile} titles={[]} />)
    expect(screen.getByText('This member has not picked favorites yet.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit favorites' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'In the favorites' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Taste Match/i)).not.toBeInTheDocument()
  })
  it('derives genre evidence from available Favorites while preserving unavailable title destinations', () => {
    render(<ProfileScreen catalogUnavailable data={{ ...profile, favorites: [{ id: movieSummary.id, kind: 'movie', position: 1, origin: 'native', sourceKey: null }, { id: 99, kind: 'movie', position: 2, origin: 'native', sourceKey: null }] }} titles={[movieSummary]} />)
    expect(screen.getByText('Genres across 1 selected title.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Movie #99' })).toHaveAttribute('href', '/title/99')
    expect(screen.getByText('Your profile is available, but TMDB artwork and title details could not load.')).toBeInTheDocument()
  })
  it('offers follow actions and live circle counts to other members', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ following: false }), { status: 200 })))
    render(<SessionProvider initialMember={{ ...viewer }} initialStatus="authenticated"><ProfileScreen data={{ ...profile, social: { followers: 4, following: 2 } }} titles={[]} /></SessionProvider>)
    expect(await screen.findByRole('button', { name: 'Follow alex_sample' })).toBeInTheDocument()
    expect(screen.getByText('followers')).toBeInTheDocument()
    expect(screen.getByText('following')).toBeInTheDocument()
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
    await user.type(screen.getByRole('searchbox', { name: 'Name of film or series' }), 'dune')
    expect(await screen.findByRole('button', { name: 'Pick Dune: Part Two' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Pick Dune: Part Two' }))
    await waitFor(() => expect(mocks.saveMemberFavorites).toHaveBeenCalledWith([{ id: movieSummary.id, kind: 'movie' }]))
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('searchbox', { name: 'Name of film or series' })).not.toBeInTheDocument()
  })
})
