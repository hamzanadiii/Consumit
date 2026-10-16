import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders as render } from '@/test/render'
import { TitleCollectionFilters } from './title-collection-filters'

describe('collection filter menus', () => {
  it('keeps unavailable ratings disabled and gives keyboard access to valid options', async () => {
    const onRatingChange = vi.fn()
    const user = userEvent.setup()
    render(<TitleCollectionFilters genres={[]} onGenreChange={vi.fn()} onRatingChange={onRatingChange} onSortChange={vi.fn()} rating="none" selectedGenre="all" showRating sort="recent" unavailableRatings="all" />)
    const trigger = screen.getByRole('button', { name: /Filter by your rating/ })
    trigger.focus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('option', { name: 'Any rating' })).toHaveFocus()
    expect(screen.getByRole('option', { name: 'No rating' })).toBeDisabled()
    expect(screen.getByRole('slider', { name: 'Minimum rating' })).toBeDisabled()
    await user.keyboard('{Enter}')
    expect(onRatingChange).toHaveBeenCalledWith('any')
    expect(trigger).toHaveFocus()
  })
  it('keeps rating controls private and preserves sort selection through a themed menu', async () => {
    const onSortChange = vi.fn()
    const user = userEvent.setup()
    render(<TitleCollectionFilters genres={['Drama']} onGenreChange={vi.fn()} onSortChange={onSortChange} selectedGenre="all" sort="recent" />)
    expect(screen.queryByRole('button', { name: /Filter by your rating/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Sort titles/ }))
    await user.click(screen.getByRole('option', { name: 'Title A–Z' }))
    expect(onSortChange).toHaveBeenCalledWith('title')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
