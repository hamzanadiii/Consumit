import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ConsumitPlayer } from './consumit-player'

const originalNativeFullscreen = Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, 'webkitEnterFullscreen')
const originalContainerFullscreen = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'requestFullscreen')

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
  if (originalNativeFullscreen) Object.defineProperty(HTMLVideoElement.prototype, 'webkitEnterFullscreen', originalNativeFullscreen)
  else Reflect.deleteProperty(HTMLVideoElement.prototype, 'webkitEnterFullscreen')
  if (originalContainerFullscreen) Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', originalContainerFullscreen)
  else Reflect.deleteProperty(HTMLElement.prototype, 'requestFullscreen')
})

it('uses true iOS video fullscreen for uploaded subtitles instead of leaving Safari chrome visible', async () => {
  let nativeFullscreen = false
  Object.defineProperty(HTMLVideoElement.prototype, 'webkitEnterFullscreen', { configurable: true, value: vi.fn(() => { nativeFullscreen = true }) })
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => `blob:${window.location.origin}/uploaded`) })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  const view = render(<ConsumitPlayer title="iPhone captions" source={{ type: 'native', src: 'https://media.example/movie.mp4' }} />)
  const video = view.container.querySelector('video')!
  const file = new File([], 'captions.srt')
  Object.defineProperty(file, 'text', { value: async () => '1\n00:00:01,000 --> 00:00:04,000\nVisible on iPhone\n' })
  fireEvent.click(screen.getByRole('button', { name: 'Subtitles' }))
  fireEvent.change(view.container.querySelector('input[type="file"]')!, { target: { files: [file] } })
  await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledOnce())
  video.currentTime = 2
  fireEvent.timeUpdate(video)
  const caption = await waitFor(() => {
    const node = view.container.querySelector('[data-consumit-player-caption]')!
    expect(node).toHaveTextContent('Visible on iPhone')
    return node
  })
  fireEvent.click(screen.getByRole('button', { name: 'Enter fullscreen' }))
  await waitFor(() => expect(nativeFullscreen).toBe(true))
  expect(view.container.querySelector('[data-consumit-player]')).not.toHaveAttribute('data-viewport-fullscreen')
  expect(video).toHaveAttribute('data-native-fullscreen', 'true')
  expect(video.currentTime).toBe(2)
  fireEvent(video, new Event('webkitendfullscreen'))
  expect(view.container.querySelector('[data-consumit-player]')).toHaveAttribute('data-fullscreen', 'false')
  expect(caption).toHaveTextContent('Visible on iPhone')
})

it('recovers a denied container fullscreen request and restores page state on Escape and unmount', async () => {
  Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { configurable: true, value: vi.fn().mockRejectedValue(new Error('Not supported')) })
  const view = render(<><button>Outside player</button><ConsumitPlayer title="Fullscreen denied" src="/fixture.mp4" caption="Keep this line" /></>)
  const outside = screen.getByRole('button', { name: 'Outside player' })
  const previousInert = outside.inert
  const previousOverflow = document.body.style.overflow
  outside.focus()
  fireEvent.click(screen.getByRole('button', { name: 'Enter fullscreen' }))
  await waitFor(() => expect(view.container.querySelector('[data-consumit-player]')).toHaveAttribute('data-viewport-fullscreen', 'true'))
  expect(outside.inert).toBe(true)
  expect(screen.getByRole('button', { name: 'Exit fullscreen' })).toHaveFocus()
  expect(document.body.style.overflow).toBe('hidden')
  expect(view.container.querySelector('[data-consumit-player-caption]')).toHaveTextContent('Keep this line')
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(outside.inert).toBe(previousInert)
  expect(outside).toHaveFocus()
  expect(document.body.style.overflow).toBe(previousOverflow)
  expect(view.container.querySelector('[data-consumit-player]')).toHaveAttribute('data-fullscreen', 'false')
  fireEvent.click(screen.getByRole('button', { name: 'Enter fullscreen' }))
  await waitFor(() => expect(outside.inert).toBe(true))
  view.unmount()
  expect(document.body.style.overflow).toBe(previousOverflow)
})

it('keeps using successful container fullscreen instead of the viewport fallback', async () => {
  const request = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { configurable: true, value: request })
  const view = render(<ConsumitPlayer title="Container fullscreen" src="/fixture.mp4" caption="Container caption" />)
  fireEvent.click(screen.getByRole('button', { name: 'Enter fullscreen' }))
  await waitFor(() => expect(request).toHaveBeenCalledOnce())
  expect(view.container.querySelector('[data-consumit-player]')).not.toHaveAttribute('data-viewport-fullscreen')
  expect(document.body.style.overflow).not.toBe('hidden')
})

it('keeps inline playback and offers retry when iOS refuses native fullscreen', async () => {
  Object.defineProperty(HTMLVideoElement.prototype, 'webkitEnterFullscreen', { configurable: true, value: vi.fn(() => { throw new Error('Denied') }) })
  const view = render(<ConsumitPlayer title="Native denial" src="/fixture.mp4" caption="Keep this line" />)
  fireEvent.click(screen.getByRole('button', { name: 'Enter fullscreen' }))
  expect(view.container.querySelector('[data-consumit-player]')).not.toHaveAttribute('data-viewport-fullscreen')
  expect(view.container.querySelector('video')).not.toHaveAttribute('data-native-fullscreen')
  expect(screen.getByRole('alert')).toHaveTextContent('Fullscreen could not open')
  expect(view.container.querySelector('[data-consumit-player-caption]')).toHaveTextContent('Keep this line')
})
