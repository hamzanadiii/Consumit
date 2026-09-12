import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  ContentCard,
  ContinueCard,
  CuratedListCard,
  TrendingCard,
  WatchCard,
} from './content-cards'

describe('content cards', () => {
  it('keeps title destinations and saved state explicit', () => {
    render(
      <ContentCard
        href="/titles/northbound"
        state="saved"
        title="Northbound"
      />,
    )

    expect(screen.getByRole('link', { name: 'Northbound' })).toHaveAttribute(
      'href',
      '/titles/northbound',
    )
    expect(screen.getByRole('link', { name: 'Northbound' })).toHaveClass('min-h-11')
    expect(screen.getByText('Saved')).toHaveClass('sr-only')
  })

  it('exposes a specific continuation action and progress', () => {
    const { container } = render(
      <ContinueCard
        href="/watch/fault-lines"
        layout="compact"
        meta="S1 E06 · 29 min left"
        progress={34}
        title="Fault Lines"
      />,
    )

    expect(screen.getByRole('link', { name: 'Continue Fault Lines' })).toHaveAttribute(
      'href',
      '/watch/fault-lines',
    )
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '34')
    expect(container.querySelector('[data-consumit-continue-card]')).toHaveAttribute(
      'data-layout',
      'compact',
    )
    expect(container.querySelector('[data-consumit-continue-card]')).toHaveClass('grid')
  })

  it('renders trend proof and curated-list ownership', () => {
    render(
      <>
        <TrendingCard
          completionProof="94% finished"
          memberScore={8.7}
          rank={1}
          title="Sea of Names"
        />
        <CuratedListCard
          artworkSources={[]}
          curator="Yasmine"
          href="/lists/memory"
          saves="426"
          title="Films that feel like a memory"
        />
      </>,
    )

    expect(screen.getByText('Rank 1')).toBeInTheDocument()
    expect(screen.getByText('8.7 member')).toBeInTheDocument()
    expect(screen.getByText("Yasmine's list")).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Films that feel like a memory' })).toHaveClass('min-h-11')
  })

  it('shows a one-line catalog meta under trending titles', () => {
    render(<TrendingCard meta="★ 8.3 · 2026 · Series" rank={3} title="Lanterns" />)

    expect(screen.getByText('★ 8.3 · 2026 · Series')).toBeInTheDocument()
  })
  it('covers each card with a keyboard-silent destination overlay', () => {
    const { container } = render(
      <>
        <ContentCard href="/titles/northbound" title="Northbound" />
        <TrendingCard href="/titles/fault-lines" rank={2} title="Fault Lines" />
        <CuratedListCard artworkSources={[]} curator="Yasmine" href="/lists/memory" title="Films that feel like a memory" />
      </>,
    )

    const overlays = container.querySelectorAll('a[aria-hidden="true"][tabindex="-1"]')
    expect(overlays).toHaveLength(3)
    expect(overlays[0]).toHaveAttribute('href', '/titles/northbound')
    expect(overlays[1]).toHaveAttribute('href', '/titles/fault-lines')
    expect(overlays[2]).toHaveAttribute('href', '/lists/memory')
    for (const overlay of overlays) {
      expect(overlay.className).toMatch(/absolute/)
      expect(overlay.className).toMatch(/inset-0/)
    }
  })

  it('keeps the trending artwork below the overlay destination link', () => {
    const { container } = render(
      <TrendingCard href="/titles/fault-lines" rank={2} title="Fault Lines" />,
    )

    const overlay = container.querySelector('[data-consumit-trending-card] > a[aria-hidden="true"]')
    expect(overlay).toHaveAttribute('href', '/titles/fault-lines')
    expect(overlay).toHaveAttribute('tabindex', '-1')
    expect(container.querySelector('[data-consumit-trending-poster] > div')).not.toHaveClass('z-10')
  })

  it('pairs overlaid title and rating with a bookmark slot', () => {
    const { container } = render(
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
    const overlay = container.querySelector('[data-consumit-watch-card] > div > a[aria-hidden="true"]')
    expect(overlay).toHaveAttribute('href', '/title/693134')
    expect(overlay).toHaveAttribute('tabindex', '-1')
    expect(screen.getByRole('button', { name: 'Save Dune' })).toBeInTheDocument()
    expect(screen.getByText('8.2')).toBeInTheDocument()
  })

  it('keeps card actions clickable above the overlay destination', () => {
    const { container } = render(
      <>
        <ContentCard action={<button type="button">Save Northbound</button>} href="/titles/northbound" state="saved" title="Northbound" />
        <TrendingCard action={<button type="button">Save Fault Lines</button>} href="/titles/fault-lines" rank={2} title="Fault Lines" />
        <CuratedListCard artworkSources={[]} curator="Yasmine" href="/lists/memory" title="Films that feel like a memory" />
      </>,
    )

    expect(screen.getByRole('button', { name: 'Save Northbound' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save Fault Lines' })).toBeInTheDocument()
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
    expect(container.querySelector('[data-consumit-content-card] [class*="z-10"]')).toBeInTheDocument()
  })

  it('anchors the trending rank behind the poster instead of below the card', () => {
    const { container } = render(
      <TrendingCard
        completionProof="94% finished"
        memberScore={8.7}
        rank={1}
        title="Sea of Names"
      />,
    )

    const posterGroup = container.querySelector<HTMLElement>(
      '[data-consumit-trending-poster]',
    )
    const rank = container.querySelector<HTMLElement>(
      '[data-consumit-trending-rank]',
    )
    const card = container.querySelector<HTMLElement>(
      '[data-consumit-trending-card]',
    )

    expect(card).toHaveClass('relative')
    expect(posterGroup).toContainElement(rank)
    expect(rank).toHaveClass(
      'absolute',
      'top-1/2',
      'left-2',
      '-translate-y-1/2',
      'text-[6.25rem]',
    )
  })
})
