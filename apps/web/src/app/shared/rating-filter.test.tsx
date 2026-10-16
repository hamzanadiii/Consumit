import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders as render } from '@/test/render'
import { RatingFilter } from './rating-filter'
import { matchesRatingFilter, parseRatingRange } from './rating-filter-value'

describe('star rating ranges', () => {
  it('navigates rating choices with arrow keys and selects No rating', async () => {
    const user = userEvent.setup(), onChange = vi.fn()
    render(<RatingFilter onChange={onChange} value="any" />)
    await user.click(screen.getByRole('button', { name: /Filter by your rating/ }))
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('option', { name: 'No rating' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(onChange).toHaveBeenCalledWith('none')
  })
  it('filters inclusive bounds and preserves unrated semantics', () => {
    expect([undefined, 3, 4, 7, 8, 9].filter(score => matchesRatingFilter('4-8', score))).toEqual([4, 7, 8])
    expect(matchesRatingFilter('none', undefined)).toBe(true)
    expect(matchesRatingFilter('none', 1)).toBe(false)
    for (const value of ['0-8', '3-11', '9-3', '3-8junk', '3.5-8']) expect(parseRatingRange(value)).toBeNull()
  })
  it('applies half-star bounds and restores focus, with Escape leaving the filter unchanged', async () => {
    const user = userEvent.setup(), onChange = vi.fn()
    render(<RatingFilter onChange={onChange} value="any" />)
    const trigger = screen.getByRole('button', { name: /Filter by your rating/ })
    await user.click(trigger)
    fireEvent.change(screen.getByRole('slider', { name: 'Minimum rating' }), { target: { value: '5' } })
    fireEvent.change(screen.getByRole('slider', { name: 'Maximum rating' }), { target: { value: '9' } })
    expect(screen.getByText('2.5–4.5 stars')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Apply rating' }))
    expect(onChange).toHaveBeenCalledWith('5-9')
    expect(trigger).toHaveFocus()
    await user.click(trigger)
    await user.keyboard('{Escape}')
    expect(onChange).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
