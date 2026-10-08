import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders as render } from '@/test/render'
import { FilScreenShell } from './consumit-shell'
import { useShellState } from './shell-state'
let mockPathname = '/'
vi.mock('next/navigation', () => ({ usePathname: () => mockPathname, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
function Probe() {
  const { pendingHref, beginNavigation } = useShellState()
  return <><p data-testid="pending">{pendingHref ?? 'none'}</p><button onClick={() => beginNavigation('/movies')}>Go movies</button></>
}
afterEach(() => { mockPathname = '/'; localStorage.clear(); sessionStorage.clear() })
describe('new frontend route transitions', () => {
  it('announces navigation while preserving the catalog label', async () => {
    const user = userEvent.setup(); render(<FilScreenShell><p>Content</p></FilScreenShell>)
    const link = within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('link', { name: 'Movies' })
    await user.click(link)
    expect(link).toHaveTextContent('Movies')
    expect(screen.getByRole('status', { name: 'Loading page' })).toBeInTheDocument()
  })
  it('clears the loading destination on arrival', async () => {
    const user = userEvent.setup(); const view = render(<Probe />)
    await user.click(screen.getByRole('button', { name: 'Go movies' }))
    expect(screen.getByTestId('pending')).toHaveTextContent('/movies')
    mockPathname = '/movies'; view.rerender(<Probe />)
    expect(screen.getByTestId('pending')).toHaveTextContent('none')
  })
})
