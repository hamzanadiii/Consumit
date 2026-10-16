import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders as render } from '@/test/render'

import { FilScreenLoading } from './filscreen-loading'
import { FilScreenShell } from './filscreen-shell'
import { ShellStateProvider } from './shell-state'

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

afterEach(() => {
  window.localStorage.clear()
})

describe('filscreen loading', () => {
  it('announces loading through a status role without claiming a route', () => {
    render(<FilScreenLoading />)

    const status = screen.getByRole('status', { name: 'Loading' })
    expect(status).toBeInTheDocument()
    expect(status).toHaveTextContent('Fetching fresh titles')
    expect(status).not.toHaveTextContent('home')
  })

  it('shows a quiet centered loader with no skeleton blocks', () => {
    const { container } = render(<FilScreenLoading />)

    const loader = container.querySelector('[data-filscreen-loading]')
    expect(loader).toBeInTheDocument()
    expect(container.querySelector('.animate-pulse')).not.toBeInTheDocument()
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
    expect(container.querySelector('.motion-reduce\\:animate-none')).toBeInTheDocument()
  })

  it('stays in light mode when the member chose light', () => {
    window.localStorage.setItem('consumit.home-theme', 'light')
    const { container } = render(
      <ShellStateProvider>
        <FilScreenShell activeKindTab="new" pageHeading="Loading">
          <FilScreenLoading />
        </FilScreenShell>
      </ShellStateProvider>,
    )

    expect(container.querySelector('[data-filscreen-home]')?.getAttribute('data-theme')).toBe('light')
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument()
  })
})
