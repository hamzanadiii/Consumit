import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SectionHeading } from './editorial'

describe('editorial components', () => {
  it('keeps section hierarchy semantic', () => {
    render(
      <SectionHeading
        description="What people you trust are loving tonight."
        title="From your circle"
      />,
    )

    expect(
      screen.getByRole('heading', { level: 2, name: 'From your circle' }),
    ).toBeInTheDocument()
  })

})
