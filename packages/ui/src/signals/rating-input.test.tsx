import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { RatingInput } from './rating-input'

describe('rating input', () => {
  it('renders five star glyphs covering ten points through an accessible radio group', () => {
    const onChange = vi.fn()
    const { container } = render(<RatingInput label="Your rating" name="rating" onChange={onChange} value={7} />)

    expect(screen.getByRole('radiogroup', { name: 'Your rating' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Rate 7 out of 10' })).toBeChecked()
    expect(screen.getAllByRole('radio')).toHaveLength(10)
    expect(container.querySelectorAll('[data-consumit-rating-input] [role="presentation"]')).toHaveLength(5)

    fireEvent.click(screen.getByRole('radio', { name: 'Rate 9 out of 10' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(9)
  })

  it('clears the rating when the set value is clicked again', () => {
    const onChange = vi.fn()
    render(<RatingInput label="Your rating" name="rating" onChange={onChange} value={8} />)

    fireEvent.click(screen.getByRole('radio', { name: 'Rate 8 out of 10' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('previews the hovered value and pops the hovered star', async () => {
    const user = userEvent.setup()
    const { container } = render(<RatingInput label="Your rating" name="rating" value={null} />)
    const overlays = () => [...container.querySelectorAll('[data-consumit-rating-input] span[style]')]
      .map((element) => (element as HTMLElement).style.width)

    expect(overlays()).toEqual(['0%', '0%', '0%', '0%', '0%'])

    const target = screen.getByRole('radio', { name: 'Rate 7 out of 10' }).closest('label')
    if (!target) throw new Error('Expected a half-star label.')
    await user.hover(target)
    expect(overlays()).toEqual(['100%', '100%', '100%', '50%', '0%'])
    expect(target.closest('[role="presentation"]')?.className).toMatch(/scale-110/)

    await user.unhover(target)
    expect(overlays()).toEqual(['0%', '0%', '0%', '0%', '0%'])
  })
})
