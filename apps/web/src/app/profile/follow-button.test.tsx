import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders as render } from '@/test/render'

import { SessionProvider } from '../session/session'
import { FollowButton } from './follow-button'

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: mocks.refresh }),
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

function followFetch(following: boolean) {
  return vi.fn().mockImplementation((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    if (url === '/v1/follows/alex_sample' && method === 'GET') {
      return Promise.resolve(new Response(JSON.stringify({ following }), { status: 200 }))
    }
    if (url === '/v1/follows/alex_sample' && method === 'PUT') {
      return Promise.resolve(new Response(JSON.stringify({ followers: 4, following: true }), { status: 200 }))
    }
    if (url === '/v1/follows/alex_sample' && method === 'DELETE') {
      return Promise.resolve(new Response(JSON.stringify({ followers: 3, following: false }), { status: 200 }))
    }
    return Promise.resolve(new Response('Not found', { status: 404 }))
  })
}

function signedIn(username: string, children: ReactNode) {
  return (
    <SessionProvider initialMember={{ ...member, username }} initialStatus="authenticated">
      {children}
    </SessionProvider>
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  mocks.refresh.mockClear()
})

describe('follow button', () => {
  it('stays hidden for guests and for the profile owner', () => {
    const { unmount } = render(<SessionProvider><FollowButton username="alex_sample" /></SessionProvider>)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    unmount()

    render(signedIn('alex_sample', <FollowButton username="alex_sample" />))
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('follows with the primary treatment and refreshes counts', async () => {
    const user = userEvent.setup()
    const fetchMock = followFetch(false)
    vi.stubGlobal('fetch', fetchMock)
    render(signedIn('cinema_fan', <FollowButton username="alex_sample" />))

    const follow = await screen.findByRole('button', { name: 'Follow alex_sample' })
    expect(follow).toHaveAttribute('aria-pressed', 'false')
    await user.click(follow)

    expect(fetchMock).toHaveBeenCalledWith('/v1/follows/alex_sample', expect.objectContaining({ method: 'PUT' }))
    expect(await screen.findByRole('button', { name: 'Unfollow alex_sample' })).toHaveAttribute('aria-pressed', 'true')
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('unfollows with the secondary treatment', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', followFetch(true))
    render(signedIn('cinema_fan', <FollowButton username="alex_sample" />))

    const following = await screen.findByRole('button', { name: 'Unfollow alex_sample' })
    expect(following).toHaveAttribute('aria-pressed', 'true')
    await user.click(following)

    expect(await screen.findByRole('button', { name: 'Follow alex_sample' })).toHaveAttribute('aria-pressed', 'false')
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('reverts and reports when the toggle fails', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockImplementation((input: string | URL | Request, init?: RequestInit) => {
      if (String(input) === '/v1/follows/alex_sample' && (init?.method ?? 'GET') === 'GET') {
        return Promise.resolve(new Response(JSON.stringify({ following: false }), { status: 200 }))
      }
      return Promise.resolve(new Response(JSON.stringify({ error: { code: 'INTERNAL', message: 'Down.', retryable: true } }), { status: 503 }))
    }))
    render(signedIn('cinema_fan', <FollowButton username="alex_sample" />))

    await user.click(await screen.findByRole('button', { name: 'Follow alex_sample' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('circle')
    expect(screen.getByRole('button', { name: 'Follow alex_sample' })).toHaveAttribute('aria-pressed', 'false')
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
})
