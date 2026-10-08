import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CuratedListCard, WatchCard } from './content-cards'

describe('content cards', () => {
  it('renders curated-list ownership with a title destination', () => {
    render(
      <CuratedListCard
        artworkSources={[]}
        curator="Yasmine"
        href="/lists/memory"
        saves="426"
        title="Films that feel like a memory"
      />,
    )

    expect(screen.getByText("Yasmine's list")).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Films that feel like a memory' })).toHaveClass('min-h-11')
    expect(screen.getByRole('link', { name: 'Films that feel like a memory' })).toHaveAttribute(
      'href',
      '/lists/memory',
    )
  })

  it('keeps the curated-list overlay destination under the artwork', () => {
    const { container } = render(
      <CuratedListCard artworkSources={[]} curator="Yasmine" href="/lists/memory" title="Films that feel like a memory" />,
    )

    const overlay = container.querySelector('a[aria-hidden="true"][tabindex="-1"]')
    expect(overlay).toHaveAttribute('href', '/lists/memory')
    expect(overlay?.className).toMatch(/absolute/)
    expect(overlay?.className).toMatch(/inset-0/)
  })

  it('keeps the poster title link accessible beside the bookmark action', () => {
    render(
      <WatchCard
        bookmark={<button type="button">Save Dune</button>}
        href="/watch/movie/693134"
        meta="2024"
        rating={8.2}
        title="Dune: Part Two"
        titleHref="/title/693134"
      />,
    )

    expect(screen.queryByRole('link', { name: 'Watch Dune: Part Two' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Dune: Part Two' })).toHaveAttribute('href', '/title/693134')
    expect(screen.getAllByRole('link', { name: 'Dune: Part Two' })).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Save Dune' })).toBeInTheDocument()
    expect(screen.getByText('8.2')).toBeInTheDocument()
  })
})
