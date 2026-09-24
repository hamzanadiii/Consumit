import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { OrderedTitleRow, SavedTitleCard } from './library'

describe('library and list components', () => {
  it('announces saved and watched state', () => {
    render(<SavedTitleCard meta="2025 · Movie" progress={62} title="The Silent Year" />)

    expect(screen.getByText('Saved')).toHaveClass('sr-only')
    expect(screen.getByText('62% watched')).toHaveClass('sr-only')
  })

  it('stretches saved-title destinations while keeping footer actions clickable', () => {
    const { container } = render(
      <SavedTitleCard
        footer={<button type="button">Remove</button>}
        href="/titles/silent-year"
        meta="2025 · Movie"
        title="The Silent Year"
      />,
    )

    expect(screen.getByRole('link', { name: 'The Silent Year' })).toHaveAttribute('href', '/titles/silent-year')
    expect(container.querySelectorAll('[data-consumit-saved-title-card] a')).toHaveLength(1)
    expect(container.querySelector('[data-consumit-saved-title-card]')).toHaveClass('relative')
    expect(screen.getByRole('button', { name: 'Remove' }).parentElement).toHaveClass('relative', 'z-10')
  })

  it('prefers the interactive watchlist action over the static saved badge', () => {
    const { container } = render(
      <SavedTitleCard
        action={<button type="button">Remove from watchlist</button>}
        href="/titles/silent-year"
        meta="2025 · Movie"
        title="The Silent Year"
      />,
    )

    expect(screen.getByRole('button', { name: 'Remove from watchlist' })).toBeInTheDocument()
    expect(container.querySelector('[data-consumit-saved-title-card] [class*="z-10"]')).toBeInTheDocument()
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('renders ordered title evidence', () => {
    render(
      <OrderedTitleRow index={1} match={96} meta="2021 · Mystery" title="The Silent Year" />,
    )

    expect(screen.getByText('01')).toBeInTheDocument()
    expect(screen.getByText('96% match')).toBeInTheDocument()
  })
})
