import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProviderFrame } from './provider-frame'

afterEach(() => vi.useRealTimers())

describe('ProviderFrame recovery', () => {
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
    expect(screen.getByRole('status')).toHaveTextContent('Progress sync is unavailable')
    expect(screen.getByRole('link', { name: 'Open player in new tab' })).toHaveAttribute('rel', 'noopener noreferrer')
    expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-presentation')
  })

  it('frames a player that refuses a sandbox as a plain iframe', () => {
    render(<ProviderFrame src="https://megaplay.buzz/videojs/stream/s-2/2142/sub" title="External player" frameSandbox="none" />)
    const frame = screen.getByTitle('External player external player')
    expect(frame).not.toHaveAttribute('sandbox')
    expect(frame).toHaveAttribute('allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture')
    expect(screen.getByRole('link', { name: 'Open player in new tab' })).toHaveAttribute('rel', 'noopener noreferrer')
  })
})
