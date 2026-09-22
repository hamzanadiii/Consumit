import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders as render } from '@/test/render'

import { FilScreenLoading } from './filscreen-loading'
import { FilScreenShell } from './filscreen-shell'

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

afterEach(() => {
  window.localStorage.clear()
})

describe('filscreen loading', () => {
  it('announces the loading home through a status role', () => {
    render(<FilScreenLoading />)

    const status = screen.getByRole('status', { name: 'Loading Consumit home' })
    expect(status).toBeInTheDocument()
    expect(status).toHaveTextContent('Gathering your hero')
  })

  it('keeps skeleton pulses subordinate and motion-safe', () => {
    const { container } = render(<FilScreenLoading />)

    const skeleton = container.querySelector('[data-filscreen-loading]')
    expect(skeleton).toBeInTheDocument()
    // Decorative skeletons stay hidden from assistive tech; only the
    // status label announces.
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0)
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
    expect(container.querySelector('.motion-reduce\\:animate-none')).toBeInTheDocument()
  })

  it('stays in light mode when the member chose light', () => {
    window.localStorage.setItem('consumit.home-theme', 'light')
    const { container } = render(
      <FilScreenShell activeKindTab="new" pageHeading="Loading Consumit home">
        <FilScreenLoading />
      </FilScreenShell>,
    )

    expect(container.querySelector('[data-filscreen-home]')?.getAttribute('data-theme')).toBe('light')
    expect(screen.getByRole('status', { name: 'Loading Consumit home' })).toBeInTheDocument()
  })
})
