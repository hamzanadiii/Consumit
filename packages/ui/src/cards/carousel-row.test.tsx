import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { CarouselRow } from './carousel-row'

describe('CarouselRow', () => {
  it('renders carousel content and navigation controls', () => {
    const { container } = render(
      <CarouselRow title="Featured Movies">
        <div data-testid="item-1">Movie 1</div>
        <div data-testid="item-2">Movie 2</div>
      </CarouselRow>,
    )

    expect(screen.getByText('Featured Movies')).toBeInTheDocument()
    expect(screen.getByTestId('item-1')).toBeInTheDocument()
    expect(screen.getByTestId('item-2')).toBeInTheDocument()
    expect(container.querySelector('[data-consumit-carousel-row]')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Scroll carousel left' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Scroll carousel right' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Scroll carousel left' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Scroll carousel right' })).toBeDisabled()
  })

  it('scrolls forward when clicking the next button', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <CarouselRow>
        <div>Item 1</div>
        <div>Item 2</div>
      </CarouselRow>,
    )

    const scroller = container.querySelector('[data-consumit-carousel-scroller]') as HTMLElement
    expect(scroller).toBeInTheDocument()
    const scrollBySpy = vi.fn()
    scroller.scrollBy = scrollBySpy
    Object.defineProperties(scroller, { clientWidth: { value: 600 }, scrollWidth: { value: 1200 } })
    fireEvent.scroll(scroller)

    const nextButton = screen.getByRole('button', { name: 'Scroll carousel right' })
    await user.click(nextButton)

    expect(scrollBySpy).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }))
  })
})
