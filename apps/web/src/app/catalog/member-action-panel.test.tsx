import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders as render } from '@/test/render'

import { SessionProvider } from '../session/session'
import { MemberActionPanel } from './member-action-panel'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
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

const emptyLibrary = { diary: [], favorites: [], lists: [], savedLists: [], saved: [], watched: [] }
const storedLike = { id: 693134, kind: 'movie', origin: 'native', sourceKey: null }
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

function libraryFetch(hooks: {
  readTitleState?: () => Promise<Response>
  reviewRead?: () => Promise<Response>
  reviewWrite?: () => Promise<Response>
  watchedWrite?: () => Promise<Response>
} = {}) {
  return vi.fn().mockImplementation((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url.includes('/v1/taste/drafts/')) return Promise.resolve(new Response(JSON.stringify({ revision: 0, data: {} }), { status: 200 }))
    if (url === '/v1/taste/reviews/review-42' && hooks.reviewRead) return hooks.reviewRead()
    if (url === '/v1/taste/reviews' && init?.method === 'POST' && hooks.reviewWrite) return hooks.reviewWrite()
    if (url === '/v1/taste/reviews') return Promise.resolve(new Response(JSON.stringify({ reviewId: null }), { status: 200 }))
    if (url.includes('/v1/profiles/cinema_fan/collections/following')) return Promise.resolve(new Response(JSON.stringify({ collection: 'following', items: [{ id: 'friend-1', username: 'friend', displayName: 'Film Friend', avatarStyle: 'dusk', avatarUrl: null, isFollowing: true, private: false }], nextCursor: null }), { status: 200 }))
    if (url === '/v1/taste/recommendations') return Promise.resolve(new Response(JSON.stringify({ id: 'recommendation-1', title: { kind: 'movie', id: 693134 }, sender: { id: member.id, username: member.username, name: 'Cinema Fan', avatarUrl: null }, response: null, createdAt: '2026-10-26T12:00:00.000Z' }), { status: 201 }))
    if (url.includes('/v1/me/titles/')) {
      if (hooks.readTitleState) return hooks.readTitleState()
      return Promise.resolve(new Response(JSON.stringify({ rating: null, like: null, review: null, saved: false, watched: false }), { status: 200 }))
    }
    if (url === '/v1/me/library/watched/movie/693134' && init?.method === 'PUT' && hooks.watchedWrite) return hooks.watchedWrite()
    if (url.includes('/v1/likes/') || url.includes('/v1/ratings/')) {
      return Promise.resolve(new Response('Not found', { status: 404 }))
    }
    if (url === '/v1/likes') {
      return Promise.resolve(new Response(JSON.stringify(storedLike), { status: 200 }))
    }
    if (url === '/v1/me/diary') {
      return Promise.resolve(new Response(JSON.stringify({ entryId: 'diary-9', id: 693134, kind: 'movie', origin: 'native', rewatch: false, sourceKey: null, tags: [], watchedOn: '2026-09-09' }), { status: 201 }))
    }
    if (url.includes('/v1/me/reviews')) {
      return Promise.resolve(new Response(JSON.stringify(storedReview), { status: 201 }))
    }
    return Promise.resolve(new Response(JSON.stringify(emptyLibrary), { status: 200 }))
  })
}

