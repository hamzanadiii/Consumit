import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SessionNavigation } from './session-navigation'
import { SessionProvider } from './session'
import { FilScreenShell } from '../home/filscreen-shell'

const mocks = vi.hoisted(() => ({
  invalidateMemberLibraryCache: vi.fn(),
  logoutMember: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}))

vi.mock('@/lib/identity-browser', () => ({
  invalidateMemberLibraryCache: mocks.invalidateMemberLibraryCache,
  logoutMember: mocks.logoutMember,
}))

const signedInMember = {
  createdAt: '2026-09-06T00:00:00.000Z',
  displayName: 'Hamza',
  email: 'hamza@example.com',
  emailVerified: true,
  id: 'member_1',
  avatarStyle: 'halo',
  avatarUrl: null,
  role: 'member',
  username: 'hamza_8',
} as const

describe('SessionNavigation member menu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.logoutMember.mockResolvedValue(undefined)
  })

  it('shows the generated portrait when no custom avatar is set', () => {
    const { container } = render(
      <SessionProvider initialMember={{ ...signedInMember }} initialStatus="authenticated">
        <SessionNavigation activeHref="/" />
      </SessionProvider>,
    )

    const portrait = container.querySelector('button img')
    expect(portrait).toHaveAttribute('src', 'https://api.dicebear.com/7.x/notionists/svg?seed=member_1&backgroundColor=transparent')
  })

  it('opens the member menu on avatar click instead of navigating away', async () => {
    const user = userEvent.setup()
    render(
      <SessionProvider initialMember={{ ...signedInMember }} initialStatus="authenticated">
        <SessionNavigation activeHref="/" />
      </SessionProvider>,
    )

    const trigger = screen.getByRole('button', { name: 'Hamza menu' })
    expect(trigger.tagName).toBe('BUTTON')
    expect(trigger).not.toHaveAttribute('href')

    await user.click(trigger)

    expect(
      await screen.findByRole('menuitem', { name: 'My Library' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('menuitem', { name: 'My profile' }),
    ).toHaveAttribute('href', '/profile/hamza_8')
    expect(screen.queryByRole('link', { name: 'View profile' })).not.toBeInTheDocument()
  })

  it('revokes the server session before clearing the member', async () => {
    const user = userEvent.setup()
    render(
      <SessionProvider initialMember={{ ...signedInMember }} initialStatus="authenticated">
        <SessionNavigation activeHref="/" />
      </SessionProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'Hamza menu' }))
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }))

    await waitFor(() => expect(mocks.logoutMember).toHaveBeenCalledTimes(1))
    expect(mocks.push).toHaveBeenCalledWith('/sign-in')
    expect(screen.queryByRole('button', { name: 'Hamza menu' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Sign in' }).length).toBeGreaterThan(0)
  })

  it.each(['navigation', 'sidebar'] as const)('keeps the member signed in and allows retry when %s logout fails', async (surface) => {
    const user = userEvent.setup()
    mocks.logoutMember.mockRejectedValueOnce(new Error('Offline'))
    render(
      <SessionProvider initialMember={{ ...signedInMember }} initialStatus="authenticated">
        {surface === 'navigation' ? <SessionNavigation activeHref="/" /> : <FilScreenShell><p>Library</p></FilScreenShell>}
      </SessionProvider>,
    )
    async function logout() {
      if (surface === 'navigation') {
        await user.click(screen.getByRole('button', { name: 'Hamza menu' }))
        await user.click(screen.getByRole('menuitem', { name: 'Sign out' }))
      } else {
        await user.click(screen.getByRole('button', { name: 'Log out' }))
      }
    }
    await logout()
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign out could not finish')
    expect(mocks.push).not.toHaveBeenCalled()
    expect(mocks.invalidateMemberLibraryCache).not.toHaveBeenCalled()
    await logout()
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/sign-in'))
    expect(mocks.invalidateMemberLibraryCache).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
