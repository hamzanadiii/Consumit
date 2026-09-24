import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'

import { ConsumitPlayer } from './consumit-player'
import { WatchHeader } from './playback'

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
  Object.defineProperty(video, 'currentTime', { configurable: true, writable: true, value: currentTime })
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

  it('keeps the settings rail to audio, speed, and brightness', () => {
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
    expect(within(menu).getByRole('button', { name: '1×' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(menu).getByRole('slider', { name: 'Brightness' })).toBeInTheDocument()
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

  it('steps the subtitle sync offset from the subtitles menu and persists it', () => {
    window.localStorage.clear()
    try {
      prototypePlayer()

      fireEvent.click(screen.getByRole('button', { name: 'Subtitles' }))
      const menu = screen.getByRole('menu', { name: 'Subtitles' })
      fireEvent.click(within(menu).getByRole('button', { name: 'Shift subtitles forwards 500 milliseconds' }))
      expect(window.localStorage.getItem('consumit.player.subtitle-delay')).toBe('500')
      // The menu closes on track choice only; steppers keep it open.
      expect(screen.getByRole('menu', { name: 'Subtitles' })).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Reset subtitle sync offset' }))
      expect(window.localStorage.getItem('consumit.player.subtitle-delay')).toBe('0')
    } finally {
      window.localStorage.clear()
    }
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
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('lists subtitle tracks PROVE-embed style with native names and a count', () => {
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

    // Toolbar badge carries the track count (Off excluded).
    expect(container.querySelector('span.relative > span[aria-hidden="true"]')).toHaveTextContent('2')

    fireEvent.click(screen.getByRole('button', { name: 'Subtitles' }))
    const menu = screen.getByRole('menu', { name: 'Subtitles' })
    expect(within(menu).getByText('2 subs')).toBeInTheDocument()
    const rows = within(menu).getAllByRole('menuitemradio')
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('English'),
      expect.stringContaining('العربية'),
      'Off',
    ])
    expect(within(menu).getByText('Arabic')).toBeInTheDocument()
    fireEvent.click(within(menu).getByRole('menuitemradio', { name: /العربية/ }))
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
      await waitFor(() => expect(within(menu).getByText('English (A)')).toBeInTheDocument())
      expect(within(menu).getByText('3 subs')).toBeInTheDocument()

      rerender(<ConsumitPlayer title="X" source={second} extraSubtitles={shared} />)
      const kept = await screen.findByRole('menu', { name: 'Subtitles' })
      // Server A's track survives next to server B's and the engine track.
      await waitFor(() => expect(within(kept).getByText('English (B)')).toBeInTheDocument())
      expect(within(kept).getByText('English (A)')).toBeInTheDocument()
      expect(within(kept).getByText('English (yify)')).toBeInTheDocument()
      expect(within(kept).getByText('3 subs')).toBeInTheDocument()
    } finally {
      load.mockRestore()
    }
  })

  it('picks up to three preferred subtitle languages in order', () => {
    window.localStorage.clear()
    try {
      prototypePlayer()

      fireEvent.click(screen.getByRole('button', { name: 'Subtitles' }))
      const menu = screen.getByRole('menu', { name: 'Subtitles' })
      const group = within(menu).getByRole('group', { name: 'Preferred subtitle languages' })
      expect(within(group).getByText('0/3')).toBeInTheDocument()

      fireEvent.click(within(group).getByRole('button', { name: /العربية/ }))
      fireEvent.click(within(group).getByRole('button', { name: /Français/ }))
      fireEvent.click(within(group).getByRole('button', { name: /Español/ }))
      expect(JSON.parse(window.localStorage.getItem('consumit.player.subtitle-languages') ?? '[]')).toEqual(['ar', 'fr', 'es'])
      expect(within(group).getByText('3/3')).toBeInTheDocument()
      // Capped: further languages disable until one is removed.
      expect(within(group).getByRole('button', { name: /Deutsch/ })).toBeDisabled()

      fireEvent.click(within(group).getByRole('button', { name: /Français/ }))
      expect(JSON.parse(window.localStorage.getItem('consumit.player.subtitle-languages') ?? '[]')).toEqual(['ar', 'es'])
      expect(within(group).getByRole('button', { name: /Deutsch/ })).toBeEnabled()
    } finally {
      window.localStorage.clear()
    }
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
