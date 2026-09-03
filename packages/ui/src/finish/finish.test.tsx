import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { EmptyState, ErrorState, Footer, LoadingState } from './finish'

describe('global finish components', () => {
  it('renders footer navigation and legal copy', () => {
    const { container } = render(<Footer copyright="© 2026 Consumit" links={[{ href: '/help', label: 'Help' }]} />)

    expect(screen.getByRole('navigation', { name: 'Footer' })).toBeInTheDocument()
    expect(screen.getByText('© 2026 Consumit')).toBeInTheDocument()
    expect(container.querySelector('img')).toHaveAttribute('src', '/assets/consumit-mark.svg')
  })

  it('renders honest empty, loading, and error states', () => {
    render(
      <>
        <EmptyState description="Save a title to begin." title="Your library is quiet" />
        <LoadingState title="Loading your library" />
        <ErrorState description="Check your connection and try again." title="Your library did not load" />
      </>,
    )

    expect(screen.getByRole('heading', { name: 'Your library is quiet' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Loading your library')
    expect(screen.getByRole('alert')).toHaveTextContent('Check your connection and try again.')
  })
})
