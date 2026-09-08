import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ConsumitPlayer } from './consumit-player'
import { PlaybackReport, PlaybackTrustNote, SourceSelector, WatchHeader } from './playback'

const chapters = [
  { startTime: 0, title: 'The missing street' },
  { startTime: 3600, title: 'What the river kept' },
]

function prototypePlayer() {
  return render(
    <ConsumitPlayer
      backHref="/title/693134"
      caption="Some places disappear long before anyone leaves them."
      chapters={chapters}
      posterSrc="/poster.jpg"
      src="/movie.mp4"
      title="The Last City After Rain"
      topMeta="Playing from Consumit · 4K"
    />,
  )
}

function setClock(video: HTMLVideoElement, currentTime: number, duration: number) {
  Object.defineProperty(video, 'currentTime', { configurable: true, value: currentTime })
  Object.defineProperty(video, 'duration', { configurable: true, value: duration })
}

describe('playback shell components', () => {
  it('renders reduced watch navigation', () => {
    const { container } = render(<WatchHeader backHref="/title" exitHref="/title" title="The Last City After Rain" />)

    expect(screen.getByRole('link', { name: 'Consumit home' })).toBeInTheDocument()
    expect(container.querySelector('img')).toHaveAttribute('src', '/assets/consumit-mark.svg')
    expect(screen.getByRole('link', { name: 'Back to title' })).toHaveAttribute('href', '/title')
    expect(screen.getByRole('link', { name: 'Exit watch' })).toBeInTheDocument()
  })

  it('renders direct native playback without an iframe', () => {
    const { container } = render(
      <ConsumitPlayer posterSrc="/poster.jpg" src="/movie.mp4" title="Sea of Names" />,
    )

    expect(container.querySelector('video')).toHaveAttribute('src', '/movie.mp4')
    expect(container.querySelector('iframe')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Playback position' })).toBeInTheDocument()
  })

  it('keeps the replacement media attached when a source changes', async () => {
    const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined)
    const first = { src: 'https://cdn.consumit.example/first.mp4', type: 'native' as const }
    const second = { src: 'https://cdn.consumit.example/second.mp4', type: 'native' as const }
    const { container, rerender } = render(
      <ConsumitPlayer source={first} title="Sea of Names" />,
    )
    const video = container.querySelector('video')!
    await waitFor(() => expect(video.src).toBe(first.src))
    await act(async () => { await Promise.resolve() })

    await act(async () => {
      rerender(<ConsumitPlayer source={second} title="Sea of Names" />)
      await Promise.resolve()
    })

    await waitFor(() => expect(video.src).toBe(second.src))
    load.mockRestore()
  })

  it('synchronizes a finite media duration even when metadata is ready before hydration', () => {
    const { container } = render(
      <ConsumitPlayer posterSrc="/poster.jpg" src="/movie.mp4" title="Sea of Names" />,
    )
    const video = container.querySelector('video')!
    Object.defineProperty(video, 'duration', { configurable: true, value: 125 })
    Object.defineProperty(video, 'currentTime', { configurable: true, value: 61 })

    fireEvent.durationChange(video)
    fireEvent.timeUpdate(video)

    expect(screen.getByText('1:01 / 2:05')).toBeInTheDocument()
  })

  it('does not present an unavailable source as healthy', () => {
    const { container } = render(
      <ConsumitPlayer status="No authorized source available" statusTone="unavailable" title="Sea of Names" />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('No authorized source available')
    expect(container.querySelector('[role="status"] span')).toHaveClass('bg-danger')
    expect(container.querySelector('[role="status"] span')).not.toHaveClass('bg-lime')
  })

  it('keeps source selection native and controlled', () => {
    const onValueChange = vi.fn()
    render(<SourceSelector name="source" onValueChange={onValueChange} sources={[{ label: 'Source 1', value: 'one' }, { label: 'Source 2', value: 'two' }]} value="one" />)

    const secondSource = screen.getByRole('radio', { name: /Source 2/ })
    expect(secondSource.closest('label')).toHaveClass('has-[:focus-visible]:ring-2')
    fireEvent.click(secondSource)
    expect(onValueChange).toHaveBeenCalledWith('two')
  })

  it('renders recovery and safety language', () => {
    render(
      <>
        <PlaybackReport description="Try another source." href="/report" />
        <PlaybackTrustNote>Never install a player extension.</PlaybackTrustNote>
      </>,
    )

    expect(screen.getByRole('link', { name: /Report an issue/ })).toHaveAttribute('href', '/report')
    expect(screen.getByText('Never install a player extension.')).toBeInTheDocument()
  })

  it('renders the prototype chrome with chapters, transport, and option menus', () => {
    const { container } = prototypePlayer()
    const video = container.querySelector('video')!
    setClock(video, 2538, 7680)
    fireEvent.durationChange(video)
    fireEvent.timeUpdate(video)

    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/title/693134')
    expect(screen.getByText('The Last City After Rain')).toBeInTheDocument()
    expect(screen.getByText('Playing from Consumit · 4K')).toBeInTheDocument()
    expect(screen.getByText('Chapter 1 · The missing street')).toBeInTheDocument()
    expect(screen.getByText('42:18 / 2:08:00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back 10 seconds' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Forward 10 seconds' })).toBeEnabled()
    expect(screen.getByRole('slider', { name: 'Volume' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Subtitles on. Change subtitles' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Audio tracks' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Display, quality, and speed' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enter picture in picture' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enter fullscreen' })).toBeInTheDocument()
    expect(screen.getByText('Some places disappear long before anyone leaves them.')).toBeInTheDocument()
    expect(screen.getByText('Subtitles')).toBeInTheDocument()
  })

  it('opens the subtitles menu and switches captions off', () => {
    prototypePlayer()

    fireEvent.click(screen.getByRole('button', { name: 'Subtitles on. Change subtitles' }))
    const menu = screen.getByRole('menu', { name: 'subtitles options' })
    fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'Off' }))

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Subtitles off. Change subtitles' })).toBeInTheDocument()
    expect(screen.queryByText('Some places disappear long before anyone leaves them.')).not.toBeInTheDocument()
  })

  it('opens the display menu with quality, speed, and brightness controls', () => {
    prototypePlayer()

    fireEvent.click(screen.getByRole('button', { name: 'Display, quality, and speed' }))
    const menu = screen.getByRole('menu', { name: 'display options' })
    expect(within(menu).getByRole('menuitemradio', { name: /Auto/ })).toHaveAttribute('aria-checked', 'true')
    expect(within(menu).getByRole('button', { name: '1×' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(menu).getByRole('slider', { name: 'Brightness' })).toBeInTheDocument()
  })

  it('toggles mute from the keyboard without a playable engine', () => {
    const { container } = prototypePlayer()
    const region = container.querySelector('[role="region"]')!

    expect(screen.getByRole('button', { name: 'Mute' })).toBeInTheDocument()
    fireEvent.keyDown(region, { key: 'm' })
    expect(screen.getByRole('button', { name: 'Unmute' })).toBeInTheDocument()
  })

  it('announces buffering and recovers through the error panel', () => {
    const { container } = render(
      <ConsumitPlayer posterSrc="/poster.jpg" src="/movie.mp4" title="Sea of Names" />,
    )
    const video = container.querySelector('video')!

    fireEvent.waiting(video)
    expect(screen.getByText('Buffering video')).toBeInTheDocument()

    fireEvent.playing(video)
    expect(screen.queryByText('Buffering video')).not.toBeInTheDocument()

    fireEvent.error(video)
    expect(screen.getByRole('alert')).toHaveTextContent('Playback failed')
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('keeps transport disabled when no authorized source exists', () => {
    render(<ConsumitPlayer title="Sea of Names" />)

    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Back 10 seconds' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Forward 10 seconds' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^(Mute|Unmute)$/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Enter fullscreen' })).toBeDisabled()
  })
})
