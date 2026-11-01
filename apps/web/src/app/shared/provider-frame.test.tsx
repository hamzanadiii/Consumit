import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProviderFrame } from './provider-frame'

afterEach(() => vi.useRealTimers())

describe('ProviderFrame recovery', () => {
  it('invalidates the old frame window on reload and never changes loaded state from a report', () => {
    const onDiagnostic = vi.fn()
    render(<ProviderFrame src="https://embed.vidrift.net/embed/movie/550" title="VidRift" diagnosticSource={{ providerId: 'vidriftframe', ref: { kind: 'movie', id: 550 } }} onDiagnostic={onDiagnostic} />)
    const oldFrame = screen.getByTitle('VidRift provider player') as HTMLIFrameElement
    const source = oldFrame.contentWindow
    const dispatch = (source: Window | null) => window.dispatchEvent(new MessageEvent('message', { origin: 'https://embed.vidrift.net', source, data: { type: 'vidrift:unpaused', tmdbId: 550, mediaType: 'movie', currentTime: 0 } }))
    act(() => { dispatch(source) })
    expect(onDiagnostic).toHaveBeenCalledExactlyOnceWith({ type: 'playing' })
    expect(screen.getByRole('status')).toHaveTextContent('Connecting to provider player')
    fireEvent.click(screen.getByRole('button', { name: 'Reload player' }))
    act(() => { dispatch(source) })
    expect(onDiagnostic).toHaveBeenCalledOnce()
    act(() => { dispatch((screen.getByTitle('VidRift provider player') as HTMLIFrameElement).contentWindow) })
    expect(onDiagnostic).toHaveBeenCalledTimes(2)
  })
  it('retains a policy-blocked failure even when the browser emits load', () => {
    const onFrameFailure = vi.fn()
    render(<ProviderFrame src="https://vixsrc.to/movie/550" title="External player" onFrameFailure={onFrameFailure} />)
    const violation = new Event('securitypolicyviolation')
    Object.assign(violation, { effectiveDirective: 'frame-src', blockedURI: 'https://vixsrc.to' })
    act(() => { document.dispatchEvent(violation) })
    fireEvent.load(screen.getByTitle('External player provider player'))
    expect(screen.getByRole('alertdialog', { name: 'This player couldn’t load' })).toBeInTheDocument()
    expect(onFrameFailure).toHaveBeenCalledOnce()
  })
  it('enters automatic recovery after the 20-second no-load timeout', () => {
    vi.useFakeTimers()
    const fallback = vi.fn()
    const onFrameFailure = vi.fn()
    render(<ProviderFrame src="https://apiplayer.ru/embed/movie/550" title="External player" serverControl={<button>Configured source</button>} onFallback={fallback} onFrameFailure={onFrameFailure} />)
    expect(screen.getByRole('status')).toHaveTextContent('Connecting to provider player')
    act(() => vi.advanceTimersByTime(20_000))
    expect(screen.getByRole('alertdialog', { name: 'This player couldn’t load' })).toBeInTheDocument()
    expect(onFrameFailure).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Try again with Auto' }))
    expect(fallback).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Sources' }))
    fireEvent.click(screen.getByRole('button', { name: 'Try another server' }))
    expect(fallback).toHaveBeenCalledTimes(2)
    const oldFrame = screen.getByTitle('External player provider player')
    fireEvent.click(screen.getByRole('button', { name: 'Reload player' }))
    expect(screen.getByTitle('External player provider player')).not.toBe(oldFrame)
    expect(screen.getByRole('status')).toHaveTextContent('Connecting to provider player')
  })

  it('never equates a loaded frame with playing video', () => {
    render(<ProviderFrame src="https://flixcloud.cc/e/example?v=1" title="External player" audioLanguage="en" />)
    const frame = screen.getByTitle('External player provider player')
    fireEvent.load(frame)
    expect(screen.getByRole('status')).toHaveTextContent('Player frame loaded. Choose English audio inside')
    expect(screen.getByRole('status')).not.toHaveTextContent(/playing/i)
    expect(screen.getByText('Progress sync unavailable')).toBeInTheDocument()
    expect(screen.getByText('Choose next episode manually')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open player in new tab' })).toHaveAttribute('rel', 'noopener noreferrer')
    expect(frame).not.toHaveAttribute('sandbox')
  })

  it('keeps provider recovery inside Consumit Watch with title, sources and capability context', () => {
    const retry = vi.fn()
    render(<ProviderFrame
      src="https://embed.vidrift.net/embed/movie/550"
      title="The Last City After Rain"
      providerName="VidRift"
      backHref="/movie/550"
      serverControl={<button>Consumit Server</button>}
      recovery={{ phase: 'failed', kind: 'external', message: 'The provider player didn’t load.' }}
      onRetryAuto={retry}
    />)

    const frame = screen.getByTitle('The Last City After Rain provider player')
    expect(screen.getByText('Consumit Watch')).toBeInTheDocument()
    expect(screen.getAllByText('Playback by VidRift')).toHaveLength(2)
    expect(screen.getByRole('alertdialog', { name: 'This player couldn’t load' })).toBeInTheDocument()
    expect(screen.getByText('Progress sync unavailable')).toBeInTheDocument()
    expect(screen.getByText('Choose next episode manually')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Choose a source' }))
    expect(screen.getByRole('dialog', { name: 'Sources' })).toHaveTextContent('Consumit Server')
    expect(screen.getByTitle('The Last City After Rain provider player')).toBe(frame)
  })

  it('cancels automatic recovery before opening provider source choices', () => {
    const cancel = vi.fn()
    render(<ProviderFrame
      src="about:blank"
      title="The Last City After Rain"
      serverControl={<button>Consumit Server</button>}
      recovery={{ phase: 'searching', kind: 'external', progress: { checked: 2, total: 6 } }}
      recoveryControlled
      onRecoveryCancel={cancel}
    />)

    fireEvent.click(screen.getByRole('button', { name: 'Choose a source' }))
    expect(cancel).toHaveBeenCalledOnce()
    expect(screen.getByRole('dialog', { name: 'Sources' })).toHaveTextContent('Consumit Server')
  })

  it('keeps the plain iframe and playback permissions when reloading a provider', () => {
    render(<ProviderFrame src="https://megaplay.buzz/videojs/stream/s-2/2142/sub" title="External player" />)
    const frame = screen.getByTitle('External player provider player')
    expect(frame).not.toHaveAttribute('sandbox')
    expect(frame).toHaveAttribute('allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture')
    fireEvent.click(screen.getByRole('button', { name: 'Reload player' }))
    expect(screen.getByTitle('External player provider player')).not.toHaveAttribute('sandbox')
    expect(screen.getByRole('link', { name: 'Open player in new tab' })).toHaveAttribute('rel', 'noopener noreferrer')
  })
})

it('keeps a provider frame mounted when choosing sources or episodes and restores focus', () => {
  render(<ProviderFrame src="https://embed.vidrift.net/embed/movie/550" title="Movie" backHref="/movie/550" serverControl={<button>Consumit Server</button>} episodePanel={<button>Episode 2</button>} />)
  const frame = screen.getByTitle('Movie provider player')
  const trigger = screen.getByRole('button', { name: 'Sources' })
  fireEvent.click(trigger)
  expect(screen.getByRole('dialog', { name: 'Sources' })).toBeInTheDocument()
  fireEvent.keyDown(screen.getByRole('button', { name: 'Close sources' }), { key: 'Escape' })
  expect(trigger).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'Episodes' }))
  expect(screen.getByRole('dialog', { name: 'Episodes' })).toHaveTextContent('Episode 2')
  expect(screen.getByTitle('Movie provider player')).toBe(frame)
  expect(screen.getByRole('link', { name: 'Back to title' })).toHaveAttribute('href', '/movie/550')
})
