import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ScrollableTabs } from './scrollable-tabs'

const items = [
  { href: '#one', label: 'Overview', value: 'overview' },
  { href: '#two', label: 'Reviews', value: 'reviews' },
  { href: '#three', label: 'Cast & crew', value: 'cast' },
]

describe('ScrollableTabs', () => {
  it('shows the available scroll direction and updates it as the navigation moves', () => {
    render(<ScrollableTabs activeValue="overview" ariaLabel="Title sections" items={items} />)
    const navigation = screen.getByRole('navigation', { name: 'Title sections' })
    Object.defineProperties(navigation, {
      clientWidth: { configurable: true, value: 100 },
      scrollLeft: { configurable: true, value: 0, writable: true },
      scrollWidth: { configurable: true, value: 240 },
    })

    fireEvent.scroll(navigation)
    expect(navigation.parentElement?.querySelector('[data-consumit-tabs-scroll-cue="right"]')).toBeInTheDocument()
    expect(navigation.parentElement?.querySelector('[data-consumit-tabs-scroll-cue="left"]')).not.toBeInTheDocument()

    navigation.scrollLeft = 140
    fireEvent.scroll(navigation)
    expect(navigation.parentElement?.querySelector('[data-consumit-tabs-scroll-cue="left"]')).toBeInTheDocument()
    expect(navigation.parentElement?.querySelector('[data-consumit-tabs-scroll-cue="right"]')).not.toBeInTheDocument()
  })

  it('does not show scroll cues when every section fits', () => {
    render(<ScrollableTabs activeValue="overview" ariaLabel="Title sections" items={items} />)
    const navigation = screen.getByRole('navigation', { name: 'Title sections' })
    Object.defineProperties(navigation, {
      clientWidth: { configurable: true, value: 240 },
      scrollLeft: { configurable: true, value: 0, writable: true },
      scrollWidth: { configurable: true, value: 240 },
    })

    fireEvent.scroll(navigation)
    expect(navigation.parentElement?.querySelector('[data-consumit-tabs-scroll-cue="left"]')).not.toBeInTheDocument()
    expect(navigation.parentElement?.querySelector('[data-consumit-tabs-scroll-cue="right"]')).not.toBeInTheDocument()
  })
})
