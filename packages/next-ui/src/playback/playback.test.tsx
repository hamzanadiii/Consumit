import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'

import { ConsumitPlayer } from './consumit-player'
import { WatchHeader } from './playback'

const chapters = [
  { startTime: 0, title: 'The missing street' },
  { startTime: 3600, title: 'What the river kept' },
]

it('keeps focused transport controls visible across playback start and pointer movement', () => {
  vi.useFakeTimers()
  try {
    const view = render(<ConsumitPlayer title="Focus fixture" src="/fixture.mp4" autoHideMs={100} />)
    const play = screen.getByRole('button', { name: 'Play' })
    act(() => play.focus())
    fireEvent.play(view.container.querySelector('video')!)
    fireEvent.mouseMove(screen.getByLabelText('Focus fixture player controls'))
    act(() => vi.advanceTimersByTime(150))
    expect(screen.getByRole('button', { name: 'Pause' })).toHaveFocus()
    expect(view.container.querySelector('[data-consumit-player]')).toHaveAttribute('data-controls-visible', 'true')
    act(() => play.blur())
    act(() => vi.advanceTimersByTime(150))
    expect(view.container.querySelector('[data-consumit-player]')).toHaveAttribute('data-controls-visible', 'false')
  } finally { vi.useRealTimers() }
})

it('opens Auto server selection from Settings, shows the playing server, and restores focus', () => {
  const request = vi.fn(), auto = vi.fn(), change = vi.fn()
  render(<ConsumitPlayer title="Fixture" src="/fixture.mp4" serverOptions={[{ value: 'primary', label: 'Primary' }, { value: 'backup', label: 'Backup' }]} selectedServer="primary" serverAuto onServerAuto={auto} onServerRequest={request} onServerChange={change} />)
  expect(screen.queryByRole('button', { name: 'Change server' })).not.toBeInTheDocument()
  const trigger = screen.getByRole('button', { name: /Settings:/ })
  trigger.focus(); fireEvent.click(trigger)
  fireEvent.click(screen.getByRole('button', { name: /^Server/ }))
  const panel = screen.getByRole('menu', { name: 'Server' })
  expect(request).toHaveBeenCalledTimes(1)
  expect(within(panel).getByRole('menuitemradio', { name: /Auto/ })).toHaveAttribute('aria-checked', 'true')
  expect(within(panel).getByRole('menuitemradio', { name: 'Primary' })).toHaveAttribute('aria-checked', 'false')
  expect(within(panel).getByText('Playing from Primary')).toBeInTheDocument()
  fireEvent.click(within(panel).getByRole('menuitemradio', { name: 'Backup' }))
  expect(change).toHaveBeenCalledWith('backup')
  expect(trigger).toHaveFocus()
  fireEvent.click(trigger); fireEvent.click(screen.getByRole('button', { name: /^Server/ }))
  fireEvent.click(screen.getByRole('menuitemradio', { name: /Auto/ }))
  expect(auto).toHaveBeenCalledTimes(1)
  expect(change).toHaveBeenCalledTimes(1)
})

it('keeps server loading, retry, empty and switching states inside the existing panel', () => {
  const request = vi.fn(), auto = vi.fn()
  const props = { title: 'Fixture', src: '/fixture.mp4', serverOptions: [{ value: 'primary', label: 'Primary' }], selectedServer: 'primary', serverAuto: true, onServerAuto: auto, onServerRequest: request }
  const view = render(<ConsumitPlayer {...props} serverLoading />)
  fireEvent.click(screen.getByRole('button', { name: /Settings:/ })); fireEvent.click(screen.getByRole('button', { name: /^Server/ }))
  expect(screen.getByText('Finding servers…')).toBeInTheDocument()
  expect(screen.queryByText('No other servers are available for this title.')).not.toBeInTheDocument()
  view.rerender(<ConsumitPlayer {...props} serverError="Servers are unavailable right now. Playback can continue." />)
  fireEvent.click(within(screen.getByRole('menu', { name: 'Server' })).getByRole('button', { name: 'Try again' }))
  expect(request).toHaveBeenCalledTimes(2)
  view.rerender(<ConsumitPlayer {...props} />)
  expect(screen.getByText('No other servers are available for this title.')).toBeInTheDocument()
  view.rerender(<ConsumitPlayer {...props} serverBusy />)
  expect(screen.getByRole('menuitemradio', { name: /Auto/ })).toBeDisabled()
  expect(screen.getByRole('menuitemradio', { name: 'Primary' })).toBeDisabled()
  expect(screen.getByText('Switching server…')).toBeInTheDocument()
})

it('shows fixed source qualities in one player and delegates their selection to its owner', () => {
  const change = vi.fn()
  render(<ConsumitPlayer title="Miami" src="/fixture.mp4" qualityOptions={[2160, 1080, 720, 480].map(height => ({ value: String(height), label: `${height}p` }))} selectedQuality="1080" onQualityChange={change} />)
  fireEvent.click(screen.getByRole('button', { name: /Settings:/ }))
  fireEvent.click(screen.getByRole('button', { name: /Quality/ }))
  const panel = screen.getByRole('menu', { name: 'Quality' })
  expect(within(panel).getAllByRole('menuitemradio').map(row => row.textContent)).toEqual(['2160p', '1080p', '720p', '480p'])
  fireEvent.click(within(panel).getByRole('menuitemradio', { name: '720p' }))
  expect(change).toHaveBeenCalledWith('720')
})

