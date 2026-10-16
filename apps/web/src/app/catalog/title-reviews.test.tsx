import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SessionProvider } from '../session/session'

import { TitleReviews } from './title-reviews'

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
    mocks.listTitleReviews.mockResolvedValue(EMPTY_PAGE)
  })

  it('asks guests to sign in instead of showing member reviews', () => {
    render(<SessionProvider><TitleReviews id={693134} kind="movie" title="Dune: Part Two" /></SessionProvider>)

    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in')
    expect(mocks.getMemberTitleState).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Log or review' })).not.toBeInTheDocument()
  })

  it('shows the signed-in member’s own stored review', async () => {
    mocks.getMemberTitleState.mockResolvedValue({ rating: null, like: null, review: storedReview })
    render(signedIn(<TitleReviews id={693134} kind="movie" title="Dune: Part Two" />))

    expect(await screen.findByText('A patient masterpiece.')).toBeInTheDocument()
    expect(screen.getByText('Your review')).toBeInTheDocument()
    expect(mocks.getMemberTitleState).toHaveBeenCalledWith({ id: 693134, kind: 'movie' })
  })

  it('shows an honest empty state when the member has not reviewed the title', async () => {
    mocks.getMemberTitleState.mockResolvedValue({ rating: null, like: null, review: null })
    render(signedIn(<TitleReviews id={693134} kind="movie" title="Dune: Part Two" />))

    expect(await screen.findByText(/No member reviews yet/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Log or review' })).toBeInTheDocument()
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

    await user.click(await screen.findByRole('button', { name: 'Log or review' }))
    expect(await screen.findByRole('dialog', { name: 'Log Dune: Part Two' })).toBeInTheDocument()
  })

  it('edits the stored review in place from the section action', async () => {
    const user = userEvent.setup()
    mocks.getMemberTitleState.mockResolvedValue({
      rating: { id: 693134, kind: 'movie', origin: 'native', sourceKey: null, value: 9 },
      like: { id: 693134, kind: 'movie', origin: 'native', sourceKey: null },
      review: storedReview,
    })
    render(signedIn(<TitleReviews id={693134} kind="movie" title="Dune: Part Two" />))

    await user.click(await screen.findByRole('button', { name: 'Edit review' }))
    const textarea = await screen.findByLabelText('Review', { selector: 'textarea' })
    expect(textarea).toHaveValue('A patient masterpiece.')

    await user.clear(textarea)
    await user.type(textarea, 'Even better on rewatch.')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(mocks.updateMemberReview).toHaveBeenCalledWith('review-1', { body: 'Even better on rewatch.' }))
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
    expect(mocks.getMemberTitleState).not.toHaveBeenCalled()
    expect(mocks.listTitleReviews).toHaveBeenCalledWith({ id: 693134, kind: 'movie' }, 1, 'recent')
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
    mocks.getMemberTitleState.mockResolvedValue({ rating: null, like: null, review: null })
    mocks.listTitleReviews.mockResolvedValue({
      items: [recentItem('recent-9', 'cinema_fan', 'My own take.', null, 3)],
      page: 1,
      totalPages: 1,
      totalResults: 1,
    })
    render(signedIn(<TitleReviews id={693134} kind="movie" title="Dune: Part Two" />))

    expect(await screen.findByText('My own take.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /like this review/i })).not.toBeInTheDocument()
  })
})
