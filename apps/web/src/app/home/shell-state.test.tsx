import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders as render } from '@/test/render'

import { FilScreenShell } from './filscreen-shell'
import { useShellState } from './shell-state'

let mockPathname = '/'

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

function Probe() {
  const { pendingHref, beginNavigation, sidebarOpen, toggleSidebar } = useShellState()
  return (
    <>
      <p data-testid="pending">{pendingHref ?? 'none'}</p>
      <p data-testid="sidebar">{sidebarOpen ? 'open' : 'collapsed'}</p>
      <button onClick={() => beginNavigation('/movies')} type="button">Go movies</button>
      <button onClick={toggleSidebar} type="button">Toggle sidebar</button>
    </>
  )
}

describe('shell state provider', () => {
  afterEach(() => {
    mockPathname = '/'
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  it('keeps the collapsed sidebar across shell remounts without resetting', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<FilScreenShell currentPathname="/"><p>Page one</p></FilScreenShell>)

    await user.click(screen.getByRole('button', { name: 'Hide sidebar' }))
    expect(window.localStorage.getItem('consumit.home-sidebar')).toBe('collapsed')
    expect(screen.getAllByRole('button', { name: 'Show sidebar' })).toHaveLength(2)

    // A navigation remounts the shell; the persisted choice must survive it.
    unmount()
    render(<FilScreenShell currentPathname="/movies"><p>Page two</p></FilScreenShell>)
    expect(screen.getAllByRole('button', { name: 'Show sidebar' })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Hide sidebar' })).not.toBeInTheDocument()
  })

  it('restores a stored collapsed sidebar on first mount', () => {
    window.localStorage.setItem('consumit.home-sidebar', 'collapsed')
    render(<FilScreenShell currentPathname="/"><p>Content</p></FilScreenShell>)

    expect(screen.getAllByRole('button', { name: 'Show sidebar' })).toHaveLength(2)
  })

  it('leaves the clicked row untouched and announces page loading at the top', async () => {
    const user = userEvent.setup()
    render(<FilScreenShell currentPathname="/"><p>Content</p></FilScreenShell>)
    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    const { getByRole } = within(nav)

    await user.click(getByRole('link', { name: 'History' }))
    const row = getByRole('link', { name: 'History' })
    expect(row).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('status', { name: 'Loading page' })).toBeInTheDocument()
  })

  it('marks the clicked destination pending and clears it on arrival', async () => {
    const user = userEvent.setup()
    const view = render(<Probe />)

    expect(screen.getByTestId('pending')).toHaveTextContent('none')
    await user.click(screen.getByRole('button', { name: 'Go movies' }))
    expect(screen.getByTestId('pending')).toHaveTextContent('/movies')

    mockPathname = '/movies'
    view.rerender(<Probe />)
    expect(screen.getByTestId('pending')).toHaveTextContent('none')
  })
})
