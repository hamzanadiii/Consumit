import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TasteCommunity } from '@consumit/contracts'
import { CommunityScreen, CommunitySettings } from './community'

const mocks = vi.hoisted(() => ({ push: vi.fn(), read: vi.fn(), write: vi.fn(), titles: vi.fn() }))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('../shared', () => ({ FilScreenShell: ({ children }: { children: ReactNode }) => <>{children}</> }))
vi.mock('../session/session', () => ({ useSession: () => ({ member: { id: 'viewer' } }) }))
vi.mock('./api', () => ({ tasteRead: mocks.read, tasteWrite: mocks.write, errorText: (error: Error) => error.message }))
vi.mock('@/lib/catalog-browser', () => ({ browserCatalogTitlesForRefs: mocks.titles }))

const author = { id: 'curator-id', username: 'framebyframe', name: 'Frame by Frame', avatarUrl: null }
const listItem: TasteCommunity['items'][number] = {
  id: 'list-id', kind: 'list', href: '/lists/slow-sci-fi', title: 'Slow-burn science fiction',
  excerpt: 'Worlds that linger long after the credits.', spoiler: false, date: '2026-10-20T12:00:00.000Z', author,
  refs: [1, 2, 3, 4, 5].map((id) => ({ kind: 'movie' as const, id })),
}

function renderCommunity(data: TasteCommunity | null, overrides: Partial<Parameters<typeof CommunityScreen>[0]> = {}) {
  return <CommunityScreen data={data} titles={[]} mode="discover" query="" kind="all" genre="" {...overrides} />
}

beforeEach(() => { vi.clearAllMocks(); mocks.write.mockResolvedValue(undefined) })

