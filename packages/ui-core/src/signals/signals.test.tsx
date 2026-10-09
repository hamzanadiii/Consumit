import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Badge, ProgressRail, RatingDisplay, StatusDot } from './signals'

describe('signal components', () => {
  it('exposes progress values to assistive technology', () => {
    render(<ProgressRail label="Episode progress" value={42} />)

    expect(
      screen.getByRole('progressbar', { name: 'Episode progress' }),
    ).toHaveAttribute('aria-valuenow', '42')
  })

  it('announces fractional ratings without relying on star color', () => {
    render(<RatingDisplay showValue value={4.5} />)

    expect(screen.getByRole('img', { name: '4.5 out of 5' })).toHaveTextContent(
      '4.5',
    )
  })

  it('renders compact badges and visually hidden status labels', () => {
    render(
      <>
        <Badge tone="orange">96% match</Badge>
        <StatusDot label="Source healthy" showLabel={false} />
      </>,
    )

    expect(screen.getByText('96% match')).toBeInTheDocument()
    expect(screen.getByText('Source healthy')).toHaveClass('sr-only')
  })
})
