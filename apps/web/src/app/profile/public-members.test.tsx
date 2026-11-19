import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultProfileSectionVisibility } from '@consumit/contracts'
import { renderWithProviders as render } from '@/test/render'
import { SessionProvider } from '../session/session'
import { FollowButton } from './follow-button'
import { MemberRows } from './member-rows'
import { ProfileSectionNavigation } from './profile-section-navigation'
import { PublicCollection } from './public-collection'
import { PeopleSearchScreen } from '../search/people-search-screen'

const mocks = vi.hoisted(() => ({ follow: vi.fn(), collection: vi.fn(), search: vi.fn(), refresh: vi.fn() }))
vi.mock('@/lib/identity-browser', () => ({ setMemberFollow: mocks.follow, getProfileCollection: mocks.collection, searchMembers: mocks.search }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }), usePathname: () => '/search' }))
const member = { id: 'viewer', username: 'viewer', displayName: 'Viewer', avatarStyle: 'dusk', avatarUrl: null, email: 'private@example.test', emailVerified: true, createdAt: '2026-01-01T00:00:00Z', role: 'member' } as const
describe('public profile interactions', () => {
  beforeEach(() => { vi.clearAllMocks() })
  it('asks guests to sign in with a profile return path and never writes a follow', () => {
    render(<FollowButton isFollowing={false} memberId="target" username="film_fan" />)
    expect(screen.getByRole('link', { name: 'Sign in to follow' })).toHaveAttribute('href', '/sign-in?next=%2Fprofile%2Ffilm_fan')
    expect(mocks.follow).not.toHaveBeenCalled()
  })
  it('disables an in-flight follow, reports failure, and retries without losing current state', async () => {
    const user = userEvent.setup()
    let reject!: (error: Error) => void
    mocks.follow.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail })).mockResolvedValue(undefined)
    render(<SessionProvider initialMember={member} initialStatus="authenticated"><FollowButton isFollowing={false} memberId="target" username="film_fan" /></SessionProvider>)
    await user.click(screen.getByRole('button', { name: 'Follow' }))
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    reject(new Error('Unavailable'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Try again')
    await user.click(screen.getByRole('button', { name: 'Follow' }))
    expect(await screen.findByRole('button', { name: 'Following' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Following' }))
    expect(mocks.follow).toHaveBeenLastCalledWith('target', false)
  })
  it('shows only neutral private relationship placeholders and allows outgoing unfollow', async () => {
    render(<SessionProvider initialMember={member} initialStatus="authenticated"><MemberRows canUnfollowPrivate items={[{ id: 'retained', private: true }]} /></SessionProvider>)
    expect(screen.getByText('Private member')).toBeVisible()
    expect(screen.queryByRole('link', { name: /retained/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Unfollow' }))
    expect(mocks.follow).toHaveBeenCalledWith('retained', false)
  })
  it('shows visitor navigation only when a section is explicitly public', () => {
    render(<ProfileSectionNavigation counts={{}} name="Film Fan" username="film_fan" />)
    expect(screen.getByRole('link', { name: 'Overview' })).toBeVisible()
    for (const section of ['Ratings', 'Reviews', 'Lists', 'Network', 'Activity', 'Watched', 'Diary', 'History', 'Likes', 'Tags', 'Watchlist']) expect(screen.queryByRole('link', { name: section })).not.toBeInTheDocument()
  })
  it('shows visitor archives from explicit visibility and requires Reviews visibility for Tags', () => {
    const visibility = { ...defaultProfileSectionVisibility(), likes: false, tags: true, reviews: false }
    render(<ProfileSectionNavigation counts={{}} name="Film Fan" username="film_fan" visibility={visibility} />)
    for (const section of ['Overview', 'Ratings', 'Lists', 'Network', 'Activity', 'Watched', 'Diary', 'History', 'Watchlist']) expect(screen.getByRole('link', { name: section })).toBeVisible()
    for (const section of ['Reviews', 'Likes', 'Tags']) expect(screen.queryByRole('link', { name: section })).not.toBeInTheDocument()
  })
  it('recovers an initial collection failure and handles an empty page', async () => {
    mocks.collection.mockResolvedValue({ collection: 'followers', items: [], nextCursor: null })
    render(<PublicCollection collection="followers" initialPage={null} username="film_fan" />)
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('No followers to show yet.')).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
  it('opens a visitor review publication separately from its title details', () => {
    render(<PublicCollection collection="reviews" initialPage={{ collection: 'reviews', items: [{ kind: 'movie', id: 693134, reviewId: 'review-one', body: 'A patient, moving story.', reviewedOn: null }], nextCursor: null }} username="film_fan" />)
    expect(screen.getByRole('link', { name: 'Movie #693134' })).toHaveAttribute('href', '/title/693134')
    expect(screen.getByRole('link', { name: 'Read and discuss review of Movie #693134' })).toHaveAttribute('href', '/reviews/review-one')
  })
  it('enforces the minimum people query and retries search failures with pagination', async () => {
    mocks.search.mockResolvedValue({ items: [], nextCursor: null })
    const view = render(<PeopleSearchScreen initialPage={null} initialQuery="fi" />)
    expect(screen.getByText(/at least three characters/)).toBeVisible()
    expect(mocks.search).not.toHaveBeenCalled()
    view.rerender(<PeopleSearchScreen initialPage={null} initialQuery="film" key="film" />)
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.getByText(/No people found/)).toBeVisible())
  })
  it('suggests public collection curators and returns guests to People search to follow', () => {
    render(<PeopleSearchScreen initialPage={null} initialQuery="" initialSuggestions={[{ id: 'curator-1', username: 'framebyframe', displayName: 'Frame by Frame', avatarStyle: 'dusk', avatarUrl: null, isFollowing: false }]} />)
    expect(screen.getByRole('heading', { name: 'Curators to explore' })).toBeVisible()
    expect(screen.getByText('Frame by Frame').closest('a')).toHaveAttribute('href', '/profile/framebyframe')
    expect(screen.getByRole('link', { name: 'Sign in to follow' })).toHaveAttribute('href', '/sign-in?next=%2Fsearch%3Ftype%3Dpeople%26q%3D')
  })
  it('distinguishes an empty suggestion set from a failed read and retries the latter', async () => {
    const view = render(<PeopleSearchScreen initialPage={null} initialQuery="" initialSuggestions={[]} />)
    expect(screen.getByText(/No new curators to suggest yet/)).toBeVisible()
    view.rerender(<PeopleSearchScreen initialPage={null} initialQuery="" suggestionsError />)
    expect(screen.getByRole('alert')).toHaveTextContent('Curator suggestions could not load.')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(mocks.refresh).toHaveBeenCalledOnce()
  })
})
