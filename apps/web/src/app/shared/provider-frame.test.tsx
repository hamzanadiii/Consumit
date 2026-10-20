import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProviderFrame } from './provider-frame'

afterEach(() => vi.useRealTimers())

describe('ProviderFrame recovery', () => {
  it('invalidates the old frame window on reload and never changes loaded state from a report', () => {
    const onDiagnostic = vi.fn()
    render(<ProviderFrame src="https://embed.vidrift.net/embed/movie/550" title="VidRift" diagnosticSource={{ providerId: 'vidriftframe', ref: { kind: 'movie', id: 550 } }} onDiagnostic={onDiagnostic} />)
    const oldFrame = screen.getByTitle('VidRift external player') as HTMLIFrameElement
    const source = oldFrame.contentWindow
    const dispatch = (source: Window | null) => window.dispatchEvent(new MessageEvent('message', { origin: 'https://embed.vidrift.net', source, data: { type: 'vidrift:unpaused', tmdbId: 550, mediaType: 'movie', currentTime: 0 } }))
    act(() => { dispatch(source) })
    expect(onDiagnostic).toHaveBeenCalledExactlyOnceWith({ type: 'playing' })
    expect(screen.getByRole('status')).toHaveTextContent('Loading external player')
    fireEvent.click(screen.getByRole('button', { name: 'Reload player' }))
    act(() => { dispatch(source) })
    expect(onDiagnostic).toHaveBeenCalledOnce()
    act(() => { dispatch((screen.getByTitle('VidRift external player') as HTMLIFrameElement).contentWindow) })
    expect(onDiagnostic).toHaveBeenCalledTimes(2)
  })
  it('retains a policy-blocked failure even when the browser emits load', () => {
    render(<ProviderFrame src="https://vixsrc.to/movie/550" title="External player" />)
    const violation = new Event('securitypolicyviolation')
    Object.assign(violation, { effectiveDirective: 'frame-src', blockedURI: 'https://vixsrc.to' })
    act(() => { document.dispatchEvent(violation) })
    fireEvent.load(screen.getByTitle('External player external player'))
    expect(screen.getByRole('status')).toHaveTextContent('hasn’t loaded')
  })
  it('offers reload and another server when the document does not load', () => {
    vi.useFakeTimers()
    const fallback = vi.fn()
    render(<ProviderFrame src="https://apiplayer.ru/embed/movie/550" title="External player" onFallback={fallback} />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading external player')
    act(() => vi.advanceTimersByTime(20_000))
    expect(screen.getByRole('status')).toHaveTextContent('hasn’t loaded')
    fireEvent.click(screen.getByRole('button', { name: 'Try another server' }))
    expect(fallback).toHaveBeenCalledOnce()
    const oldFrame = screen.getByTitle('External player external player')
    fireEvent.click(screen.getByRole('button', { name: 'Reload player' }))
    expect(screen.getByTitle('External player external player')).not.toBe(oldFrame)
    expect(screen.getByRole('status')).toHaveTextContent('Loading external player')
  })

  it('never equates a loaded frame with playing video', () => {
    render(<ProviderFrame src="https://flixcloud.cc/e/example?v=1" title="External player" audioLanguage="en" />)
    const frame = screen.getByTitle('External player external player')
    fireEvent.load(frame)
    expect(screen.getByRole('status')).toHaveTextContent('Choose English audio inside')
    expect(screen.getByText('Progress sync unavailable')).toBeInTheDocument()
    expect(screen.getByText('Automatic next episode unavailable')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open player in new tab' })).toHaveAttribute('rel', 'noopener noreferrer')
    expect(frame).not.toHaveAttribute('sandbox')
  })

  it('keeps the plain iframe and playback permissions when reloading a provider', () => {
    render(<ProviderFrame src="https://megaplay.buzz/videojs/stream/s-2/2142/sub" title="External player" />)
    const frame = screen.getByTitle('External player external player')
    expect(frame).not.toHaveAttribute('sandbox')
    expect(frame).toHaveAttribute('allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture')
    fireEvent.click(screen.getByRole('button', { name: 'Reload player' }))
    expect(screen.getByTitle('External player external player')).not.toHaveAttribute('sandbox')
    expect(screen.getByRole('link', { name: 'Open player in new tab' })).toHaveAttribute('rel', 'noopener noreferrer')
  })
})

it('keeps a provider frame mounted when choosing sources or episodes and restores focus', () => {
  render(<ProviderFrame src="https://embed.vidrift.net/embed/movie/550" title="Movie" backHref="/movie/550" serverControl={<button>Consumit Server</button>} episodePanel={<button>Episode 2</button>} />)
  const frame = screen.getByTitle('Movie external player')
  const trigger = screen.getByRole('button', { name: 'Sources' })
  fireEvent.click(trigger)
  expect(screen.getByRole('dialog', { name: 'Sources' })).toBeInTheDocument()
  fireEvent.keyDown(screen.getByRole('button', { name: 'Close sources' }), { key: 'Escape' })
  expect(trigger).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'Episodes' }))
  expect(screen.getByRole('dialog', { name: 'Episodes' })).toHaveTextContent('Episode 2')
  expect(screen.getByTitle('Movie external player')).toBe(frame)
  expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/movie/550')
})