it('merges stream and separate languages without provider labels and retains video after failed preparation', async () => {
  const request = vi.fn(), select = vi.fn().mockRejectedValue(new Error('Unavailable')), change = vi.fn()
  const { container } = render(<ConsumitPlayer title="Lanterns" src="/episode.mp4" audioOptions={[{ value: 'main-en', label: '1. English', language: 'eng' }, { value: 'duplicate-en', label: '2. English', language: 'en' }]} selectedAudio="main-en" onAudioChange={change} onAudioRequest={request} onSeparateAudioSelect={select} separateAudioTracks={[{ id: 'en', label: '3. English', language: 'en', provider: 'Apogee' }, { id: 'hi', label: '4. Hindi', language: 'hi', provider: 'Apogee' }, { id: 'hi-duplicate', label: 'Hindi', language: 'hin', provider: 'Another provider' }]} />)
  const video = container.querySelector('video')!
  fireEvent.click(screen.getByRole('button', { name: /Settings:/ }))
  fireEvent.click(screen.getByRole('button', { name: /Audio/ }))
  expect(request).toHaveBeenCalledOnce()
  const panel = screen.getByRole('menu', { name: 'Audio' })
  expect(within(panel).getAllByRole('menuitemradio').map(row => row.textContent)).toEqual(['English', 'Hindi'])
  expect(within(panel).queryByText(/Apogee|Another provider|Added audio/)).not.toBeInTheDocument()
  expect(within(panel).getByRole('menuitemradio', { name: 'English' })).toHaveAttribute('aria-checked', 'true')
  fireEvent.click(within(panel).getByRole('menuitemradio', { name: 'Hindi' }))
  await waitFor(() => expect(screen.getByText(/Your current audio is still playing/)).toBeVisible())
  expect(select).toHaveBeenCalledWith('hi')
  expect(container.querySelector('video')).toBe(video)
  expect(video.getAttribute('src')).toBe('/episode.mp4')
  fireEvent.click(within(panel).getByRole('menuitemradio', { name: 'English' }))
  expect(change).toHaveBeenCalledWith('main-en')
  expect(select).toHaveBeenCalledOnce()
})

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
  Object.defineProperty(video, 'currentTime', { configurable: true, writable: true, value: currentTime })
  Object.defineProperty(video, 'duration', { configurable: true, value: duration })
}

