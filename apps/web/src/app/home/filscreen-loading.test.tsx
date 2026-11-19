import { act, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders as render } from '@/test/render'

import { FILSCREEN_PROLONGED_LOADING_MS, FilScreenLoading } from './filscreen-loading'
import { FilScreenShell } from './filscreen-shell'
import { ShellStateProvider } from './shell-state'

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), refresh }),
}))

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }))

afterEach(() => {
  vi.useRealTimers()
  refresh.mockReset()
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

  it('offers an explicit same-route retry after prolonged loading', async () => {
    vi.useFakeTimers()
    render(<FilScreenLoading />)

    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()

    await act(async () => { await vi.advanceTimersByTimeAsync(FILSCREEN_PROLONGED_LOADING_MS) })

    expect(screen.getByRole('status', { name: 'Still loading' })).toHaveTextContent('taking longer than usual')
    const retry = screen.getByRole('button', { name: 'Try again' })
    expect(retry).toHaveClass('min-h-[44px]')
    fireEvent.click(retry)
    expect(refresh).toHaveBeenCalledOnce()
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
