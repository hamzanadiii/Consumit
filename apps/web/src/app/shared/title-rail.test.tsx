import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { movieSummary } from '@/test/catalog-fixtures'

import { TitleRail } from './title-rail'

const second = { ...movieSummary, id: 2, title: 'Arrival' }

afterEach(() => vi.unstubAllGlobals())

describe('title rail scrolling', () => {
  it('shows only movable controls and respects reduced motion', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
    render(<TitleRail id="next-watch" items={[movieSummary, second]} title="For your next watch" />)

    const rail = screen.getByRole('list', { name: 'For your next watch titles' })
    Object.defineProperties(rail, {
      clientWidth: { configurable: true, value: 300 },
      scrollWidth: { configurable: true, value: 660 },
      scrollLeft: { configurable: true, writable: true, value: 0 },
    })
    const scrollBy = vi.fn(({ left }: ScrollToOptions) => {
      rail.scrollLeft = left && left > 0 ? 360 : 0
      fireEvent.scroll(rail)
    })
    Object.defineProperty(rail, 'scrollBy', { configurable: true, value: scrollBy })
    fireEvent(window, new Event('resize'))

    const left = screen.queryByRole('button', { name: 'Scroll For your next watch left' })
    const right = screen.getByRole('button', { name: 'Scroll For your next watch right' })
    expect(left).not.toBeInTheDocument()
    await user.click(right)
    expect(scrollBy).toHaveBeenCalledWith({ left: 225, behavior: 'instant' })
    expect(screen.getByRole('button', { name: 'Scroll For your next watch left' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Scroll For your next watch right' })).not.toBeInTheDocument()
  })
})
