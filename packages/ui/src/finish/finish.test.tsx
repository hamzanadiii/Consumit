import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { EmptyState, ErrorState, LoadingState } from './finish'

describe('global finish components', () => {
  it('renders honest empty, loading, and error states', () => {
    render(
      <>
        <EmptyState description="Save a title to begin." title="Your library is quiet" />
        <EmptyState description="Try another title." headingLevel={1} title="No results" />
        <LoadingState title="Loading your library" />
        <ErrorState description="Check your connection and try again." title="Your library did not load" />
        <ErrorState description="Reload to try again." headingLevel={1} title="Page unavailable" />
      </>,
    )

    expect(screen.getByRole('heading', { name: 'Your library is quiet' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'No results', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Loading your library')
    expect(screen.getAllByRole('alert').map(alert => alert.textContent).join(' ')).toContain('Check your connection and try again.')
    expect(screen.getByRole('heading', { name: 'Page unavailable', level: 1 })).toBeInTheDocument()
  })
})
