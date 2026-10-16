import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowsingNotifications } from './browsing-notifications'

const advance = () => act(() => { vi.advanceTimersByTime(1500) })
beforeEach(() => { localStorage.clear(); vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('Browsing notifications', () => {
  it('shows one nonmodal notice at a time, with persistent dismissals', () => {
    const view = render(<BrowsingNotifications enabled />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    advance()
    expect(screen.getByRole('link', { name: 'Ad settings' })).toHaveAttribute('href', '/settings')
    expect(screen.queryByText('Make Consumit better')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss Ads are your choice' }))
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    advance()
    expect(screen.getByRole('link', { name: 'Send feedback' })).toHaveAttribute('href', '/report-issue')
    fireEvent.click(screen.getByRole('link', { name: 'Send feedback' }))
    view.unmount()
    render(<BrowsingNotifications enabled />)
    advance()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
  it('cancels delayed messages while browsing is ineligible', () => {
    const view = render(<BrowsingNotifications enabled />)
    view.rerender(<BrowsingNotifications enabled={false} />)
    advance()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    view.rerender(<BrowsingNotifications enabled />)
    advance()
    expect(screen.getByText('Ads are your choice')).toBeInTheDocument()
  })
  it('accepts dismissals from another tab', () => {
    render(<BrowsingNotifications enabled />)
    advance()
    act(() => {
      localStorage.setItem('consumit.browsing-notice.ads.dismissed.v1', 'true')
      window.dispatchEvent(new StorageEvent('storage', { key: 'consumit.browsing-notice.ads.dismissed.v1' }))
    })
    expect(screen.queryByText('Ads are your choice')).not.toBeInTheDocument()
    advance()
    expect(screen.getByText('Make Consumit better')).toBeInTheDocument()
  })
  it('keeps dismissal usable when device storage fails', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Blocked') })
    render(<BrowsingNotifications enabled />)
    advance()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss Ads are your choice' }))
    advance()
    expect(screen.getByText('Make Consumit better')).toBeInTheDocument()
    vi.restoreAllMocks()
  })
})
