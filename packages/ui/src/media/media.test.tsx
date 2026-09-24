import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ArtworkFrame } from './media'

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
})
