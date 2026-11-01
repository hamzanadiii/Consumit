import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ConsumitPlayer } from './consumit-player'
import { SeparateAudioSyncControl } from './separate-audio-sync-control'
import type { PlayerControlAction } from './player-types'
import * as volumeBoost from './volume-boost'

afterEach(() => vi.restoreAllMocks())

const source = { type: 'native' as const, src: 'https://media.example/movie.mp4' }

it('emits typed source, caption, audio, quality, and playback preference actions', () => {
  const actions: PlayerControlAction[] = []
  render(<ConsumitPlayer
    title="Contract"
    media={{ source }}
    controls={{
      audio: { options: [{ value: 'en', label: 'English' }, { value: 'ja', label: 'Japanese' }], selected: 'en' },
      captions: { options: [{ value: 'en', label: 'English' }, { value: 'off', label: 'Off' }], selected: 'en' },
      quality: { options: [{ value: 'auto', label: 'Auto' }, { value: '1080', label: '1080p' }], selected: 'auto' },
      playback: { autoSkip: false },
      sourceSelection: { options: [{ value: 'primary', label: 'Primary' }, { value: 'backup', label: 'Backup' }], selected: 'primary', requestAvailable: true },
    }}
    onControlAction={action => actions.push(action)}
  />)

  fireEvent.click(screen.getByRole('button', { name: 'Sources' }))
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Sources' })).getByRole('button', { name: 'Backup' }))
  expect(actions).toContainEqual({ type: 'source-change', value: 'backup' })

  fireEvent.click(screen.getByRole('button', { name: 'Captions' }))
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Captions' })).getByRole('radio', { name: 'Off' }))
  expect(actions).toContainEqual({ type: 'subtitle-change', value: 'off' })

  fireEvent.click(screen.getByRole('button', { name: /Settings:/ }))
  fireEvent.click(screen.getByRole('button', { name: /^Audio/ }))
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Audio' })).getByRole('radio', { name: 'Japanese' }))
  expect(actions).toContainEqual({ type: 'audio-change', value: 'ja' })

  fireEvent.click(screen.getByRole('button', { name: /Settings:/ }))
  fireEvent.click(screen.getByRole('button', { name: /^Quality/ }))
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Quality' })).getByRole('radio', { name: '1080p' }))
  expect(actions).toContainEqual({ type: 'quality-change', value: '1080' })

  fireEvent.click(screen.getByRole('button', { name: /Settings:/ }))
  fireEvent.click(screen.getByRole('switch', { name: 'Auto-skip intros and outros' }))
  expect(actions).toContainEqual({ type: 'auto-skip-change', enabled: true })
})

it('reports a viewing preference update after a separate audio adapter succeeds', async () => {
  const audioSource = {
    id: 'ja-track',
    label: 'Japanese',
    language: 'ja',
    provider: 'fixture',
    src: 'https://media.example/japanese-audio.m3u8',
    duration: 100,
    expiresAt: '2027-01-01T00:00:00.000Z',
  }
  const mediaSource = { type: 'native' as const, src: 'https://media.example/movie.mp4' }
  const actions: PlayerControlAction[] = []
  const boost = { unlock: vi.fn(async () => {}), output: vi.fn(async () => {}), set: vi.fn(async (value: number) => value), dispose: vi.fn() }
  vi.spyOn(volumeBoost, 'createVolumeBoost').mockReturnValue(boost)
  vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('probably')
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})

  const view = render(<ConsumitPlayer
    title="Separate audio preference"
    media={{ source: mediaSource }}
    controls={{ audio: { options: [], separate: { tracks: [{ id: 'ja-track', label: 'Japanese', language: 'ja', provider: 'fixture' }], select: vi.fn().mockResolvedValue(audioSource) } }}}
    onControlAction={action => actions.push(action)}
  />)
  const video = view.container.querySelector('video')!
  const audio = view.container.querySelector('audio')!
  Object.defineProperty(video, 'duration', { configurable: true, value: 100 })

  fireEvent.click(screen.getByRole('button', { name: /Settings:/ }))
  fireEvent.click(screen.getByRole('button', { name: /^Audio/ }))
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Audio' })).getByRole('radio', { name: 'Japanese' }))
  await waitFor(() => expect(audio).toHaveAttribute('src', audioSource.src))
  fireEvent.canPlay(audio)
  await waitFor(() => expect(actions).toContainEqual({ type: 'viewing-preferences-change', value: { audioLanguage: 'ja' } }))
})

it('makes the separate audio sync reset a 44px keyboard-visible control', () => {
  const onChange = vi.fn()
  const onReset = vi.fn()
  const view = render(<SeparateAudioSyncControl offset={0} warning="Different recordings may need a sync adjustment." onChange={onChange} onReset={onReset} />)
  const audioSync = screen.getByRole('slider', { name: 'Audio sync' })
  fireEvent.change(audioSync, { target: { value: '0.1' } })
  expect(onChange).toHaveBeenCalledWith(0.1)
  view.rerender(<SeparateAudioSyncControl offset={0.1} warning="Different recordings may need a sync adjustment." onChange={onChange} onReset={onReset} />)
  expect(screen.getByText('+0.1s')).toBeInTheDocument()

  const reset = screen.getByRole('button', { name: 'Reset audio sync' })
  expect(reset).toHaveClass('min-h-11')
  expect(reset).toHaveClass('focus-visible:ring-2')
  fireEvent.click(reset)
  expect(onReset).toHaveBeenCalledOnce()
  view.unmount()
})

it('uses typed async subtitle and cast adapters and reports cast intent', async () => {
  const page = vi.fn().mockResolvedValue({ tracks: [], total: 0, nextCursor: null })
  const check = vi.fn().mockResolvedValue('ready' as const)
  const actions: PlayerControlAction[] = []
  render(<ConsumitPlayer
    title="Async controls"
    media={{ source }}
    controls={{
      captions: { discovery: { languages: [{ code: 'en', count: 1 }], providers: [], loading: false, error: null }, page },
      cast: { available: false, canConnect: true, check },
    }}
    onControlAction={action => actions.push(action)}
  />)

  fireEvent.click(screen.getByRole('button', { name: 'Captions' }))
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Captions' })).getByRole('button', { name: /English.*1/ }))
  await waitFor(() => expect(page).toHaveBeenCalledWith('en', 0))

  fireEvent.click(screen.getByRole('button', { name: /Settings:/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Cast to TV' }))
  await waitFor(() => expect(check).toHaveBeenCalledOnce())
  fireEvent.click(await screen.findByRole('button', { name: 'Choose TV' }))
  expect(actions).toContainEqual({ type: 'cast-click' })
})

it('keeps recovery choices on the action channel and opens the source deck', () => {
  const actions: PlayerControlAction[] = []
  render(<ConsumitPlayer
    title="Recovery"
    media={{ source }}
    presentation={{ recovery: { phase: 'searching', kind: 'startup', progress: { checked: 1, total: 2 } } }}
    controls={{ sourceSelection: {
      options: [{ value: 'primary', label: 'Primary' }, { value: 'backup', label: 'Backup' }],
      requestAvailable: true, recoveryCancelAvailable: true, recoveryChooseAvailable: true,
    } }}
    onControlAction={action => actions.push(action)}
  />)

  fireEvent.click(screen.getByRole('button', { name: 'Choose a source' }))
  expect(actions).toContainEqual({ type: 'recovery-cancel' })
  expect(actions).toContainEqual({ type: 'recovery-choose-source' })
  expect(actions).toContainEqual({ type: 'source-request' })
  expect(screen.getByRole('dialog', { name: 'Sources' })).toBeInTheDocument()
})
