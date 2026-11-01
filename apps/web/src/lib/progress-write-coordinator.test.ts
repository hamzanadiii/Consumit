import { expect, it, vi } from 'vitest'
import { createProgressWriteCoordinator } from './progress-write-coordinator'

it('coalesces overlapping lifecycle flushes and permits changed positions and future cadence writes', async () => {
  const coordinator = createProgressWriteCoordinator()
  let finish!: () => void
  const operation = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
  const first = coordinator.write('member:episode:25', true, operation)
  const second = coordinator.write('member:episode:25', true, operation)
  await Promise.resolve()
  expect(operation).toHaveBeenCalledTimes(1)
  finish(); await Promise.all([first, second])
  await coordinator.write('member:episode:50', false, async () => {})
  await coordinator.write('member:episode:25', true, async () => {})
})

it('preserves keepalive durability beside a pending ordinary write', async () => {
  const coordinator = createProgressWriteCoordinator(), operation = vi.fn(async () => {})
  await Promise.all([coordinator.write('same', false, operation), coordinator.write('same', true, operation), coordinator.write('same', true, operation)])
  expect(operation).toHaveBeenCalledTimes(2)
})
