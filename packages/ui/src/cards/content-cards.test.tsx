import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  ContentCard,
  ContinueCard,
  CuratedListCard,
  TrendingCard,
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
    expect(screen.getByText('Saved')).toHaveClass('sr-only')
  })

  it('exposes a specific continuation action and progress', () => {
    render(
      <ContinueCard
        href="/watch/fault-lines"
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
          saves="426"
          title="Films that feel like a memory"
        />
      </>,
    )

    expect(screen.getByText('Rank 1')).toBeInTheDocument()
    expect(screen.getByText('8.7 member')).toBeInTheDocument()
    expect(screen.getByText("Yasmine's list")).toBeInTheDocument()
  })
})
