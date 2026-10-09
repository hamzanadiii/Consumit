import { useEffect } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { usePlaybackVerification } from './use-playback-verification'

let verify: ReturnType<typeof usePlaybackVerification>['verify']
let options: Parameters<NonNullable<Window['turnstile']>['render']>[1]
const remove = vi.fn()
function Harness() {
  const verification = usePlaybackVerification()
  useEffect(() => { verify = verification.verify }, [verification.verify])
  return verification.verificationPanel
}
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'fixture-key')
  window.turnstile = { render: vi.fn((_node, settings) => { options = settings; return 'widget' }), remove }
  remove.mockClear()
})
afterEach(() => { delete window.turnstile; vi.unstubAllEnvs(); vi.useRealTimers() })
async function start(signal = new AbortController().signal) {
  let result!: Promise<string | Error>
  await act(async () => { result = verify(signal).catch((error: Error) => error) })
  await waitFor(() => expect(window.turnstile?.render).toHaveBeenCalled())
  return { result }
}
it('shows verification and removes the widget after success', async () => {
  render(<Harness />)
  const { result } = await start()
  expect(screen.getByRole('dialog')).toHaveAccessibleName('Browser verification')
  expect(options).toMatchObject({ sitekey: 'fixture-key', action: 'playback' })
  await act(async () => options.callback('proof'))
  expect(await result).toBe('proof')
  expect(remove).toHaveBeenCalledWith('widget')
  expect(screen.queryByRole('dialog')).toBeNull()
})
it.each(['error-callback', 'expired-callback'] as const)('allows retry after %s', async callback => {
  render(<Harness />)
  const first = await start()
  await act(async () => options[callback]())
  expect(await first.result).toBeInstanceOf(Error)
  const retry = await start()
  await act(async () => options.callback('retry-proof'))
  expect(await retry.result).toBe('retry-proof')
})
it('cancels outstanding verification on abort and unmount', async () => {
  const view = render(<Harness />)
  const controller = new AbortController()
  const first = await start(controller.signal)
  await act(async () => controller.abort())
  expect(await first.result).toBeInstanceOf(Error)
  const second = await start()
  view.unmount()
  expect(await second.result).toBeInstanceOf(Error)
  expect(remove).toHaveBeenCalledTimes(2)
})
it('bounds an unanswered challenge to two minutes', async () => {
  render(<Harness />)
  vi.useFakeTimers()
  let result!: Promise<string | Error>
  await act(async () => { result = verify(new AbortController().signal).catch((error: Error) => error) })
  await act(async () => vi.advanceTimersByTime(120_000))
  expect(await result).toBeInstanceOf(Error)
  expect(screen.queryByRole('dialog')).toBeNull()
})
