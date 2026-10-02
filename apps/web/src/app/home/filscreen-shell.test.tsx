import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SessionProvider } from '../session/session'

import { FilScreenShell } from './filscreen-shell'

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

function renderShell(children = <p>Content</p>) {
  return render(
    <SessionProvider initialMember={{ ...member }} initialStatus="authenticated">
      <FilScreenShell currentPathname="/">{children}</FilScreenShell>
    </SessionProvider>,
  )
}

describe('FilScreenShell', () => {
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

  it('uses Profile as the single member archive destination in the primary navigation', () => {
    renderShell()
    const navigation = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(within(navigation).getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '/profile/hamzanadi')
    for (const name of ['Watchlist', 'Library', 'Lists', 'History']) expect(within(navigation).queryByRole('link', { name })).not.toBeInTheDocument()
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