describe('playback shell components', () => {
  it('uses catalog title artwork during preparation and keeps episode metadata separate', () => {
    const { container, rerender } = render(<ConsumitPlayer preparing title="Takopi's Original Sin · To You in 2016" preparationMeta="E1 — To You in 2016" pauseLogoUrl="/takopi-logo.png" />)
    const preparation = container.querySelector('[data-player-preparation]')!
    expect(preparation.querySelector('img')).toHaveAttribute('src', '/takopi-logo.png')
    expect(preparation).toHaveTextContent("Takopi's Original Sin · To You in 2016")
    expect(preparation).toHaveTextContent('E1 — To You in 2016')
    expect(preparation.querySelector('.consumit-player-preparation-title')).not.toBeInTheDocument()
    rerender(<ConsumitPlayer autoPlay src="/episode.mp4" title="Takopi's Original Sin · To You in 2016" preparationMeta="E1 — To You in 2016" pauseLogoUrl="/takopi-logo.png" />)
    fireEvent.waiting(container.querySelector('video')!)
    expect(container.querySelector('[data-player-preparation] img')).toHaveAttribute('src', '/takopi-logo.png')
    fireEvent.playing(container.querySelector('video')!)
    expect(container.querySelector('[data-player-preparation]')).not.toBeInTheDocument()
  })

  it('falls back to readable preparation text for missing or broken artwork and accepts a replacement logo', () => {
    const { container, rerender } = render(<ConsumitPlayer preparing title="Sea of Names" preparationMeta="E2 — The crossing" />)
    expect(container.querySelector('.consumit-player-preparation-title')).toHaveTextContent('Sea of Names')
    rerender(<ConsumitPlayer preparing title="Sea of Names" preparationMeta="E2 — The crossing" pauseLogoUrl="/broken-logo.png" />)
    fireEvent.error(container.querySelector('[data-player-preparation] img')!)
    expect(container.querySelector('[data-player-preparation] img')).not.toBeInTheDocument()
    expect(container.querySelector('.consumit-player-preparation-title')).toHaveTextContent('Sea of Names')
    expect(container.querySelector('[data-player-preparation]')).toHaveTextContent('E2 — The crossing')
    rerender(<ConsumitPlayer preparing title="Another title" pauseLogoUrl="/replacement-logo.png" />)
    expect(container.querySelector('[data-player-preparation] img')).toHaveAttribute('src', '/replacement-logo.png')
  })

  it('recognizes artwork that failed before the loading screen hydrated', () => {
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true)
    try {
      const { container } = render(<ConsumitPlayer preparing title="Sea of Names" preparationMeta="E2 — The crossing" pauseLogoUrl="/failed-before-hydration.png" />)
      expect(container.querySelector('.consumit-player-preparation-logo')).not.toBeInTheDocument()
      expect(container.querySelector('.consumit-player-preparation-title')).toHaveTextContent('Sea of Names')
      expect(container.querySelector('[data-player-preparation]')).toHaveTextContent('E2 — The crossing')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('presents pending resolution without inventing playback readiness and clears it on failure', () => {
    const { container, rerender } = render(<ConsumitPlayer preparing posterSrc="/poster.jpg" title="Sea of Names" topMeta="S1 · E2 — The crossing" backHref="/title/1" />)
    expect(screen.getByRole('status')).toHaveTextContent('Finding your stream…')
    expect(screen.getByRole('status')).toHaveTextContent('S1 · E2 — The crossing')
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/title/1')
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled()
    rerender(<ConsumitPlayer title="Sea of Names" status="No source available" statusTone="unavailable" />)
    expect(container.querySelector('[data-player-preparation]')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('No source available')
  })

  it('uses preparation before playback and compact buffering after a frame arrives', () => {
    const playing = vi.fn()
    const { container } = render(<ConsumitPlayer autoPlay src="/movie.mp4" title="Sea of Names" onPlaying={playing} />)
    const video = container.querySelector('video')!
    fireEvent.waiting(video)
    expect(container.querySelector('[data-player-preparation]')).toHaveTextContent('Preparing playback…')
    fireEvent.playing(video)
    expect(playing).toHaveBeenCalledTimes(1)
    expect(container.querySelector('[data-player-preparation]')).not.toBeInTheDocument()
    fireEvent.waiting(video)
    expect(container.querySelector('[data-player-preparation]')).not.toBeInTheDocument()
    expect(screen.getByText('Buffering video')).toBeInTheDocument()
  })

  it('shows neighboring episode controls only in fullscreen and delegates them to Watch', () => {
    const previous = vi.fn()
    const next = vi.fn()
    const { container } = render(<ConsumitPlayer src="/movie.mp4" title="Sea of Names" backHref="/title/1" onPreviousEpisode={previous} onNextEpisode={next} />)
    const original = Object.getOwnPropertyDescriptor(document, 'fullscreenElement')
    try {
      expect(screen.queryByRole('button', { name: 'Previous episode' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Next episode' })).not.toBeInTheDocument()
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: container.querySelector('[data-consumit-player]') })
      fireEvent(document, new Event('fullscreenchange'))
      fireEvent.click(screen.getByRole('button', { name: 'Previous episode' }))
      fireEvent.click(screen.getByRole('button', { name: 'Next episode' }))
      expect(previous).toHaveBeenCalledTimes(1)
      expect(next).toHaveBeenCalledTimes(1)
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null })
      fireEvent(document, new Event('fullscreenchange'))
      expect(screen.queryByRole('button', { name: 'Previous episode' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Next episode' })).not.toBeInTheDocument()
    } finally {
      if (original) Object.defineProperty(document, 'fullscreenElement', original)
      else Reflect.deleteProperty(document, 'fullscreenElement')
    }
  })

  it('forwards a pending seek so Watch can retain its destination before frames arrive', () => {
    const seeking = vi.fn((event) => event.currentTarget.currentTime)
    const { container } = render(<ConsumitPlayer src="/movie.mp4" title="Sea of Names" onSeeking={seeking} />)
    const video = container.querySelector('video')!
    setClock(video, 600, 1200)
    fireEvent.seeking(video)
    expect(seeking).toHaveBeenCalledTimes(1)
    expect(seeking).toHaveReturnedWith(600)
  })
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

  it('does not reload healthy media when only its source lease metadata changes', async () => {
    const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined)
    try {
      const source = { src: 'https://cdn.consumit.example/episode.mp4', type: 'native' as const, expiresAt: '2026-09-30T15:05:00Z' }
      const renewed = { ...source, expiresAt: '2026-09-30T15:10:00Z' }
      const { container, rerender } = render(<ConsumitPlayer source={source} title="Anime episode" />)
      const video = container.querySelector('video')!
      await waitFor(() => expect(video.src).toBe(source.src))
      await act(async () => { await Promise.resolve() })
      setClock(video, 120, 1200)
      fireEvent.loadedMetadata(video)
      fireEvent.playing(video)
      const removeAttribute = vi.spyOn(video, 'removeAttribute')
      await act(async () => {
        rerender(<ConsumitPlayer source={renewed} title="Anime episode" />)
        await Promise.resolve()
      })
      expect(container.querySelector('video')).toBe(video)
      expect(removeAttribute).not.toHaveBeenCalledWith('src')
    } finally {
      load.mockRestore()
    }
  })

  it('reloads the same media URL when retrying a failed engine', async () => {
    const failed = vi.fn()
    const source = { src: 'https://cdn.consumit.example/episode.mp4', type: 'native' as const }
    const { container, rerender } = render(<ConsumitPlayer source={source} title="Anime episode" onSourceError={failed} />)
    const video = container.querySelector('video')!
    await waitFor(() => expect(video.src).toBe(source.src))
    await act(async () => { await Promise.resolve() })
    fireEvent.error(video)
    expect(failed).toHaveBeenCalled()
    const removeAttribute = vi.spyOn(video, 'removeAttribute')
    await act(async () => {
      rerender(<ConsumitPlayer source={{ ...source }} title="Anime episode" onSourceError={failed} />)
      await Promise.resolve()
    })
    expect(removeAttribute).toHaveBeenCalledWith('src')
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
    expect(screen.getByRole('button', { name: /Change quality/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Subtitles' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Settings/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Change server' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enter picture in picture' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enter fullscreen' })).toBeInTheDocument()
    expect(screen.getByText('Some places disappear long before anyone leaves them.')).toBeInTheDocument()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('opens a standalone quality rail with nothing else inside', () => {
    render(
      <ConsumitPlayer
        title="The Last City After Rain"
        src="/movie.mp4"
        serverOptions={[
          { label: 'vixsrc', value: 'vixsrc', detail: '1080p' },
          { label: 'vidlink', value: 'vidlink', detail: 'Auto' },
        ]}
        selectedServer="vixsrc"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Change quality/ }))
    const menu = screen.getByRole('menu', { name: 'Quality' })
    expect(screen.getByRole('button', { name: 'Close quality' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitemradio', { name: 'Auto' })).toHaveAttribute('aria-checked', 'true')
    expect(within(menu).queryByRole('group', { name: 'Server' })).not.toBeInTheDocument()
    expect(within(menu).queryByRole('group', { name: 'Playback speed' })).not.toBeInTheDocument()
  })

  it('opens playback adjustments from the settings section', () => {
    render(
      <ConsumitPlayer
        title="The Last City After Rain"
        src="/movie.mp4"
        serverOptions={[
          { label: 'vixsrc', value: 'vixsrc', detail: '1080p' },
          { label: 'vidlink', value: 'vidlink', detail: 'Auto' },
        ]}
        selectedServer="vixsrc"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Settings/ }))
    const menu = screen.getByRole('menu', { name: 'Settings options' })
    expect(within(menu).queryByRole('group', { name: 'Quality' })).not.toBeInTheDocument()
    expect(within(menu).queryByRole('group', { name: 'Server' })).not.toBeInTheDocument()
    expect(within(menu).queryByRole('group', { name: 'Subtitles' })).not.toBeInTheDocument()
    expect(within(menu).queryByRole('slider')).not.toBeInTheDocument()
    fireEvent.click(within(menu).getByRole('button', { name: /Playback settings/ }))
    const playback = screen.getByRole('menu', { name: 'Playback settings' })
    expect(within(playback).getByRole('slider', { name: 'Playback speed' })).toHaveAttribute('aria-valuetext', 'Normal')
    expect(within(playback).getByRole('slider', { name: 'Volume boost' })).toHaveValue('1')
    expect(within(playback).getByRole('slider', { name: 'Brightness' })).toBeInTheDocument()
  })

  it('adjusts playback without closing the panel, returns to settings, and restores trigger focus on Escape', () => {
    window.localStorage.clear()
    const rate = vi.fn()
    const { container } = render(<ConsumitPlayer src="/movie.mp4" title="Fixture" onRateChange={rate} />)
    const trigger = screen.getByRole('button', { name: /Settings:/ })
    trigger.focus()
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('button', { name: /Playback settings/ }))
    fireEvent.change(screen.getByRole('slider', { name: 'Playback speed' }), { target: { value: '4' } })
    expect(rate).toHaveBeenCalledWith(1.5)
    expect(screen.getByRole('menu', { name: 'Playback settings' })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('slider', { name: 'Brightness' }), { target: { value: '1.2' } })
    expect(container.querySelector('video')).toHaveStyle({ filter: 'brightness(1.2)' })
    fireEvent.click(screen.getByRole('button', { name: 'Back to settings' }))
    expect(screen.getByRole('menu', { name: 'Settings options' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    window.localStorage.clear()
  })

  it('shows a normal-audio fallback when volume boost is unsupported', async () => {
    render(<ConsumitPlayer src="/movie.mp4" title="Fixture" />)
    fireEvent.click(screen.getByRole('button', { name: /Settings:/ }))
    fireEvent.click(screen.getByRole('button', { name: /Playback settings/ }))
    fireEvent.change(screen.getByRole('slider', { name: 'Volume boost' }), { target: { value: '3' } })
    expect(await screen.findByText(/Volume boost is unavailable/)).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Volume boost' })).toHaveValue('1')
  })

  it('does not offer invalid speeds when only one rate is configured', () => {
    render(<ConsumitPlayer src="/movie.mp4" title="Fixture" playbackRates={[1, 1, -2, NaN]} />)
    fireEvent.click(screen.getByRole('button', { name: /Settings:/ }))
    fireEvent.click(screen.getByRole('button', { name: /Playback settings/ }))
    expect(screen.getByRole('slider', { name: 'Playback speed' })).toBeDisabled()
  })

  it('opens the standalone subtitles panel and switches captions off', () => {
    prototypePlayer()

    fireEvent.click(screen.getByRole('button', { name: 'Subtitles' }))
    const menu = screen.getByRole('menu', { name: 'Subtitles' })
    expect(within(menu).getByRole('button', { name: 'Close subtitles' })).toBeInTheDocument()
    fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'Off' }))

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.queryByText('Some places disappear long before anyone leaves them.')).not.toBeInTheDocument()
  })

  it('requests optional subtitle search only when captions are opened', () => {
    const request = vi.fn()
    render(<ConsumitPlayer src="/movie.mp4" title="Fixture" onSubtitleRequest={request} />)
    expect(request).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Subtitles' }))
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('opens the visual sync panel from the wand button and closes it', () => {
    prototypePlayer()

    fireEvent.click(screen.getByRole('button', { name: /Subtitle sync offset/ }))
    const menu = screen.getByRole('menu', { name: 'Subtitle sync' })
    expect(within(menu).getByText('Click a line when you hear it spoken')).toBeInTheDocument()
    expect(within(menu).getByText('0ms')).toBeInTheDocument()
    fireEvent.click(within(menu).getByRole('button', { name: 'Close subtitle sync' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('renders delay-shifted cues from the parsed subtitle file', async () => {
    const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nHello world\n'
    const fetchMock = vi.fn(async () => ({ ok: true, body: undefined, text: async () => vtt }))
    vi.stubGlobal('fetch', fetchMock)
    try {
      const { container } = render(
        <ConsumitPlayer
          title="Sea of Names"
          src="/movie.mp4"
          extraSubtitles={[{ id: 'a', label: 'A', language: 'en', url: 'https://media.example/a.vtt' }]}
          subtitleOptions={[{ label: 'A', value: 'external:consumit-external-a' }, { label: 'Off', value: 'off' }]}
          selectedSubtitle="external:consumit-external-a"
          subtitleDelayMs={2000}
        />,
      )
      const video = container.querySelector('video')!
      await waitFor(() => expect(fetchMock).toHaveBeenCalled())
      setClock(video, 0, 120)
      fireEvent.timeUpdate(video)
      // +2000ms shows the 1s cue already at t=0.
      expect(await screen.findByText('Hello world')).toBeInTheDocument()
      const cue = container.querySelector('[data-consumit-player-caption]')!
      const timeline = container.querySelector('[data-player-timeline]')!
      expect(cue.closest('[data-player-controls]')).not.toBeNull()
      // Captions sit above the seek bar, and the slot reserves no space
      // once the cue ends.
      expect(cue.compareDocumentPosition(timeline) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      setClock(video, 5, 120)
      fireEvent.timeUpdate(video)
      await waitFor(() => expect(screen.queryByText('Hello world')).not.toBeInTheDocument())
      expect(container.querySelector('[data-player-caption-slot]')).toBeNull()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('coalesces rapid timeline hover moves to one render per frame', async () => {
    const { container } = prototypePlayer()
    const video = container.querySelector('video')!
    setClock(video, 0, 3600)
    act(() => {
      video.dispatchEvent(new Event('loadedmetadata'))
    })
    const timeline = container.querySelector('[data-player-timeline]')!
    vi.spyOn(timeline, 'getBoundingClientRect').mockReturnValue({
      width: 1000, height: 24, top: 0, left: 0, right: 1000, bottom: 24, x: 0, y: 0, toJSON: () => ({}),
    })
    // A lone move applies on the next frame.
    fireEvent.mouseMove(timeline, { clientX: 100 })
    await screen.findByText('6:00')
    // Two moves inside one frame collapse into the first position: the
    // trailing move never renders, so rapid scrubbing cannot flood renders.
    fireEvent.mouseMove(timeline, { clientX: 500 })
    fireEvent.mouseMove(timeline, { clientX: 900 })
    await screen.findByText('30:00')
    expect(screen.queryByText('54:00')).not.toBeInTheDocument()
    // The next frame picks up the latest position.
    fireEvent.mouseMove(timeline, { clientX: 900 })
    await screen.findByText('54:00')
    fireEvent.mouseLeave(timeline)
    await waitFor(() => expect(screen.queryByText('54:00')).not.toBeInTheDocument())
  })

  it('keeps Arabic two-line cues ordered with per-line direction', async () => {
    const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\n-حسنا! ونحن في طريقنا إلى البقاء على قيد الحياة!\n-و لا مزيد من جبابرة قادمون الداخل!\n'
    const fetchMock = vi.fn(async () => ({ ok: true, body: undefined, text: async () => vtt }))
    vi.stubGlobal('fetch', fetchMock)
    try {
      const { container } = render(
        <ConsumitPlayer
          title="Sea of Names"
          src="/movie.mp4"
          extraSubtitles={[{ id: 'a', label: 'A', language: 'ar', url: 'https://media.example/a.vtt' }]}
          subtitleOptions={[{ label: 'A', value: 'external:consumit-external-a' }, { label: 'Off', value: 'off' }]}
          selectedSubtitle="external:consumit-external-a"
          subtitleDelayMs={2000}
        />,
      )
      const video = container.querySelector('video')!
      await waitFor(() => expect(fetchMock).toHaveBeenCalled())
      setClock(video, 0, 120)
      fireEvent.timeUpdate(video)
      // +2000ms shows the 1s cue already at t=0, both authored lines intact.
      const cues = container.querySelectorAll('[data-consumit-player-caption]')
      expect(cues.length).toBeGreaterThan(0)
      for (const cue of cues) {
        expect(cue.textContent).toBe('-حسنا! ونحن في طريقنا إلى البقاء على قيد الحياة!\n-و لا مزيد من جبابرة قادمون الداخل!')
        // Author line breaks stay intact (no rebalancing) and each line
        // resolves its own direction; dir remains the legacy fallback.
        expect(cue.getAttribute('dir')).toBe('auto')
        expect(cue.className).toContain('[unicode-bidi:plaintext]')
        expect(cue.className).not.toContain('text-balance')
      }
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('refreshes the caption overlay every frame while playing, without media events', async () => {
    const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nHello world\n'
    const fetchMock = vi.fn(async () => ({ ok: true, body: undefined, text: async () => vtt }))
    vi.stubGlobal('fetch', fetchMock)
    const frames: (() => void)[] = []
    const rafMock = vi.fn((callback: FrameRequestCallback) => {
      frames.push(() => callback(0))
      return frames.length
    })
    vi.stubGlobal('requestAnimationFrame', rafMock)
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    try {
      const { container } = render(
        <ConsumitPlayer
          title="Sea of Names"
          src="/movie.mp4"
          extraSubtitles={[{ id: 'a', label: 'A', language: 'en', url: 'https://media.example/a.vtt' }]}
          subtitleOptions={[{ label: 'A', value: 'external:consumit-external-a' }, { label: 'Off', value: 'off' }]}
          selectedSubtitle="external:consumit-external-a"
          subtitleDelayMs={2000}
        />,
      )
      const video = container.querySelector('video')!
      await waitFor(() => expect(fetchMock).toHaveBeenCalled())
      // Cue [1s, 4s] with a +2000ms shift is active at t=0.
      expect(await screen.findByText('Hello world')).toBeInTheDocument()

      // Advance the clock without dispatching any media event: the overlay is
      // stale until the frame sampler runs (t=3 + 2s = 5s is past the cue).
      setClock(video, 3, 120)
      expect(screen.getByText('Hello world')).toBeInTheDocument()
      fireEvent.playing(video)
      expect(rafMock).toHaveBeenCalled()
      act(() => { frames[frames.length - 1]?.() })
      expect(screen.queryByText('Hello world')).not.toBeInTheDocument()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('lists subtitle tracks PROVE-embed style with native names and a menu count', () => {
    const { container } = render(
      <ConsumitPlayer
        title="Sea of Names"
        src="/movie.mp4"
        subtitleOptions={[
          { label: 'English (yify)', value: 'en', language: 'en' },
          { label: 'Arabic', value: 'ar', language: 'ar' },
          { label: 'Off', value: 'off' },
        ]}
      />,
    )

    // The toolbar icon carries no count badge; the count lives in the menu
    // header (Off excluded).
    expect(container.querySelector('span.relative > span[aria-hidden="true"]')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Subtitles' }))
    const menu = screen.getByRole('menu', { name: 'Subtitles' })
    expect(within(menu).getByText('2 tracks')).toBeInTheDocument()
    expect(within(menu).getByRole('menuitemradio', { name: 'Off' })).toBeInTheDocument()
    fireEvent.click(within(menu).getByRole('button', { name: /العربية1/ }))
    expect(within(menu).getByRole('menuitemradio', { name: 'العربية' })).toBeInTheDocument()
    fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'العربية' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('keeps every subtitle in the menu when the server switches', async () => {
    const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined)
    try {
      const first = { src: 'https://cdn.consumit.example/first.mp4', type: 'native' as const, subtitles: [{ id: 'a-en', label: 'English (A)', language: 'en', url: 'https://cdn.example/a-en.vtt' }] }
      const second = { src: 'https://cdn.consumit.example/second.mp4', type: 'native' as const, subtitles: [{ id: 'b-en', label: 'English (B)', language: 'en', url: 'https://cdn.example/b-en.vtt' }] }
      // Like the watch screen: every answering server plus the aggregated
      // engine tracks ride along, independent of the active source.
      const shared = [
        { id: 'a-en', label: 'English (A)', language: 'en', url: 'https://cdn.example/a-en.vtt' },
        { id: 'b-en', label: 'English (B)', language: 'en', url: 'https://cdn.example/b-en.vtt' },
        { id: 'y', label: 'English (yify)', language: 'en', url: 'https://subs.example/y.vtt' },
      ]
      const { rerender } = render(<ConsumitPlayer title="X" source={first} extraSubtitles={shared} />)
      fireEvent.click(screen.getByRole('button', { name: 'Subtitles' }))
      const menu = screen.getByRole('menu', { name: 'Subtitles' })
      fireEvent.click(within(menu).getByRole('button', { name: /English.*3/ }))
      await waitFor(() => expect(within(menu).getByText('English (A)')).toBeInTheDocument())
      expect(within(menu).getByText('3 tracks')).toBeInTheDocument()

      rerender(<ConsumitPlayer title="X" source={second} extraSubtitles={shared} />)
      const kept = await screen.findByRole('menu', { name: 'Subtitles' })
      // Server A's track survives next to server B's and the engine track.
      await waitFor(() => expect(within(kept).getByText('English (B)')).toBeInTheDocument())
      expect(within(kept).getByText('English (A)')).toBeInTheDocument()
      expect(within(kept).getByText('English (yify)')).toBeInTheDocument()
      expect(within(kept).getByText('3 tracks')).toBeInTheDocument()
    } finally {
      load.mockRestore()
    }
  })

  it('hides a discovered row once its track is selected', async () => {
    const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined)
    try {
      const prepare = vi.fn(async (candidate: { id: string }) => ({ id: candidate.id, label: 'Arabic (vdrkv2)', language: 'ar', url: `https://subs.example/${candidate.id}.vtt` }))
      render(
        <ConsumitPlayer
          title="X"
          source={{ src: 'https://cdn.consumit.example/x.mp4', type: 'native', subtitles: [] }}
          subtitleDiscovery={{ languages: [{ code: 'ar', count: 2 }], providers: [], loading: false, error: null }}
          onSubtitlePage={async () => ({
            tracks: [
              { id: 'c1', label: 'Arabic', language: 'ar', provider: 'vdrkv2' },
              { id: 'c2', label: 'Arabic', language: 'ar', provider: 'vdrk' },
            ],
            total: 2,
            nextCursor: null,
          })}
          onSubtitleCandidateSelect={prepare}
        />,
      )
      fireEvent.click(screen.getByRole('button', { name: 'Subtitles' }))
      const menu = await screen.findByRole('menu', { name: 'Subtitles' })
      const languageRow = within(menu).getAllByRole('button', { name: /العربية/ }).find((entry) => entry.hasAttribute('aria-expanded'))!
      fireEvent.click(languageRow)
      expect(await within(menu).findByRole('button', { name: /^العربية\s*vdrkv2$/ })).toBeInTheDocument()
      expect(within(menu).getByRole('button', { name: /^العربية\s*vdrk$/ })).toBeInTheDocument()

      fireEvent.click(within(menu).getByRole('button', { name: /^العربية\s*vdrkv2$/ }))
      await waitFor(() => expect(prepare).toHaveBeenCalledTimes(1))
      await waitFor(() => expect(screen.queryByRole('menu', { name: 'Subtitles' })).not.toBeInTheDocument())

      fireEvent.click(screen.getByRole('button', { name: 'Subtitles' }))
      const reopened = await screen.findByRole('menu', { name: 'Subtitles' })
      expect(await within(reopened).findByRole('menuitemradio', { name: /العربية.*Arabic \(vdrkv2\)/ })).toHaveAttribute('aria-checked', 'true')
      expect(within(reopened).queryByRole('button', { name: /^العربية\s*vdrkv2$/ })).not.toBeInTheDocument()
      expect(within(reopened).getByRole('button', { name: /^العربية\s*vdrk$/ })).toBeInTheDocument()
    } finally {
      load.mockRestore()
    }
  })

  it('never lists a discovered track whose prepared file is already active', async () => {
    const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined)
    try {
      render(
        <ConsumitPlayer
          title="X"
          source={{ src: 'https://cdn.consumit.example/x.mp4', type: 'native', subtitles: [{ id: 'a1', label: 'Arabic (vdrkv2)', language: 'ar', url: 'https://media.example/prep.vtt' }] }}
          selectedSubtitle="external:consumit-external-a1"
          onSubtitlePage={async () => ({
            tracks: [{ id: 'c9', label: 'Arabic', language: 'ar', provider: 'vdrkv2', preparedUrl: 'https://media.example/prep.vtt' }],
            total: 1,
            nextCursor: null,
          })}
        />,
      )
      fireEvent.click(screen.getByRole('button', { name: 'Subtitles' }))
      const menu = await screen.findByRole('menu', { name: 'Subtitles' })
      const languageRow = within(menu).getAllByRole('button', { name: /العربية/ }).find((entry) => entry.hasAttribute('aria-expanded'))!
      fireEvent.click(languageRow)
      expect(await within(menu).findByRole('menuitemradio', { name: /العربية.*Arabic \(vdrkv2\)/ })).toHaveAttribute('aria-checked', 'true')
      expect(within(menu).queryByRole('button', { name: /^العربية\s*vdrkv2$/ })).not.toBeInTheDocument()
    } finally {
      load.mockRestore()
    }
  })

  it('keeps subtitle customization in its own panel and preserves choices when returning', () => {
    window.localStorage.clear()
    try {
      prototypePlayer()
      const trigger = screen.getByRole('button', { name: 'Subtitles' })
      trigger.focus()
      fireEvent.click(trigger)
      const subtitles = screen.getByRole('menu', { name: 'Subtitles' })
      expect(within(subtitles).queryByRole('group', { name: 'Caption size' })).not.toBeInTheDocument()
      expect(within(subtitles).queryByRole('group', { name: 'Caption style' })).not.toBeInTheDocument()
      fireEvent.click(within(subtitles).getByRole('button', { name: 'Subtitle appearance' }))
      const appearance = screen.getByRole('menu', { name: 'Subtitle appearance' })
      expect(screen.queryByRole('menu', { name: 'Subtitles' })).not.toBeInTheDocument()
      expect(trigger).toHaveAttribute('aria-controls', 'consumit-player-menu-appearance')
      fireEvent.click(within(appearance).getByRole('button', { name: 'Large' }))
      fireEvent.click(within(appearance).getByRole('button', { name: 'Boxed' }))
      fireEvent.click(within(appearance).getByRole('button', { name: 'Top' }))
      fireEvent.click(within(appearance).getByRole('button', { name: 'Sans' }))
      expect(window.localStorage.getItem('consumit.player.caption-size')).toBe('large')
      expect(window.localStorage.getItem('consumit.player.caption-background')).toBe('boxed')
      expect(window.localStorage.getItem('consumit.player.caption-position')).toBe('top')
      expect(window.localStorage.getItem('consumit.player.caption-font')).toBe('sans')
      expect(screen.getByRole('menu', { name: 'Subtitle appearance' })).toBeInTheDocument()
      fireEvent.click(within(appearance).getByRole('button', { name: 'Back to subtitles' }))
      fireEvent.click(screen.getByRole('button', { name: 'Subtitle appearance' }))
      expect(screen.getByRole('button', { name: 'Large' })).toHaveAttribute('aria-pressed', 'true')
      fireEvent.click(screen.getByRole('button', { name: 'Close subtitle appearance' }))
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
      expect(trigger).toHaveFocus()
    } finally {
      window.localStorage.clear()
    }
  })

  it('does not rediscover subtitle tracks when returning from appearance', () => {
    const request = vi.fn()
    render(<ConsumitPlayer title="Fixture" src="/movie.mp4" onSubtitleRequest={request} />)
    fireEvent.click(screen.getByRole('button', { name: 'Subtitles' }))
    fireEvent.click(screen.getByRole('button', { name: 'Subtitle appearance' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back to subtitles' }))
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('closes the settings panel from its close control', () => {
    prototypePlayer()

    fireEvent.click(screen.getByRole('button', { name: /Settings/ }))
    expect(screen.getByRole('menu', { name: 'Settings options' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes the quality rail from its close control', () => {
    prototypePlayer()

    fireEvent.click(screen.getByRole('button', { name: /Change quality/ }))
    expect(screen.getByRole('menu', { name: 'Quality' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close quality' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes the server rail from its close control', () => {
    render(
      <ConsumitPlayer
        title="The Last City After Rain"
        src="/movie.mp4"
        serverOptions={[
          { label: 'vixsrc', value: 'vixsrc', detail: '1080p' },
          { label: 'vidlink', value: 'vidlink', detail: 'Auto' },
        ]}
        selectedServer="vixsrc"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Change server' }))
    expect(screen.getByRole('menu', { name: 'Server' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close server' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes the subtitles panel from its close control', () => {
    prototypePlayer()

    fireEvent.click(screen.getByRole('button', { name: 'Subtitles' }))
    expect(screen.getByRole('menu', { name: 'Subtitles' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close subtitles' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('shows title facts and overview while paused and hides them without pause context', () => {
    const { container, rerender } = render(
      <ConsumitPlayer
        title="The End of Oak Street"
        src="/movie.mp4"
        pauseFacts="2026 · 1h 40m · ★ 6.5 · PG-13"
        pauseOverview="After a mysterious cosmic event rips Oak Street from suburbia."
      />,
    )
    const overlay = container.querySelector('[data-consumit-player-pause]')!
    expect(overlay).toHaveTextContent('The End of Oak Street')
    expect(overlay).toHaveTextContent('2026 · 1h 40m · ★ 6.5 · PG-13')
    expect(overlay).toHaveTextContent('After a mysterious cosmic event rips Oak Street from suburbia.')

    rerender(<ConsumitPlayer title="The End of Oak Street" src="/movie.mp4" />)
    expect(container.querySelector('[data-consumit-player-pause]')).not.toBeInTheDocument()
  })

  it('prefers the title artwork logo over the serif title while paused', () => {
    const { container } = render(
      <ConsumitPlayer
        title="Stowaway"
        src="/movie.mp4"
        pauseLogoUrl="https://image.tmdb.org/t/p/original/stowaway-logo.png"
        pauseFacts="2021 · 1h 56m · ★ 6.0 · R"
      />,
    )
    const overlay = container.querySelector('[data-consumit-player-pause]')!
    expect(overlay.querySelector('img')).toHaveAttribute('src', 'https://image.tmdb.org/t/p/original/stowaway-logo.png')
    expect(overlay).toHaveTextContent('Stowaway')
    expect(overlay).toHaveTextContent('2021 · 1h 56m · ★ 6.0 · R')
  })

  it('shows the cast control only when a cast runtime is available', () => {
    const source = { src: 'https://cdn.consumit.example/clip.mp4', type: 'native' as const }
    const { rerender } = render(<ConsumitPlayer source={source} title="Stowaway" />)
    expect(screen.queryByRole('button', { name: 'Cast to TV' })).not.toBeInTheDocument()
    const onCastClick = vi.fn()
    rerender(<ConsumitPlayer source={source} title="Stowaway" castAvailable onCastClick={onCastClick} />)
    const button = screen.getByRole('button', { name: 'Cast to TV' })
    fireEvent.click(button)
    expect(onCastClick).toHaveBeenCalledOnce()
    rerender(<ConsumitPlayer source={source} title="Stowaway" castAvailable castConnected onCastClick={onCastClick} />)
    expect(screen.getByRole('button', { name: 'Disconnect from TV' })).toBeInTheDocument()
  })
  it('lists servers and switches on selection', () => {
    const onServerChange = vi.fn()
    render(
      <ConsumitPlayer
        title="The Last City After Rain"
        src="/movie.mp4"
        serverOptions={[
          { label: 'vixsrc', value: 'vixsrc', detail: '1080p' },
          { label: 'vidlink', value: 'vidlink', detail: 'Auto' },
        ]}
        selectedServer="vixsrc"
        onServerChange={onServerChange}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Change server' }))
    const menu = screen.getByRole('menu', { name: 'Server' })
    expect(within(menu).getByRole('menuitemradio', { name: /vidlink/ })).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(within(menu).getByRole('menuitemradio', { name: /vidlink/ }))
    expect(onServerChange).toHaveBeenCalledWith('vidlink')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
  it('groups mirror servers by family with their qualities', () => {
    const onServerChange = vi.fn()
    render(
      <ConsumitPlayer
        title="The Last City After Rain"
        src="/movie.mp4"
        serverOptions={[
          { label: 'vidcore', value: 'vidcore', detail: '1080p', family: 'vidcore', mirror: 'auto' },
          { label: 'vidcore-nova', value: 'vidcore-nova', detail: '1080p', family: 'vidcore', mirror: 'nova' },
          { label: 'rivestream', value: 'rivestream', detail: '720p', family: 'rivestream', mirror: 'auto' },
        ]}
        selectedServer="vidcore"
        onServerChange={onServerChange}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Change server' }))
    const menu = screen.getByRole('menu', { name: 'Server' })
    // Families headline their mirrors; the aggregate row reads Auto.
    expect(within(menu).getByRole('group', { name: 'Vidcore' })).toBeInTheDocument()
    expect(within(menu).getByRole('group', { name: 'Rivestream' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitemradio', { name: /Nova/ })).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(within(menu).getByRole('menuitemradio', { name: /Nova/ }))
    expect(onServerChange).toHaveBeenCalledWith('vidcore-nova')
  })
  it('offers another server from the error overlay when options exist', () => {
    const { container } = render(
      <ConsumitPlayer
        title="The Last City After Rain"
        src="/movie.mp4"
        serverOptions={[
          { label: 'vixsrc', value: 'vixsrc', detail: '1080p', family: 'vixsrc', mirror: 'auto' },
          { label: 'vidcore-nova', value: 'vidcore-nova', detail: '1080p', family: 'vidcore', mirror: 'nova' },
        ]}
        selectedServer="vixsrc"
        onSourceError={() => {}}
      />,
    )
    fireEvent.error(container.querySelector('video')!)
    expect(screen.getByRole('alert')).toHaveTextContent('Playback failed')
    fireEvent.click(screen.getByRole('button', { name: 'Try another server' }))
    expect(screen.getByRole('menu', { name: 'Server' })).toBeInTheDocument()
  })
  it('auto-skips the intro while playing when auto-skip is on', () => {
    window.localStorage.clear()
    const source = { src: 'https://cdn.example/ep.m3u8', type: 'hls' as const, skipSegments: [{ kind: 'intro' as const, start: 0, end: 85 }] }
    const { container } = render(<ConsumitPlayer source={source} title="Skip intro" />)
    const video = container.querySelector('video')!
    Object.defineProperty(video, 'paused', { configurable: true, value: false })
    setClock(video, 10, 1500)
    fireEvent.timeUpdate(video)
    fireEvent.play(video)
    expect(video.currentTime).toBe(85)
    window.localStorage.clear()
  })
  it('offers a manual skip button when auto-skip is off', () => {
    window.localStorage.setItem('consumit.player.auto-skip', '0')
    try {
      const source = { src: 'https://cdn.example/ep.m3u8', type: 'hls' as const, skipSegments: [{ kind: 'outro' as const, start: 1400, end: 1440 }] }
      const { container } = render(<ConsumitPlayer source={source} title="Skip outro" />)
      const video = container.querySelector('video')!
      Object.defineProperty(video, 'paused', { configurable: true, value: false })
      setClock(video, 1410, 1500)
      fireEvent.timeUpdate(video)
      expect(video.currentTime).toBe(1410)
      fireEvent.click(screen.getByRole('button', { name: 'Skip outro' }))
      expect(video.currentTime).toBe(1440)
    } finally {
      window.localStorage.clear()
    }
  })
  it('marks mirrors that did not answer without removing them', () => {
    render(
      <ConsumitPlayer
        title="The Last City After Rain"
        src="/movie.mp4"
        serverOptions={[
          { label: 'vixsrc', value: 'vixsrc', detail: '1080p', family: 'vixsrc', mirror: 'auto' },
          { label: 'vidcore-nova', value: 'vidcore-nova', family: 'vidcore', mirror: 'nova', available: false },
        ]}
        selectedServer="vixsrc"
        onServerChange={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Change server' }))
    const menu = screen.getByRole('menu', { name: 'Server' })
    expect(within(menu).getByText('Unavailable for this title')).toBeInTheDocument()
    expect(within(menu).getByRole('menuitemradio', { name: /Nova/ })).toBeInTheDocument()
  })
  it('hides the server switcher when there is nothing to switch to', () => {
    render(<ConsumitPlayer title="The Last City After Rain" src="/movie.mp4" serverOptions={[{ label: 'vixsrc', value: 'vixsrc' }]} />)
    expect(screen.queryByRole('button', { name: 'Change server' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Settings/ }))
    expect(screen.getByRole('menu', { name: 'Settings options' })).toBeInTheDocument()
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

  it('renders stored subtitle preference only after mount so SSR matches', async () => {
    window.localStorage.setItem('consumit.player.subtitles', 'off')
    try {
      // Server render ignores storage: the static chrome matches the first
      // client render, so hydration never differs on subtitle state.
      const html = renderToString(<ConsumitPlayer title="Sea of Names" />)
      expect(html).toContain('Settings: audio, speed, brightness')
      // The stored preference applies in an effect after mount.
      render(<ConsumitPlayer title="Sea of Names" src="/movie.mp4" backHref="/title" />)
      fireEvent.click(screen.getByRole('button', { name: 'Subtitles' }))
      const menu = screen.getByRole('menu', { name: 'Subtitles' })
      expect(within(menu).getByRole('menuitemradio', { name: 'Off' })).toHaveAttribute('aria-checked', 'true')
    } finally {
      window.localStorage.clear()
    }
  })

  it('keeps PiP support out of the first paint so SSR matches hydration', async () => {
    const html = renderToString(<ConsumitPlayer title="Sea of Names" src="/movie.mp4" />)
    // SSR has no window/document: PiP reports unsupported (disabled).
    expect(html).toContain('Enter picture in picture')
    const ssrDisabled = /disabled=""/.test(html.slice(html.indexOf('Enter picture in picture') - 200, html.indexOf('Enter picture in picture')))
    expect(ssrDisabled || html.includes('disabled')).toBe(true)

    render(<ConsumitPlayer title="Sea of Names" src="/movie.mp4" />)
    const button = screen.getByRole('button', { name: 'Enter picture in picture' })
    // First client paint still matches SSR (disabled); capability applies in an effect.
    expect(button).toBeDisabled()
    await waitFor(() => {
      // jsdom has no picture-in-picture: stays disabled after mount too.
      expect(button).toBeDisabled()
    })
  })

  it('shows server flags, degraded status, and favorite hearts that persist', () => {
    window.localStorage.clear()
    try {
      render(
        <ConsumitPlayer
          title="The Last City After Rain"
          src="/movie.mp4"
          serverOptions={[
            { label: 'vixsrc', value: 'vixsrc', detail: '1080p', region: 'US', health: 'ok' },
            { label: 'rivestream', value: 'rivestream', detail: 'Auto', region: 'DE', health: 'degraded' },
          ]}
          selectedServer="vixsrc"
          onServerChange={() => {}}
        />,
      )
      fireEvent.click(screen.getByRole('button', { name: 'Change server' }))
      const menu = screen.getByRole('menu', { name: 'Server' })
      expect(within(menu).getByText('🇺🇸')).toBeInTheDocument()
      expect(within(menu).getByText('🇩🇪')).toBeInTheDocument()
      expect(within(menu).getByText('Server degraded')).toBeInTheDocument()
      const heart = within(menu).getByRole('button', { name: 'Favorite rivestream server' })
      expect(heart).toHaveAttribute('aria-pressed', 'false')
      fireEvent.click(heart)
      expect(heart).toHaveAttribute('aria-pressed', 'true')
      expect(JSON.parse(window.localStorage.getItem('consumit.favorite-servers') ?? '[]')).toEqual(['rivestream'])
      // Favorites pin to the top of the list.
      const rows = within(menu).getAllByRole('menuitemradio')
      expect(rows[0]).toHaveAccessibleName(/rivestream/)
      fireEvent.click(within(menu).getByRole('button', { name: 'Unfavorite rivestream server' }))
      expect(JSON.parse(window.localStorage.getItem('consumit.favorite-servers') ?? '[]')).toEqual([])
    } finally {
      window.localStorage.clear()
    }
  })
})

it('opens the keyboard guide from settings, closes with Escape, and restores trigger focus', () => {
  render(<ConsumitPlayer title="Guide fixture" src="/fixture.mp4" />)
  const trigger = screen.getByRole('button', { name: /Settings:/ })
  trigger.focus()
  fireEvent.click(trigger)
  fireEvent.click(screen.getByRole('button', { name: /^Keyboard shortcuts/ }))
  const guide = screen.getByRole('menu', { name: 'Keyboard shortcuts' })
  expect(within(guide).getByText('Space / K')).toBeInTheDocument()
  expect(within(guide).getByText('Back 10 seconds')).toBeInTheDocument()
  fireEvent.keyDown(guide, { key: 'Escape' })
  expect(screen.queryByRole('menu', { name: 'Keyboard shortcuts' })).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
})

it('opens the guide with ? only from the player surface and retains normal field input', () => {
  render(<ConsumitPlayer title="Guide fixture" src="/fixture.mp4" />)
  const controls = screen.getByLabelText('Guide fixture player controls')
  fireEvent.keyDown(controls, { key: '?' })
  expect(screen.getByRole('menu', { name: 'Keyboard shortcuts' })).toBeInTheDocument()
  fireEvent.keyDown(controls, { key: 'Escape' })
  fireEvent.keyDown(screen.getByRole('slider', { name: 'Volume' }), { key: '?' })
  expect(screen.queryByRole('menu', { name: 'Keyboard shortcuts' })).not.toBeInTheDocument()
})
