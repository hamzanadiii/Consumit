import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SessionProvider } from '../session/session'

import { TitleReviews } from './title-reviews'
import { formatReviewedOn, ReviewBody } from './review-rows'

const mocks = vi.hoisted(() => {
  class IdentityApiError extends Error {
    readonly status: number
    constructor(message: string, options: { status: number }) {
      super(message)
      this.status = options.status
    }
  }
  return {
    IdentityApiError,
    tasteWrite: vi.fn(),
    clearMemberRating: vi.fn(),
    createDiaryEntry: vi.fn(),
    createMemberReview: vi.fn(),
    getMemberTitleState: vi.fn(),
    listTitleReviews: vi.fn(),
    setMemberLiked: vi.fn(),
    setMemberRating: vi.fn(),
    setMemberWatched: vi.fn(),
    updateMemberReview: vi.fn(),
  }
})

vi.mock('@/lib/identity-browser', () => ({
  IdentityApiError: mocks.IdentityApiError,
  clearMemberRating: mocks.clearMemberRating,
  createDiaryEntry: mocks.createDiaryEntry,
  createMemberReview: mocks.createMemberReview,
  getMemberTitleState: mocks.getMemberTitleState,
  listTitleReviews: mocks.listTitleReviews,
  setMemberLiked: mocks.setMemberLiked,
  setMemberRating: mocks.setMemberRating,
  setMemberWatched: mocks.setMemberWatched,
  updateMemberReview: mocks.updateMemberReview,
}))

vi.mock('../taste/api', () => ({ tasteRead: async (path: string) => path.startsWith('drafts/') ? { revision: 0, data: {} } : { revision: 0, body: 'A patient masterpiece.', spoiler: false }, tasteWrite: mocks.tasteWrite, errorText: (e: Error) => e.message }))

