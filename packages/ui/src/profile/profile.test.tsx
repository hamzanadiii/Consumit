import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { DiaryRow } from './profile'

describe('profile components', () => {
  it('renders diary rows with destination and note', () => {
    render(
      <DiaryRow date="26 Aug" href="/atlas" note="Still hurts" title="Atlas Motel" />,
    )

    expect(screen.getByRole('link', { name: 'Atlas Motel' })).toHaveAttribute('href', '/atlas')
    expect(screen.getByRole('link', { name: 'Atlas Motel' })).toHaveClass('min-h-11')
    expect(screen.getByText('“Still hurts”')).toBeInTheDocument()
  })
})
