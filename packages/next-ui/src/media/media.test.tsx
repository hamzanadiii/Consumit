import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ArtworkFrame, PosterStack } from './media'

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

  it('keeps five collection covers individually named and linked, including missing artwork', () => {
    render(<PosterStack items={Array.from({ length: 6 }, (_, index) => ({ key: String(index), label: `Title ${index}`, href: `/title/${index}` }))} />)
    expect(screen.getAllByRole('link')).toHaveLength(5)
    expect(screen.getByRole('link', { name: 'Title 4' })).toHaveAttribute('href', '/title/4')
    expect(screen.queryByRole('link', { name: 'Title 5' })).not.toBeInTheDocument()
  })

  it('gives empty collections a stable artwork fallback without inventing a destination', () => {
    render(<PosterStack items={[]} />)
    expect(screen.getByRole('img', { name: 'Collection artwork unavailable' })).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