const member = {
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

const storedReview = {
  body: 'A patient masterpiece.',
  id: 693134,
  kind: 'movie',
  origin: 'native',
  reviewId: 'review-1',
  reviewedOn: '2026-09-09',
  sourceKey: null,
  tags: [],
}

const EMPTY_PAGE = { items: [], page: 1, totalPages: 0, totalResults: 0 }

function recentItem(reviewId: string, username: string, body: string, rating: number | null = null, likesCount = 0) {
  return {
    author: { avatarStyle: 'dusk', avatarUrl: null, displayName: username, username },
    body,
    liked: false,
    likesCount,
    rating,
    reviewId,
    reviewedOn: '2026-09-06',
  }
}

function signedIn(children: React.ReactNode) {
  return (
    <SessionProvider initialMember={{ ...member }} initialStatus="authenticated">
      {children}
    </SessionProvider>
  )
}

describe('title reviews', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.tasteWrite.mockResolvedValue({ revision: 1, data: {} })
    mocks.listTitleReviews.mockResolvedValue(EMPTY_PAGE)
  })

  it('shows public reviews to guests while keeping review writing behind sign-in', async () => {
    mocks.listTitleReviews.mockResolvedValue({
      items: [recentItem('public-review', 'open_critic', 'A public take for anyone to read.', 8)],
      page: 1,
      totalPages: 1,
      totalResults: 1,
    })
    render(<SessionProvider><TitleReviews id={693134} kind="movie" title="Dune: Part Two" /></SessionProvider>)

    expect(await screen.findByText('A public take for anyone to read.')).toBeInTheDocument()
    expect(screen.getByText('Public reviews')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in?next=%2Ftitle%2F693134%3FconsumitAction%3Dreview')
    expect(mocks.getMemberTitleState).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Write a review' })).not.toBeInTheDocument()
  })

  it('keeps the calendar day for a public review in western timezones', () => {
    expect(formatReviewedOn('2026-10-28')).toBe('Oct 28, 2026')
  })

  it('expands a long public review by keyboard with a touch-sized disclosure control', async () => {
    const user = userEvent.setup()
    const body = 'A patient viewer watches the small gestures and the silence between them. '.repeat(5)
    const { container } = render(<ReviewBody body={body} />)
    const expand = screen.getByRole('button', { name: 'Show more' })

    expect(expand).toHaveClass('min-h-11', 'min-w-11', 'focus-visible:ring-2')
    expect(expand).toHaveAttribute('aria-expanded', 'false')
    await user.tab()
    expect(expand).toHaveFocus()
    await user.keyboard('{Enter}')

    const collapse = screen.getByRole('button', { name: 'Show less' })
    expect(collapse).toHaveFocus()
    expect(collapse).toHaveClass('min-h-11', 'min-w-11', 'focus-visible:ring-2')
    expect(collapse).toHaveAttribute('aria-expanded', 'true')
    expect(container.querySelector('p')?.textContent).toContain(body)
  })

  it('announces public review loading and then the empty result', async () => {
    let resolvePage!: (page: typeof EMPTY_PAGE) => void
    mocks.listTitleReviews.mockImplementation(() => new Promise((resolve) => { resolvePage = resolve }))
    render(<SessionProvider><TitleReviews id={693134} kind="movie" title="Dune: Part Two" /></SessionProvider>)

    expect(screen.getByRole('status')).toHaveTextContent('Loading public reviews')
    resolvePage(EMPTY_PAGE)
    expect(await screen.findByText('No public reviews yet.')).toBeInTheDocument()
  })

  it('shows the signed-in member’s own stored review', async () => {
    mocks.getMemberTitleState.mockResolvedValue({ rating: null, like: null, review: storedReview })
    render(signedIn(<TitleReviews id={693134} kind="movie" title="Dune: Part Two" />))

    expect(await screen.findByText('A patient masterpiece.')).toBeInTheDocument()
    expect(screen.getByText('Your review')).toBeInTheDocument()
    expect(screen.getByText('A patient masterpiece.').closest('article')?.querySelector('time')).toHaveAttribute('datetime', '2026-09-09')
    expect(mocks.getMemberTitleState).toHaveBeenCalledWith({ id: 693134, kind: 'movie' })
  })

  it('opens the review editor after returning from sign-in', async () => {
    window.history.replaceState({}, '', '/title/693134?consumitAction=review')
    mocks.getMemberTitleState.mockResolvedValue({ rating: null, like: null, review: storedReview })
    render(signedIn(<TitleReviews id={693134} kind="movie" title="Dune: Part Two" />))

    expect(await screen.findByRole('dialog', { name: /In your own words|Edit your review/ })).toBeInTheDocument()
    expect(window.location.search).toBe('')
  })

  it('shows an honest empty state when the member has not reviewed the title', async () => {
    mocks.getMemberTitleState.mockResolvedValue({ rating: null, like: null, review: null })
    render(signedIn(<TitleReviews id={693134} kind="movie" title="Dune: Part Two" />))

    expect(await screen.findByText(/You haven’t reviewed this title yet/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Write a review' })).toBeInTheDocument()
  })

  it('retries after a load failure', async () => {
    const user = userEvent.setup()
    mocks.getMemberTitleState
      .mockRejectedValueOnce(new mocks.IdentityApiError('The account service returned an invalid response.', { status: 503 }))
      .mockResolvedValueOnce({ rating: null, like: null, review: storedReview })
    render(signedIn(<TitleReviews id={693134} kind="movie" title="Dune: Part Two" />))

    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('A patient masterpiece.')).toBeInTheDocument()
    await waitFor(() => expect(mocks.getMemberTitleState).toHaveBeenCalledTimes(2))
  })

  it('opens the log dialog from the section action', async () => {
    const user = userEvent.setup()
    mocks.getMemberTitleState.mockResolvedValue({ rating: null, like: null, review: null })
    render(signedIn(<TitleReviews id={693134} kind="movie" title="Dune: Part Two" />))

    await user.click(await screen.findByRole('button', { name: 'Write a review' }))
    expect(await screen.findByRole('dialog', { name: /In your own words|Edit your review/ })).toBeInTheDocument()
  })

  it('edits the stored review in place from the section action', async () => {
    const user = userEvent.setup()
    mocks.tasteWrite.mockImplementation(async (path: string) => path === 'reviews'
      ? { reviewId: 'review-1' }
      : { revision: 1, data: {} })
    const initialState = {
      rating: { id: 693134, kind: 'movie', origin: 'native', sourceKey: null, value: 9 },
      like: { id: 693134, kind: 'movie', origin: 'native', sourceKey: null },
      review: storedReview,
    }
    mocks.getMemberTitleState
      .mockResolvedValueOnce(initialState)
      .mockResolvedValueOnce(initialState)
      .mockResolvedValue({ ...initialState, review: { ...storedReview, body: 'Even better on rewatch.' } })
    render(signedIn(<TitleReviews id={693134} kind="movie" title="Dune: Part Two" />))

    await user.click(await screen.findByRole('button', { name: 'Edit review' }))
    const textarea = await screen.findByLabelText('Your review', { selector: 'textarea' })
    expect(textarea).toHaveValue('A patient masterpiece.')

    await user.clear(textarea)
    await user.type(textarea, 'Even better on rewatch.')
    await user.click(screen.getByRole('button', { name: 'Save review' }))

    expect(await screen.findByText('Even better on rewatch.')).toBeInTheDocument()
    expect(screen.queryByText('A patient masterpiece.')).not.toBeInTheDocument()
    expect(mocks.createMemberReview).not.toHaveBeenCalled()
  })

  it('shows recent public reviews to guests without fetching an own review', async () => {
    mocks.listTitleReviews.mockResolvedValue({
      items: [
        recentItem('recent-1', 'open_critic', 'First public take.', 8),
        recentItem('recent-2', 'quiet_fan', 'No stars attached.'),
      ],
      page: 1,
      totalPages: 1,
      totalResults: 2,
    })
    render(<SessionProvider><TitleReviews id={693134} kind="movie" title="Dune: Part Two" /></SessionProvider>)

    expect(await screen.findByText('First public take.')).toBeInTheDocument()
    expect(screen.getByText('No stars attached.')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.getByText('open_critic')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'open_critic' })).not.toBeInTheDocument()
    expect(screen.getByText('First public take.').closest('article')?.querySelector('time')).toHaveAttribute('datetime', '2026-09-06')
    expect(mocks.getMemberTitleState).not.toHaveBeenCalled()
    expect(mocks.listTitleReviews).toHaveBeenCalledWith({ id: 693134, kind: 'movie' }, 1, 'recent')
  })

  it('does not repeat the member review in the recent list', async () => {
    mocks.getMemberTitleState.mockResolvedValue({ rating: null, like: null, review: storedReview })
    mocks.listTitleReviews.mockResolvedValue({
      items: [recentItem('review-1', 'cinema_fan', 'A patient masterpiece.')],
      page: 1,
      totalPages: 1,
      totalResults: 1,
    })
    render(signedIn(<TitleReviews id={693134} kind="movie" title="Dune: Part Two" />))

    expect(await screen.findByText('A patient masterpiece.')).toBeInTheDocument()
    expect(screen.getAllByText('A patient masterpiece.')).toHaveLength(1)
  })

  it('distinguishes an empty public feed from an empty personal review', async () => {
    mocks.getMemberTitleState.mockResolvedValue({ rating: null, like: null, review: null })
    mocks.listTitleReviews.mockResolvedValue({ ...EMPTY_PAGE })
    render(signedIn(<TitleReviews id={693134} kind="movie" title="Dune: Part Two" />))

    expect(await screen.findByText('No public reviews yet.')).toBeInTheDocument()
    expect(screen.getByText(/You haven’t reviewed this title yet/)).toBeInTheDocument()
  })

  it('expands the recent list in place when there is more to show', async () => {
    const user = userEvent.setup()
    mocks.getMemberTitleState.mockResolvedValue({ rating: null, like: null, review: null })
    mocks.listTitleReviews.mockResolvedValue({
      items: [
        recentItem('recent-1', 'critic_one', 'Take one.'),
        recentItem('recent-2', 'critic_two', 'Take two.'),
        recentItem('recent-3', 'critic_three', 'Take three.'),
        recentItem('recent-4', 'critic_four', 'Take four.'),
      ],
      page: 1,
      totalPages: 1,
      totalResults: 4,
    })
    render(signedIn(<TitleReviews id={693134} kind="movie" title="Dune: Part Two" />))

    expect(await screen.findByText('Take one.')).toBeInTheDocument()
    expect(screen.queryByText('Take four.')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show all 4 reviews' }))
    expect(screen.getByText('Take four.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show fewer' }))
    expect(screen.queryByText('Take four.')).not.toBeInTheDocument()
  })

  it('retries recent reviews after a load failure', async () => {
    const user = userEvent.setup()
    mocks.getMemberTitleState.mockResolvedValue({ rating: null, like: null, review: null })
    mocks.listTitleReviews
      .mockRejectedValueOnce(new mocks.IdentityApiError('The account service returned an invalid response.', { status: 503 }))
      .mockResolvedValueOnce({ ...EMPTY_PAGE })
    render(signedIn(<TitleReviews id={693134} kind="movie" title="Dune: Part Two" />))

    expect(await screen.findByText('Recent reviews could not be loaded.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(mocks.listTitleReviews).toHaveBeenCalledTimes(2))
  })

  it('keeps review tabs personal with no friends filter', async () => {
    mocks.getMemberTitleState.mockResolvedValue({ rating: null, like: null, review: null })
    mocks.listTitleReviews.mockResolvedValue({ ...EMPTY_PAGE })
    render(signedIn(<TitleReviews id={693134} kind="movie" title="Dune: Part Two" />))

    expect(await screen.findByText('Recent reviews')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Friends' })).not.toBeInTheDocument()
    expect(screen.queryByText('Friend reviews')).not.toBeInTheDocument()
  })

  it('hides the like action on the viewer’s own review', async () => {
    mocks.getMemberTitleState.mockResolvedValue({ rating: null, like: null, review: { ...storedReview, body: 'My own take.' } })
    mocks.listTitleReviews.mockResolvedValue({
      items: [recentItem('review-1', 'cinema_fan', 'My own take.', null, 3)],
      page: 1,
      totalPages: 1,
      totalResults: 1,
    })
    render(signedIn(<TitleReviews id={693134} kind="movie" title="Dune: Part Two" />))

    expect(await screen.findByText('My own take.')).toBeInTheDocument()
    expect(screen.getAllByText('My own take.')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /like this review/i })).not.toBeInTheDocument()
  })
})
