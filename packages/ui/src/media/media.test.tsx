import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ArtworkFrame, LandscapeStill, PosterCard } from './media'

describe('media components', () => {
  it('uses supplied artwork when available and a named fallback otherwise', () => {
    render(
      <>
        <ArtworkFrame alt="Northbound poster" src="/northbound.svg" />
        <ArtworkFrame alt="Unknown title artwork" />
      </>,
    )

    expect(screen.getByRole('img', { name: 'Northbound poster' })).toHaveAttribute(
      'src',
      '/northbound.svg',
    )
    expect(
      screen.getByRole('img', { name: 'Unknown title artwork' }),
    ).toBeInTheDocument()
  })

  it('keeps poster actions clickable above the stretched destination', () => {
    render(<PosterCard action={<button type="button">Save Northbound</button>} href="/titles/northbound" title="Northbound" />)

    expect(screen.getByRole('button', { name: 'Save Northbound' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Northbound' })).toHaveAttribute('href', '/titles/northbound')
  })

  it('exposes poster destinations and viewing progress', () => {
    const { container } = render(
      <>
        <PosterCard href="/titles/northbound" title="Northbound" />
        <LandscapeStill
          alt="Fault Lines episode still"
          playHref="/watch/fault-lines"
          progress={42}
        />
      </>,
    )

    expect(screen.getByRole('link', { name: 'Northbound' })).toHaveAttribute(
      'href',
      '/titles/northbound',
    )
    const overlay = container.querySelector('[data-consumit-poster-card] > a[aria-hidden="true"]')
    expect(overlay).toHaveAttribute('href', '/titles/northbound')
    expect(overlay).toHaveAttribute('tabindex', '-1')
    expect(screen.getByRole('link', { name: 'Continue watching' })).toHaveAttribute(
      'href',
      '/watch/fault-lines',
    )
    expect(screen.getByRole('progressbar', { name: '42% watched' })).toHaveAttribute(
      'aria-valuenow',
      '42',
    )
  })
})
