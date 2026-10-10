import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { AdSupportCard } from './ad-support-card'

const DISMISS_KEY = 'consumit.ads.support-card-dismissed'

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  window.localStorage.clear()
})

describe('ad support card', () => {
  it('explains that advertisements pay for Consumit’s servers and data', () => {
    render(<AdSupportCard />)

    expect(screen.getByRole('heading', { name: 'Ads keep Consumit running' })).toBeInTheDocument()
    expect(screen.getByText(/pay for Consumit’s servers, bandwidth, and catalog data/)).toBeInTheDocument()
  })

  it('hides on dismiss and remembers the choice per device', () => {
    const { unmount } = render(<AdSupportCard />)

    fireEvent.click(screen.getByRole('button', { name: 'Hide this message' }))

    expect(screen.queryByRole('heading', { name: 'Ads keep Consumit running' })).not.toBeInTheDocument()
    expect(window.localStorage.getItem(DISMISS_KEY)).toBe('true')

    unmount()
    render(<AdSupportCard />)
    expect(screen.queryByRole('heading', { name: 'Ads keep Consumit running' })).not.toBeInTheDocument()
  })

  it('stays hidden when the card was dismissed on an earlier visit', () => {
    window.localStorage.setItem(DISMISS_KEY, 'true')

    render(<AdSupportCard />)

    expect(screen.queryByRole('heading', { name: 'Ads keep Consumit running' })).not.toBeInTheDocument()
  })
})
