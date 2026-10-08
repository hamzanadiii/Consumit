import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SessionProvider } from '../session/session'

import { FilScreenShell } from './filscreen-shell'
import { ShellStateProvider } from './shell-state'

const mocks = vi.hoisted(() => ({
  logoutMember: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
  usePathname: () => '/',
}))

vi.mock('@/lib/identity-browser', () => ({
  logoutMember: mocks.logoutMember,
}))

const member = {
  avatarStyle: 'dusk',
  avatarUrl: null,
  createdAt: '2026-09-07T12:00:00.000Z',
  displayName: 'Hamza',
  email: 'member@example.com',
  emailVerified: true,
  id: '9e0a21f4-31bc-4aa7-98ae-b3cb8da0a8ca',
  role: 'member',
  username: 'hamzanadi',
} as const

function renderShell(children = <p>Content</p>, pathname = '/') {
  return render(
    <SessionProvider initialMember={{ ...member }} initialStatus="authenticated">
      <ShellStateProvider>
        <FilScreenShell currentPathname={pathname}>{children}</FilScreenShell>
      </ShellStateProvider>
    </SessionProvider>,
  )
}

describe('FilScreenShell', () => {
  it('keeps Friends, Circle, and Network out of member navigation', () => {
    renderShell()
    expect(screen.queryByRole('link', { name: /friends|circle|network/i })).not.toBeInTheDocument()
  })
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
  })

  it('renders an sr-only page heading only when one is supplied', () => {
    const { rerender } = render(
      <SessionProvider initialStatus="anonymous">
        <FilScreenShell currentPathname="/" pageHeading={undefined}><p>Content</p></FilScreenShell>
      </SessionProvider>,
    )
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()

    rerender(
      <SessionProvider initialStatus="anonymous">
        <FilScreenShell currentPathname="/" pageHeading="Consumit home"><p>Content</p></FilScreenShell>
      </SessionProvider>,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Consumit home' })).toHaveClass('sr-only')
  })

  it('links directly to personal archives and keeps profile access through the avatar', () => {
    renderShell()
    const navigation = screen.getByRole('navigation', { name: 'Main navigation' })
    for (const [label, section] of [['Watchlist', 'watchlist'], ['Likes', 'likes'], ['Watched', 'films'], ['History', 'history'], ['Lists', 'lists']] as const) {
      expect(within(navigation).getByRole('link', { name: label })).toHaveAttribute('href', `/profile/hamzanadi/${section}`)
    }
    expect(within(navigation).queryByRole('link', { name: 'Profile' })).not.toBeInTheDocument()
    expect(within(navigation).queryByRole('link', { name: 'Diary' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Your library, signed in as hamzanadi' })).toHaveAttribute('href', '/profile/hamzanadi')
  })

  it.each(['/profile/hamzanadi/films', '/profile/hamzanadi/films/ratings/8'])('highlights only Watched at %s', (pathname) => {
    renderShell(undefined, pathname)
    const navigation = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(within(navigation).getByRole('link', { name: 'Watched' })).toHaveAttribute('aria-current', 'page')
    expect(within(navigation).getAllByRole('link').filter((link) => link.hasAttribute('aria-current'))).toHaveLength(1)
  })

  it('keeps archive destinations accessible when collapsed', async () => {
    const user = userEvent.setup()
    renderShell(undefined, '/profile/hamzanadi/likes')
    await user.click(screen.getByRole('button', { name: 'Hide sidebar' }))
    const navigation = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(within(navigation).getByRole('link', { name: 'Likes' })).toHaveAttribute('aria-current', 'page')
    expect(within(navigation).getByRole('link', { name: 'Watchlist' })).toHaveAttribute('title', 'Watchlist')
  })

  it('keeps personal shortcuts visible with a shared guest avatar while sending archive guests through authentication', async () => {
    const user = userEvent.setup()
    render(<SessionProvider initialStatus="anonymous"><ShellStateProvider><FilScreenShell currentPathname="/"><p>Content</p></FilScreenShell></ShellStateProvider></SessionProvider>)
    const navigation = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(within(navigation).getAllByRole('link')).toHaveLength(6)
    expect(within(navigation).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/')
    for (const [label, section] of [['Watchlist', 'watchlist'], ['Likes', 'likes'], ['Watched', 'films'], ['History', 'history'], ['Lists', 'lists']] as const) {
      expect(within(navigation).getByRole('link', { name: label })).toHaveAttribute('href', `/library?section=${section}`)
    }
    const guest = screen.getByRole('link', { name: 'Guest profile' })
    expect(guest).toHaveAttribute('href', '/library?section=profile')
    expect(guest).toHaveTextContent('G')
    expect(window.sessionStorage.getItem('consumit.guest-character')).toBeNull()
    expect(screen.getByRole('button', { name: 'Search titles' }).nextElementSibling).toBe(guest)
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Hide sidebar' }))
    expect(within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('link', { name: 'Watchlist' })).toHaveAttribute('title', 'Watchlist')
    expect(guest).toBeInTheDocument()
  })

  it('signs out successfully and clears the session', async () => {
    const user = userEvent.setup()
    mocks.logoutMember.mockResolvedValue(undefined)
    renderShell()

    await user.click(screen.getByRole('button', { name: 'Log out' }))

    await waitFor(() => expect(mocks.logoutMember).toHaveBeenCalledTimes(1))
    expect(mocks.push).toHaveBeenCalledWith('/sign-in')
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows a retry message when sign-out fails and recovers on retry', async () => {
    const user = userEvent.setup()
    mocks.logoutMember.mockRejectedValueOnce(new Error('network down'))
    mocks.logoutMember.mockResolvedValueOnce(undefined)
    renderShell()

    await user.click(screen.getByRole('button', { name: 'Log out' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sign out could not finish. Check your connection and try again.',
    )
    expect(mocks.push).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Log out' }))

    await waitFor(() => expect(mocks.logoutMember).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(mocks.push).toHaveBeenCalledWith('/sign-in')
  })
})