function signedIn(children: ReactNode) {
  return (
    <SessionProvider initialMember={{ ...member }} initialStatus="authenticated">
      {children}
    </SessionProvider>
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('member action panel', () => {
  it('invites sign-in for member rows while keeping share and activity available', () => {
    render(<MemberActionPanel id={693134} kind="movie" title="Dune: Part Two" />)

    expect(screen.getByText('Your rating')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in')
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /watched|Like|library/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in to view your activity' })).toHaveAttribute('href', '/sign-in?next=%2Ftitle%2F693134')
  })

  it('toggles watched, liked, and saved through real member records', async () => {
    const user = userEvent.setup()
    const fetchMock = libraryFetch()
    vi.stubGlobal('fetch', fetchMock)
    render(signedIn(<MemberActionPanel id={693134} kind="movie" title="Dune: Part Two" />))

    const watched = await screen.findByRole('button', { name: 'Mark Dune: Part Two as watched' })
    expect(watched).toHaveAttribute('aria-pressed', 'false')
    await user.click(watched)
    expect(fetchMock).toHaveBeenCalledWith('/v1/me/library/watched/movie/693134', expect.objectContaining({ method: 'PUT' }))
    expect(await screen.findByRole('button', { name: 'Mark Dune: Part Two as not watched' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: 'Like Dune: Part Two' }))
    expect(fetchMock).toHaveBeenCalledWith('/v1/likes', expect.objectContaining({ method: 'PUT' }))
    expect(await screen.findByRole('button', { name: 'Unlike Dune: Part Two' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: 'Save Dune: Part Two to library' }))
    expect(fetchMock).toHaveBeenCalledWith('/v1/me/library/titles/movie/693134', expect.objectContaining({ method: 'PUT' }))
    expect(await screen.findByRole('button', { name: 'Remove Dune: Part Two from library' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('locks shelf actions until the saved state is known', async () => {
    const pendingReads: Array<(response: Response) => void> = []
    const fetchMock = libraryFetch({ readTitleState: () => new Promise(resolve => { pendingReads.push(resolve) }) })
    vi.stubGlobal('fetch', fetchMock)
    render(signedIn(<MemberActionPanel id={693134} kind="movie" title="Dune: Part Two" />))

    const watched = screen.getByRole('button', { name: 'Mark Dune: Part Two as watched' })
    const addReview = screen.getByRole('button', { name: 'Add review' })
    await waitFor(() => expect(pendingReads).toHaveLength(2))
    expect(watched).toHaveAttribute('aria-disabled', 'true')
    expect(addReview).toBeDisabled()
    expect(screen.getByText('Loading your shelf…')).toBeInTheDocument()

    await act(async () => {
      for (const resolve of pendingReads) {
        resolve(new Response(JSON.stringify({ rating: null, like: null, review: null, saved: false, watched: false }), { status: 200 }))
      }
    })
    await waitFor(() => expect(watched).toBeEnabled())
    expect(addReview).toBeEnabled()
  })

  it('retries a failed shelf read before enabling title toggles', async () => {
    const user = userEvent.setup()
    let reads = 0
    const fetchMock = libraryFetch({ readTitleState: () => {
      reads += 1
      const unavailable = reads <= 2
      return Promise.resolve(new Response(JSON.stringify(unavailable
        ? { error: 'fixture unavailable' }
        : { rating: null, like: null, review: null, saved: false, watched: false }), { status: unavailable ? 503 : 200 }))
    } })
    vi.stubGlobal('fetch', fetchMock)
    render(signedIn(<MemberActionPanel id={693134} kind="movie" title="Dune: Part Two" />))

    const retry = await screen.findByRole('button', { name: 'Retry shelf' })
    const watched = screen.getByRole('button', { name: 'Mark Dune: Part Two as watched' })
    const addReview = screen.getByRole('button', { name: 'Add review' })
    expect(watched).toHaveAttribute('aria-disabled', 'true')
    expect(addReview).toBeDisabled()
    retry.focus()
    await user.keyboard('{Enter}')

    await waitFor(() => expect(watched).toBeEnabled())
    expect(addReview).toBeEnabled()
    expect(watched).toHaveFocus()
    expect(reads).toBe(3)
    expect(screen.queryByRole('button', { name: 'Retry shelf' })).not.toBeInTheDocument()
  })

  it('locks shelf toggles during a write and retries the same failed choice', async () => {
    const user = userEvent.setup()
    let writes = 0
    let failFirstWrite!: (response: Response) => void
    const fetchMock = libraryFetch({ watchedWrite: () => {
      writes += 1
      if (writes === 1) return new Promise(resolve => { failFirstWrite = resolve })
      return Promise.resolve(new Response(null, { status: 204 }))
    } })
    vi.stubGlobal('fetch', fetchMock)
    render(signedIn(<MemberActionPanel id={693134} kind="movie" title="Dune: Part Two" />))

    const watched = await screen.findByRole('button', { name: 'Mark Dune: Part Two as watched' })
    await waitFor(() => expect(watched).toBeEnabled())
    await user.click(watched)
    expect(watched).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('Saving your shelf')

    await act(async () => { failFirstWrite(new Response(JSON.stringify({ error: 'fixture unavailable' }), { status: 503 })) })
    const retry = await screen.findByRole('button', { name: 'Retry marking watched' })
    expect(retry).toHaveFocus()
    expect(watched).toHaveAttribute('aria-pressed', 'false')
    expect(watched).toHaveAttribute('aria-disabled', 'true')
    expect(watched).toHaveTextContent(/^Watch$/)
    await user.click(retry)

    await waitFor(() => expect(watched).toHaveAttribute('aria-pressed', 'true'))
    expect(writes).toBe(2)
    expect(watched).toBeEnabled()
    expect(watched).toHaveAttribute('aria-disabled', 'false')
    expect(watched).toHaveFocus()
    expect(screen.queryByRole('button', { name: 'Retry marking watched' })).not.toBeInTheDocument()
  })

  it('rates inline with no separate toggle once signed in', async () => {
    const fetchMock = libraryFetch()
    vi.stubGlobal('fetch', fetchMock)
    render(signedIn(<MemberActionPanel id={693134} kind="movie" title="Dune: Part Two" />))

    expect(screen.queryByRole('button', { name: 'Rate' })).not.toBeInTheDocument()
    expect(await screen.findByRole('radiogroup', { name: 'Rate Dune: Part Two out of 5 stars' })).toBeInTheDocument()
  })

  it('reopens a newly published title review from the title shelf', async () => {
    const user = userEvent.setup()
    const fetchMock = libraryFetch({
      reviewRead: () => Promise.resolve(new Response(JSON.stringify({
        author: { avatarUrl: null, id: member.id, name: member.username, username: member.username },
        body: 'A patient masterpiece.',
        createdAt: '2026-10-31T12:00:00.000Z',
        episode: null,
        id: 693134,
        kind: 'movie',
        liked: false,
        likes: 0,
        owner: true,
        rating: null,
        reviewId: 'review-42',
        revision: 1,
        season: null,
        spoiler: false,
      }), { status: 200 })),
      reviewWrite: () => Promise.resolve(new Response(JSON.stringify({ reviewId: 'review-42' }), { status: 200 })),
    })
    vi.stubGlobal('fetch', fetchMock)
    render(signedIn(<MemberActionPanel id={693134} kind="movie" title="Dune: Part Two" />))

    const addReview = await screen.findByRole('button', { name: 'Add review' })
    await waitFor(() => expect(addReview).toBeEnabled())
    await user.click(addReview)
    const dialog = await screen.findByRole('dialog', { name: 'In your own words' })
    await screen.findByText('Only published work appears on your profile.')
    await user.type(screen.getByLabelText('Your review'), 'A patient masterpiece.')
    await user.click(screen.getByRole('button', { name: 'Publish review' }))

    const editReview = await screen.findByRole('button', { name: 'Edit review' })
    await user.click(editReview)
    await expect(screen.findByRole('dialog', { name: 'Edit your review' })).resolves.toBeInTheDocument()
    expect(screen.getByLabelText('Your review')).toHaveValue('A patient masterpiece.')
    expect(dialog).not.toBeInTheDocument()
  })

  it('opens the log dialog from the shelf and confirms the log', async () => {
    const user = userEvent.setup()
    const fetchMock = libraryFetch()
    vi.stubGlobal('fetch', fetchMock)
    render(signedIn(<MemberActionPanel id={693134} kind="movie" title="Dune: Part Two" />))

    await user.click(screen.getByRole('button', { name: 'Log a watch' }))
    expect(screen.getByRole('dialog', { name: 'Remember this watch' })).toBeInTheDocument()

    await screen.findByText('Only published work appears on your profile.')
    await user.click(screen.getByRole('button', { name: 'Save watch' }))
    expect(fetchMock).toHaveBeenCalledWith('/v1/taste/reviews', expect.objectContaining({ method: 'POST' }))
    expect(await screen.findByText('Watch logged.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('sends a title card to a followed member without attaching a message', async () => {
    const user = userEvent.setup()
    const fetchMock = libraryFetch()
    vi.stubGlobal('fetch', fetchMock)
    render(signedIn(<MemberActionPanel id={693134} kind="movie" title="Dune: Part Two" />))

    await user.click(screen.getByRole('button', { name: 'Recommend to someone' }))
    expect(await screen.findByText('Film Friend')).toBeInTheDocument()
    expect(screen.getByText(/There’s no message attached/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Recommend' }))

    expect(await screen.findByText('Sent')).toBeInTheDocument()
    const send = fetchMock.mock.calls.find(([url, init]) => String(url) === '/v1/taste/recommendations' && init?.method === 'POST')
    expect(send).toBeDefined()
    expect(JSON.parse(String(send?.[1]?.body))).toEqual({ kind: 'movie', id: 693134, recipientId: 'friend-1' })
  })

  it('copies the title link and confirms once', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(<MemberActionPanel id={693134} kind="movie" shareUrl="https://consumit.example/title/693134" title="Dune: Part Two" />)

    await user.click(screen.getByRole('button', { name: 'Share' }))

    expect(writeText).toHaveBeenCalledWith('https://consumit.example/title/693134')
    expect(screen.getByRole('button', { name: 'Link copied' })).toBeInTheDocument()
  })
})