describe('Community discovery', () => {
  it('shows a five-cover collection card with curator, date, and a direct collection action', () => {
    render(renderCommunity({ items: [listItem], nextCursor: null }))

    expect(screen.getByRole('navigation', { name: 'Community' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Find people' })).toHaveAttribute('href', '/search?type=people')
    expect(screen.getByRole('heading', { name: listItem.title })).toBeVisible()
    expect(screen.getByRole('link', { name: /Frame by Frame/ })).toHaveAttribute('href', '/profile/framebyframe')
    expect(screen.getByText('Oct 20, 2026')).toBeVisible()
    expect(document.querySelectorAll('.taste-community-art .taste-poster')).toHaveLength(5)
    expect(screen.getByRole('link', { name: 'Explore collection' })).toHaveAttribute('href', listItem.href)
  })

  it('separates a filtered no-match state from the unfiltered empty catalog', () => {
    const data = { items: [], nextCursor: null }
    const view = render(renderCommunity(data, { query: 'quiet' }))
    expect(screen.getByRole('heading', { name: 'No collections match these filters.' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeVisible()

    view.unmount()
    render(renderCommunity(data))
    expect(screen.getByRole('heading', { name: 'A new point of view starts here.' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Create a collection' })).toBeVisible()
  })

  it('keeps collection search and title filters in the route URL', async () => {
    const user = userEvent.setup()
    render(renderCommunity({ items: [], nextCursor: null }))

    await user.type(screen.getByRole('searchbox', { name: 'Search collections' }), 'slow cinema')
    await user.click(screen.getByRole('button', { name: 'Find collections' }))
    expect(mocks.push).toHaveBeenLastCalledWith('/community?mode=discover&q=slow+cinema')

    await user.selectOptions(screen.getByLabelText('Filter by title type'), 'anime')
    expect(mocks.push).toHaveBeenLastCalledWith('/community?mode=discover&q=slow+cinema&kind=anime')
  })

  it('keeps Community navigation reachable in keyboard order', async () => {
    const user = userEvent.setup()
    render(renderCommunity({ items: [], nextCursor: null }))

    await user.tab()
    expect(screen.getByRole('link', { name: 'Community settings' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('link', { name: 'Discover collections' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('link', { name: 'Following' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('link', { name: 'Find people' })).toHaveFocus()
  })

  it('renders distinct following entries and keeps spoiler text collapsed', () => {
    const review = { ...listItem, id: 'review-id', kind: 'review' as const, title: 'A quiet review', href: '/reviews/review-id', spoiler: true }
    const edition = { ...listItem, id: 'edition-id', kind: 'edition' as const, title: 'October edition', href: '/profile/framebyframe/editions/october' }
    render(renderCommunity({ items: [listItem, review, edition], nextCursor: null }, { mode: 'following' }))

    expect(screen.getByText('New reviews, collections, and editions from the curators you follow.')).toBeVisible()
    expect(screen.getByText('Collection')).toBeVisible()
    expect(screen.getByText('Review')).toBeVisible()
    expect(screen.getByText('Monthly edition')).toBeVisible()
    const spoiler = screen.getByText('Contains spoilers · Reveal').closest('details')
    expect(spoiler).not.toHaveAttribute('open')
    expect(within(spoiler as HTMLElement).getByText('Worlds that linger long after the credits.')).not.toBeVisible()
    expect(screen.getByRole('link', { name: 'Read review' })).toHaveAttribute('href', review.href)
    expect(screen.getByRole('link', { name: 'Open edition' })).toHaveAttribute('href', edition.href)
  })

  it('offers both discovery paths when the followed feed is empty', () => {
    render(renderCommunity({ items: [], nextCursor: null }, { mode: 'following' }))

    expect(screen.getByRole('heading', { name: 'Your next discovery starts with someone.' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Explore collections' })).toHaveAttribute('href', '/community?mode=discover')
    expect(screen.getByRole('link', { name: 'Find curators' })).toHaveAttribute('href', '/search?type=people')
  })

  it('retries a failed initial feed and restores a usable empty state', async () => {
    mocks.read.mockResolvedValue({ items: [], nextCursor: null })
    const user = userEvent.setup()
    render(renderCommunity(null, { initialError: true }))

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'A new point of view starts here.' })).toBeVisible()
    expect(screen.getByRole('main')).toHaveFocus()
    expect(mocks.read).toHaveBeenCalledWith('community?mode=discover&q=&kind=all&genre=', expect.anything())
  })

  it('returns focus to Community and announces the feed after an initial read recovers', async () => {
    mocks.read.mockResolvedValue({ items: [{ ...listItem, refs: [] }], nextCursor: null })
    const user = userEvent.setup()
    render(renderCommunity(null, { initialError: true }))

    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('heading', { name: listItem.title })).toBeVisible()
    expect(screen.getByRole('main')).toHaveFocus()
    expect(screen.getByRole('status')).toHaveTextContent('Community loaded.')
  })
})

describe('Community boundaries', () => {
  it('shows loading instead of an empty blocked list before the response arrives', async () => {
    let resolveBlocks!: (data: { items: typeof author[] }) => void
    mocks.read.mockImplementation(() => new Promise(resolve => { resolveBlocks = resolve }))
    render(<CommunitySettings />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading blocked members')
    expect(screen.queryByText('No blocked members.')).not.toBeInTheDocument()
    resolveBlocks({ items: [author] })
    expect(await screen.findByText('Frame by Frame · @framebyframe')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('retries a failed blocked-list read before showing the empty state', async () => {
    mocks.read.mockRejectedValueOnce(new Error('Blocked members could not be loaded.'))
      .mockResolvedValueOnce({ items: [] })
    const user = userEvent.setup()
    render(<CommunitySettings />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Blocked members could not be loaded.')
    expect(screen.queryByText('No blocked members.')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry loading blocked members' }))
    expect(await screen.findByText('No blocked members.')).toBeInTheDocument()
    expect(mocks.read).toHaveBeenCalledTimes(2)
  })

  it('keeps a blocked member visible through a failed unblock and retries the same action', async () => {
    mocks.read.mockResolvedValue({ items: [author] })
    mocks.write.mockRejectedValueOnce(new Error('Unblock could not be saved.'))
      .mockResolvedValueOnce(undefined)
    const user = userEvent.setup()
    render(<CommunitySettings />)

    const row = await screen.findByText('Frame by Frame · @framebyframe')
    await user.click(screen.getByRole('button', { name: 'Unblock' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Unblock could not be saved.')
    expect(row).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry unblock' }))
    expect(await screen.findByText('No blocked members.')).toBeInTheDocument()
    expect(mocks.write).toHaveBeenCalledTimes(2)
    expect(mocks.write).toHaveBeenLastCalledWith('blocks/curator-id', { enabled: false })
  })
})
