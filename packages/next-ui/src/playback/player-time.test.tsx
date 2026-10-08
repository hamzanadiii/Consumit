import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { ConsumitPlayer } from './consumit-player'

it('switches elapsed and remaining time without seeking or changing play intent', () => {
  const view = render(<ConsumitPlayer title="Time fixture" src="/fixture.mp4" />)
  const video = view.container.querySelector('video')!
  Object.defineProperty(video, 'duration', { configurable: true, value: 120 })
  video.currentTime = 30
  fireEvent.loadedMetadata(video); fireEvent.timeUpdate(video)
  const control = screen.getByRole('button', { name: 'Show remaining time' })
  control.focus(); fireEvent.click(control)
  expect(screen.getByRole('button', { name: 'Show elapsed time' })).toHaveTextContent('1:30 left')
  expect(control).toHaveFocus()
  expect(video.currentTime).toBe(30)
  expect(video.paused).toBe(true)
  fireEvent.click(control)
  expect(control).toHaveTextContent('0:30 / 2:00')
})
