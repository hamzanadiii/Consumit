import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionProvider } from '../session/session'
import { ShellStateProvider } from './shell-state'
import { FilScreenShell } from './consumit-shell'

const mocks = vi.hoisted(() => ({ logout: vi.fn(), push: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ usePathname: () => '/', useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }))
vi.mock('@/lib/identity-browser', () => ({ logoutMember: mocks.logout }))
vi.mock('./filscreen-search-overlay', () => ({ FilScreenSearchOverlay: ({ onClose }: { onClose: () => void }) => <div role="dialog" aria-label="Search titles"><button onClick={onClose}>Close search</button></div> }))
const member = { avatarStyle: 'dusk', avatarUrl: null, createdAt: '2026-01-01T00:00:00Z', displayName: 'Alex', email: 'sample@example.com', emailVerified: true, id: 'sample-member', role: 'member', username: 'alex' } as const
function view(authenticated = true, path = '/') { return render(<SessionProvider initialMember={authenticated ? member : null} initialStatus={authenticated ? 'authenticated' : 'anonymous'}><ShellStateProvider><FilScreenShell currentPathname={path}><p>Screen content</p></FilScreenShell></ShellStateProvider></SessionProvider>) }
beforeEach(() => { vi.clearAllMocks(); localStorage.clear() })

describe('independent frontend navigation', () => {
  it('keeps catalog and private museum destinations distinct with current-page semantics', async () => {
    const user = userEvent.setup(); view(true, '/series/123')
    const main = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(within(main).getByRole('link', { name: 'Series' })).toHaveAttribute('aria-current', 'page')
    expect(within(main).getAllByRole('link').filter(link => link.hasAttribute('aria-current'))).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Open your space' }))
    const space = screen.getByRole('navigation', { name: 'Your space' })
    expect(within(space).getByRole('link', { name: 'Your museum' })).toHaveAttribute('href', '/profile/alex')
    expect(within(space).getByRole('link', { name: 'Diary' })).toHaveAttribute('href', '/profile/alex/diary')
    expect(within(space).getByRole('link', { name: 'Settings & appearance' })).toHaveAttribute('href', '/settings')
  })
  it('restores account-trigger focus on Escape and preserves reachable mobile destinations', async () => {
    const user = userEvent.setup(); view()
    const trigger = screen.getByRole('button', { name: 'Open your space' })
    await user.click(trigger); await user.tab(); await user.keyboard('{Escape}')
    expect(trigger).toHaveFocus(); expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('navigation', { name: 'Your space' })).not.toBeInTheDocument()
    const dock = screen.getByRole('navigation', { name: 'Mobile navigation' })
    expect(within(dock).getByRole('link', { name: 'Museum' })).toHaveAttribute('href', '/profile/alex')
    await user.click(trigger); expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })
  it('gives guests sign-in and intended private destinations without member facts', async () => {
    const user = userEvent.setup(); view(false)
    await user.click(screen.getByRole('button', { name: 'Open your space' }))
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in')
    expect(screen.getByRole('link', { name: 'Your museum' })).toHaveAttribute('href', '/library?section=profile')
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
  })
  it('keeps the session on failed sign-out and offers a retry', async () => {
    const user = userEvent.setup(); mocks.logout.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(undefined); view()
    await user.click(screen.getByRole('button', { name: 'Open your space' }))
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign out could not finish')
    expect(mocks.push).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/sign-in'))
  })
  it('opens search from the keyboard and restores its visible trigger on dismissal', async () => {
    const user = userEvent.setup(); view()
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(screen.getByRole('dialog', { name: 'Search titles' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close search' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Search titles' })).toHaveFocus())
  })
})
