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
    getMemberLike: vi.fn(),
    getMemberRating: vi.fn(),
    getMemberReview: vi.fn(),
    listTitleReviews: vi.fn(),
    setMemberLiked: vi.fn(),
    setMemberRating: vi.fn(),
    setMemberWatched: vi.fn(),
    setReviewLiked: vi.fn(),
    updateMemberReview: vi.fn(),
  }
})

vi.mock('@/lib/identity-browser', () => ({
  IdentityApiError: mocks.IdentityApiError,
  clearMemberRating: mocks.clearMemberRating,
  createDiaryEntry: mocks.createDiaryEntry,
  createMemberReview: mocks.createMemberReview,
  getMemberLike: mocks.getMemberLike,
  getMemberRating: mocks.getMemberRating,
  getMemberReview: mocks.getMemberReview,
  listTitleReviews: mocks.listTitleReviews,
  setReviewLiked: mocks.setReviewLiked,
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
    expect(mocks.getMemberReview).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Log or review' })).not.toBeInTheDocument()
  })

  it('shows the signed-in member’s own stored review', async () => {
    mocks.getMemberReview.mockResolvedValue(storedReview)
    render(signedIn(<TitleReviews id={693134} kind="movie" title="Dune: Part Two" />))

    expect(await screen.findByText('A patient masterpiece.')).toBeInTheDocument()
    expect(screen.getByText('Your review')).toBeInTheDocument()
    expect(mocks.getMemberReview).toHaveBeenCalledWith({ id: 693134, kind: 'movie' })
  })

  it('shows an honest empty state when the member has not reviewed the title', async () => {
    mocks.getMemberReview.mockRejectedValue(new mocks.IdentityApiError('No review for this title.', { status: 404 }))
    render(signedIn(<TitleReviews id={693134} kind="movie" title="Dune: Part Two" />))

    expect(await screen.findByText(/No member reviews yet/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Log or review' })).toBeInTheDocument()
  })

  it('retries after a load failure', async () => {
    const user = userEvent.setup()
    mocks.getMemberReview
      .mockRejectedValueOnce(new mocks.IdentityApiError('The account service returned an invalid response.', { status: 503 }))
      .mockResolvedValueOnce(storedReview)
    render(signedIn(<TitleReviews id={693134} kind="movie" title="Dune: Part Two" />))

    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('A patient masterpiece.')).toBeInTheDocument()
    await waitFor(() => expect(mocks.getMemberReview).toHaveBeenCalledTimes(2))
  })

  it('opens the log dialog from the section action', async () => {
    const user = userEvent.setup()
    mocks.getMemberReview.mockRejectedValue(new mocks.IdentityApiError('No review for this title.', { status: 404 }))
    mocks.getMemberRating.mockRejectedValue(new mocks.IdentityApiError('No rating for this title.', { status: 404 }))
    mocks.getMemberLike.mockRejectedValue(new mocks.IdentityApiError('No like for this title.', { status: 404 }))
    render(signedIn(<TitleReviews id={693134} kind="movie" title="Dune: Part Two" />))

    await user.click(await screen.findByRole('button', { name: 'Log or review' }))
    expect(await screen.findByRole('dialog', { name: 'Log Dune: Part Two' })).toBeInTheDocument()
  })

  it('edits the stored review in place from the section action', async () => {
    const user = userEvent.setup()
    mocks.getMemberReview.mockResolvedValue(storedReview)
    mocks.getMemberRating.mockResolvedValue({ id: 693134, kind: 'movie', origin: 'native', sourceKey: null, value: 9 })
    mocks.getMemberLike.mockResolvedValue({ id: 693134, kind: 'movie', origin: 'native', sourceKey: null })
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
    expect(screen.getByRole('link', { name: 'open_critic' })).toHaveAttribute('href', '/profile/open_critic')
    expect(mocks.getMemberReview).not.toHaveBeenCalled()
    expect(mocks.listTitleReviews).toHaveBeenCalledWith({ id: 693134, kind: 'movie' }, 1, 'recent', 'all')
  })

  it('expands the recent list in place when there is more to show', async () => {
    const user = userEvent.setup()
    mocks.getMemberReview.mockRejectedValue(new mocks.IdentityApiError('No review for this title.', { status: 404 }))
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
    mocks.getMemberReview.mockRejectedValue(new mocks.IdentityApiError('No review for this title.', { status: 404 }))
    mocks.listTitleReviews
      .mockRejectedValueOnce(new mocks.IdentityApiError('The account service returned an invalid response.', { status: 503 }))
      .mockResolvedValueOnce({ ...EMPTY_PAGE })
    render(signedIn(<TitleReviews id={693134} kind="movie" title="Dune: Part Two" />))

    expect(await screen.findByText('Recent reviews could not be loaded.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(mocks.listTitleReviews).toHaveBeenCalledTimes(2))
  })

  it('sorts recent reviews by popularity on request', async () => {
    const user = userEvent.setup()
    mocks.getMemberReview.mockRejectedValue(new mocks.IdentityApiError('No review for this title.', { status: 404 }))
    mocks.listTitleReviews.mockResolvedValue({
      items: [recentItem('recent-1', 'open_critic', 'First public take.', 8, 12)],
      page: 1,
      totalPages: 1,
      totalResults: 1,
    })
    render(signedIn(<TitleReviews id={693134} kind="movie" title="Dune: Part Two" />))

    expect(await screen.findByText('Recent reviews')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Popular' }))
    expect(await screen.findByText('Popular reviews')).toBeInTheDocument()
    expect(mocks.listTitleReviews).toHaveBeenLastCalledWith({ id: 693134, kind: 'movie' }, 1, 'popular', 'all')
  })

  it('filters reviews to the member’s circle on the friends tab', async () => {
    const user = userEvent.setup()
    mocks.getMemberReview.mockRejectedValue(new mocks.IdentityApiError('No review for this title.', { status: 404 }))
    mocks.listTitleReviews.mockResolvedValue({ ...EMPTY_PAGE })
    render(signedIn(<TitleReviews id={693134} kind="movie" title="Dune: Part Two" />))

    await user.click(await screen.findByRole('button', { name: 'Friends' }))

    expect(await screen.findByText('Friend reviews')).toBeInTheDocument()
    expect(mocks.listTitleReviews).toHaveBeenLastCalledWith({ id: 693134, kind: 'movie' }, 1, 'recent', 'circle')
    expect(screen.getByText(/No reviews from your circle yet/)).toBeInTheDocument()
  })

  it('likes a member review optimistically', async () => {
    const user = userEvent.setup()
    mocks.getMemberReview.mockRejectedValue(new mocks.IdentityApiError('No review for this title.', { status: 404 }))
    mocks.listTitleReviews.mockResolvedValue({
      items: [recentItem('recent-1', 'open_critic', 'First public take.', 8, 12)],
      page: 1,
      totalPages: 1,
      totalResults: 1,
    })
    mocks.setReviewLiked.mockResolvedValue({ likesCount: 13, reviewId: 'recent-1' })
    render(signedIn(<TitleReviews id={693134} kind="movie" title="Dune: Part Two" />))

    const like = await screen.findByRole('button', { name: 'Like this review by open_critic' })
    expect(like).toHaveAttribute('aria-pressed', 'false')
    await user.click(like)

    expect(mocks.setReviewLiked).toHaveBeenCalledWith('recent-1', true)
    const unlike = await screen.findByRole('button', { name: 'Unlike this review by open_critic' })
    expect(unlike).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('13 likes')).toBeInTheDocument()
  })

  it('reverts the like and reports when the write fails', async () => {
    const user = userEvent.setup()
    mocks.getMemberReview.mockRejectedValue(new mocks.IdentityApiError('No review for this title.', { status: 404 }))
    mocks.listTitleReviews.mockResolvedValue({
      items: [recentItem('recent-1', 'open_critic', 'First public take.', 8, 12)],
      page: 1,
      totalPages: 1,
      totalResults: 1,
    })
    mocks.setReviewLiked.mockRejectedValue(new mocks.IdentityApiError('The account service returned an invalid response.', { status: 503 }))
    render(signedIn(<TitleReviews id={693134} kind="movie" title="Dune: Part Two" />))

    await user.click(await screen.findByRole('button', { name: 'Like this review by open_critic' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Your like could not be saved')
    expect(screen.getByRole('button', { name: 'Like this review by open_critic' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('shows static like counts to guests with no like action', async () => {
    mocks.listTitleReviews.mockResolvedValue({
      items: [recentItem('recent-1', 'open_critic', 'First public take.', 8, 12)],
      page: 1,
      totalPages: 1,
      totalResults: 1,
    })
    render(<SessionProvider><TitleReviews id={693134} kind="movie" title="Dune: Part Two" /></SessionProvider>)

    expect(await screen.findByText('12 likes')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /like this review/i })).not.toBeInTheDocument()
  })

  it('hides the like action on the viewer’s own review', async () => {
    mocks.getMemberReview.mockRejectedValue(new mocks.IdentityApiError('No review for this title.', { status: 404 }))
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
