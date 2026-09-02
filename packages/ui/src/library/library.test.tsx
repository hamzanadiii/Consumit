import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CuratorPanel, LibraryToolbar, OrderedTitleRow, SavedTitleCard } from './library'

describe('library and list components', () => {
  it('renders a named native library search', () => {
    render(<LibraryToolbar />)

    expect(screen.getByRole('searchbox', { name: 'Search inside your library' })).toHaveAttribute('name', 'q')
  })

  it('announces saved and watched state', () => {
    render(<SavedTitleCard meta="2025 · Movie" progress={62} title="The Silent Year" />)

    expect(screen.getByText('Saved')).toHaveClass('sr-only')
    expect(screen.getByText('62% watched')).toHaveClass('sr-only')
  })

  it('renders ordered title evidence and curators', () => {
    render(
      <>
        <OrderedTitleRow index={1} match={96} meta="2021 · Mystery" title="The Silent Year" />
        <CuratorPanel curators={[{ name: 'Omar', role: 'Owner' }, { name: 'Yasmine', role: 'Collaborator' }]} />
      </>,
    )

    expect(screen.getByText('01')).toBeInTheDocument()
    expect(screen.getByText('96% match')).toBeInTheDocument()
    expect(screen.getByText('Collaborator')).toBeInTheDocument()
  })
})
