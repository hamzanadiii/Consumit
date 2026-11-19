import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ConsumitPlayer } from './consumit-player'

const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nUploaded caption\n'

afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it.each(['srt', 'vtt'])('selects an uploaded %s and renders its cues after track reconciliation', async (extension) => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => vtt })))
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => `blob:${window.location.origin}/uploaded`) })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  const source = { type: 'native' as const, src: 'https://media.example/movie.mp4', subtitles: [{ id: 'english', label: 'English', language: 'en', url: 'https://media.example/english.vtt' }] }
  // jsdom has no native cue loader; use the player's parsed-cue sync path.
  const view = render(<ConsumitPlayer title="Upload fixture" media={{ source }} controls={{ captions: { sync: { delayMs: 50 } }, preferences: { initialViewing: { qualityHeight: null, subtitlesEnabled: true, subtitleLanguages: ['en'] } } }} />)
  const video = view.container.querySelector('video')!
  fireEvent.loadedMetadata(video)
  fireEvent.click(screen.getByRole('button', { name: 'Captions' }))
  const file = new File([], `captions.${extension}`)
  Object.defineProperty(file, 'arrayBuffer', { value: async () => new TextEncoder().encode(extension === 'srt' ? '1\n00:00:01,000 --> 00:00:04,000\nUploaded caption\n' : vtt).buffer })
  fireEvent.change(view.container.querySelector('input[type="file"]')!, { target: { files: [file] } })
  await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(1))
  fireEvent.click(screen.getByRole('button', { name: 'Captions' }))
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'captions.' } })
  await waitFor(() => expect(screen.getByRole('radio', { name: /captions\./ })).toHaveAttribute('aria-checked', 'true'))
  video.currentTime = 2
  fireEvent.timeUpdate(video)
  await waitFor(() => expect(view.container.querySelector('[data-consumit-player-caption]')?.textContent).toContain('Uploaded caption'))
})

it.each(['srt', 'vtt'])('keeps uploaded %s lines visible across the timeline without native cues or refetching the file', async (extension) => {
  const fetch = vi.fn(async () => { throw new Error('Native cue loading unavailable') })
  vi.stubGlobal('fetch', fetch)
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => `blob:${window.location.origin}/uploaded`) })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  const view = render(<ConsumitPlayer title="Upload timeline" media={{ source: { type: 'native', src: 'https://media.example/movie.mp4' } }} />)
  const video = view.container.querySelector('video')!
  const file = new File([], `captions.${extension}`)
  const body = '00:00:01.000 --> 00:00:04.000\nFirst line\n\n00:00:30.000 --> 00:00:35.000\nLater line\n\n00:01:10.000 --> 00:01:15.000\nLast line\n'
  Object.defineProperty(file, 'arrayBuffer', { value: async () => new TextEncoder().encode(extension === 'srt' ? body.replaceAll('.', ',') : `WEBVTT\n\n${body}`).buffer })
  fireEvent.click(screen.getByRole('button', { name: 'Captions' }))
  fireEvent.change(view.container.querySelector('input[type="file"]')!, { target: { files: [file] } })
  await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledOnce())
  for (const [time, text] of [[2, 'First line'], [32, 'Later line'], [72, 'Last line'], [2, 'First line']] as const) {
    video.currentTime = time
    fireEvent.timeUpdate(video)
    await waitFor(() => expect(view.container.querySelector('[data-consumit-player-caption]')).toHaveTextContent(text))
  }
  video.currentTime = 20
  fireEvent.timeUpdate(video)
  await waitFor(() => expect(view.container.querySelector('[data-consumit-player-caption]')).toBeNull())
  expect(fetch).not.toHaveBeenCalled()
})

it('decodes a legacy Windows-1256 Arabic upload and renders its cues', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Uploaded cues are cached locally') }))
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => `blob:${window.location.origin}/arabic-upload`) })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  const view = render(<ConsumitPlayer title="Arabic upload" media={{ source: { type: 'native', src: 'https://media.example/movie.mp4' } }} />)
  const video = view.container.querySelector('video')!
  const file = new File([], 'arabic.vtt')
  fireEvent.click(screen.getByRole('button', { name: 'Captions' }))
  const header = new TextEncoder().encode('WEBVTT\n\n00:00:01.000 --> 00:00:04.000\n')
  const word = new Uint8Array([0xe3, 0xd1, 0xcd, 0xc8, 0xc7])
  const bytes = new Uint8Array(header.length + word.length * 3 + 4)
  bytes.set(header)
  let offset = header.length
  for (let i = 0; i < 3; i++) {
    bytes.set(word, offset)
    offset += word.length
    bytes[offset++] = 0x20
  }
  bytes[offset] = 0x0a
  Object.defineProperty(file, 'arrayBuffer', { value: async () => bytes.buffer })
  fireEvent.change(view.container.querySelector('input[type="file"]')!, { target: { files: [file] } })
  await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledOnce())
  video.currentTime = 2
  fireEvent.timeUpdate(video)
  await waitFor(() => expect(view.container.querySelector('[data-consumit-player-caption]')).toHaveTextContent('مرحبا مرحبا مرحبا'))
})
