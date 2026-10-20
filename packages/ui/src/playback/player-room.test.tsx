import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ConsumitPlayer } from './consumit-player'

afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('keeps the player and video mounted while changing episodes and restores drawer focus', () => {
  const view = render(<ConsumitPlayer title="Series" recordingKey="series:1:1" src="/one.mp4" episodePanel={<input aria-label="Filter episodes" />} />)
  const video = view.container.querySelector('video')
  const trigger = screen.getByRole('button', { name: 'Episodes' })
  fireEvent.click(trigger)
  const drawer = screen.getByRole('dialog', { name: 'Episodes' })
  fireEvent.change(within(drawer).getByLabelText('Filter episodes'), { target: { value: '2' } })
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(trigger).toHaveFocus()
  view.rerender(<ConsumitPlayer title="Series" recordingKey="series:1:2" src="/two.mp4" episodePanel={<input aria-label="Filter episodes" />} />)
  expect(view.container.querySelector('video')).toBe(video)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('labels the four deck destinations without duplicating them in settings', () => {
  const view = render(<ConsumitPlayer
    title="Series"
    src="/one.mp4"
    episodePanel={<p>Episode choices</p>}
    serverOptions={[{ label: 'Server 1', value: 'one' }, { label: 'Server 2', value: 'two' }]}
  />)
  const actions = view.container.querySelector<HTMLElement>('[data-player-actions]')!
  for (const label of ['Episodes', 'Sources', 'Settings: audio, speed, brightness']) {
    const button = within(actions).getByRole('button', { name: label })
    expect(button.textContent?.trim()).not.toBe('')
    expect(button.querySelector('svg')).toBeInTheDocument()
  }
  fireEvent.click(screen.getByRole('button', { name: 'Settings: audio, speed, brightness' }))
  const settings = screen.getByRole('dialog', { name: 'Settings options' })
  expect(within(settings).queryByRole('button', { name: 'Captions' })).not.toBeInTheDocument()
  expect(within(settings).queryByRole('button', { name: 'Episodes' })).not.toBeInTheDocument()
  expect(within(settings).getByRole('button', { name: /Picture in picture/ })).toBeInTheDocument()
})

it('locks fullscreen transport and touch gestures, then restores control', async () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  const view = render(<ConsumitPlayer title="Lock" src="/fixture.mp4" />)
  const shell = view.container.querySelector('[data-consumit-player]')!
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: shell })
  fireEvent(document, new Event('fullscreenchange'))
  fireEvent.click(screen.getByRole('button', { name: 'Settings: audio, speed, brightness' }))
  fireEvent.click(screen.getByRole('button', { name: 'Lock controls' }))
  expect(shell).toHaveAttribute('data-controls-locked', 'true')
  const video = view.container.querySelector('video')!
  fireEvent.click(video)
  fireEvent.pointerUp(video, { pointerType: 'touch', clientX: 0 })
  fireEvent.keyDown(view.container.querySelector('[data-player-stage]')!, { key: 'k' })
  expect(play).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Unlock controls' }))
  expect(shell).toHaveAttribute('data-controls-locked', 'false')
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null })
  fireEvent(document, new Event('fullscreenchange'))
  await waitFor(() => expect(shell).toHaveAttribute('data-fullscreen', 'false'))
})

it('exposes route-owned settings, recovery, theater mode and accurate keyboard help', () => {
  const theater = vi.fn()
  render(<ConsumitPlayer title="Room" watchSettings={<button>Autoplay next episode</button>} watchStatus={<button>Cancel search</button>} onTheaterChange={theater} />)
  expect(screen.getByRole('button', { name: 'Cancel search' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Settings: audio, speed, brightness' }))
  expect(screen.getByRole('button', { name: 'Autoplay next episode' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /^Quality/ })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Theater mode' }))
  expect(theater).toHaveBeenCalledWith(true)
  fireEvent.click(screen.getByRole('button', { name: 'Settings: audio, speed, brightness' }))
  fireEvent.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }))
  expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveTextContent('Back / forward 10s')
})

it('discards uploaded captions when the canonical episode changes with the same title', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('No network') }))
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:uploaded') })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  const view = render(<ConsumitPlayer title="Series" recordingKey="one" src="/one.mp4" />)
  fireEvent.click(screen.getByRole('button', { name: 'Captions' }))
  const file = new File([], 'episode-one.vtt')
  Object.defineProperty(file, 'arrayBuffer', { value: async () => new TextEncoder().encode('WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nFirst episode\n').buffer })
  await act(async () => fireEvent.change(view.container.querySelector('input[type="file"]')!, { target: { files: [file] } }))
  await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled())
  view.rerender(<ConsumitPlayer title="Series" recordingKey="two" src="/two.mp4" />)
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:uploaded')
  fireEvent.click(screen.getByRole('button', { name: 'Captions' }))
  expect(screen.queryByRole('radio', { name: /episode-one/ })).not.toBeInTheDocument()
})

it('dismisses a caption subview to its deck trigger and keeps video unchanged', () => {
  const view = render(<ConsumitPlayer title="Movie" src="/one.mp4" />)
  const video = view.container.querySelector('video')
  const trigger = screen.getByRole('button', { name: 'Captions' })
  fireEvent.click(trigger)
  fireEvent.click(screen.getByRole('button', { name: 'Sync subtitle to audio' }))
  const panel = screen.getByRole('dialog', { name: 'Subtitle sync' })
  fireEvent.keyDown(within(panel).getByRole('button', { name: 'Close subtitle sync' }), { key: 'Escape' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
  expect(view.container.querySelector('video')).toBe(video)
})
