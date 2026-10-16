import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
  it('shows visitor navigation without owner collections', () => {
    render(<ProfileSectionNavigation counts={{}} name="Film Fan" username="film_fan" />)
    for (const section of ['Overview', 'Ratings', 'Reviews', 'Lists', 'Network']) expect(screen.getByRole('link', { name: section })).toBeVisible()
    for (const section of ['Activity', 'Watched', 'Diary', 'History', 'Watchlist', 'Likes', 'Tags', 'Followers', 'Following']) expect(screen.queryByRole('link', { name: section })).not.toBeInTheDocument()
  })
  it('recovers an initial collection failure and handles an empty page', async () => {
    mocks.collection.mockResolvedValue({ collection: 'followers', items: [], nextCursor: null })
    render(<PublicCollection collection="followers" initialPage={null} username="film_fan" />)
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('No followers to show yet.')).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
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
})
