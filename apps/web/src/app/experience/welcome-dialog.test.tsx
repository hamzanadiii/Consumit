import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultExperiencePreferences } from '@consumit/contracts'
import { WelcomeDialog } from './welcome-dialog'

const push = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('./experience-provider', () => ({ useExperience: () => ({ owner: null, ready: true, preferences: defaultExperiencePreferences(), patch: vi.fn().mockResolvedValue(undefined) }) }))

beforeEach(() => {
  localStorage.clear()
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value(this: HTMLDialogElement) { this.setAttribute('open', '') } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value(this: HTMLDialogElement) { this.removeAttribute('open') } })
  Object.defineProperty(navigator, 'share', { configurable: true, value: undefined })
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('Blocked')) } })
})

describe('Consumit welcome and sharing', () => {
  it('offers explicit sharing fallbacks and a selectable link when copying is blocked', async () => {
    render(<WelcomeDialog pathname="/" />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'WhatsApp' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Share Consumit' }))
    expect(screen.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('rel', 'noopener noreferrer')
    fireEvent.click(screen.getByRole('button', { name: 'Copy Consumit link' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Copy is unavailable')
    expect(screen.getByRole('textbox', { name: 'Consumit link to share' })).toHaveAttribute('readonly')
  })
  it('invokes native sharing only from the share action and handles cancellation', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('Cancelled', 'AbortError'))
    Object.defineProperty(navigator, 'share', { configurable: true, value: share })
    render(<WelcomeDialog pathname="/movies" />)
    expect(share).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Share Consumit' }))
    await waitFor(() => expect(share).toHaveBeenCalledOnce())
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
  it('keeps support messages out of the welcome and respects saved dismissal', () => {
    const view = render(<WelcomeDialog pathname="/" />)
    expect(screen.queryByText('Ads are your choice')).not.toBeInTheDocument()
    expect(screen.queryByText('Make Consumit better')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Start exploring' }))
    expect(localStorage.getItem('consumit.share-welcome-dismissed.v1')).toBe('true')
    view.unmount()
    render(<WelcomeDialog pathname="/" />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('shows a separate notification after the welcome closes', async () => {
    render(<WelcomeDialog pathname="/" />)
    fireEvent.click(screen.getByRole('button', { name: 'Start exploring' }))
    expect(await screen.findByRole('link', { name: 'Ad settings' }, { timeout: 2500 })).toHaveAttribute('href', '/settings')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('never interrupts Watch', () => {
    render(<WelcomeDialog pathname="/watch/anime/16498" />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
