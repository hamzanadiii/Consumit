import { screen } from '@testing-library/react'
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

const emptyLibrary = { diary: [], favorites: [], lists: [], saved: [], watched: [] }
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

function libraryFetch() {
  return vi.fn().mockImplementation((input: string | URL | Request) => {
    const url = String(input)
    if (url.includes('/v1/me/titles/')) {
      return Promise.resolve(new Response(JSON.stringify({ rating: null, like: null, review: null }), { status: 200 }))
    }
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
    expect(screen.getByRole('link', { name: 'Your activity' })).toHaveAttribute('href', '/library')
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

  it('rates inline with no separate toggle once signed in', async () => {
    const fetchMock = libraryFetch()
    vi.stubGlobal('fetch', fetchMock)
    render(signedIn(<MemberActionPanel id={693134} kind="movie" title="Dune: Part Two" />))

    expect(screen.queryByRole('button', { name: 'Rate' })).not.toBeInTheDocument()
    expect(await screen.findByRole('radiogroup', { name: 'Rate Dune: Part Two out of 10' })).toBeInTheDocument()
  })

  it('opens the log dialog from the shelf and confirms the log', async () => {
    const user = userEvent.setup()
    const fetchMock = libraryFetch()
    vi.stubGlobal('fetch', fetchMock)
    render(signedIn(<MemberActionPanel id={693134} kind="movie" title="Dune: Part Two" />))

    await user.click(screen.getByRole('button', { name: 'Add review' }))
    expect(screen.getByRole('dialog', { name: 'Log Dune: Part Two' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(fetchMock).toHaveBeenCalledWith('/v1/me/diary', expect.objectContaining({ method: 'POST' }))
    expect(await screen.findByText('Logged.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
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
