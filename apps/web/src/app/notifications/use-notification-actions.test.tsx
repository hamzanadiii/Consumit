import { renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { useNotificationActions } from './use-notification-actions'

vi.mock('../session/session', () => ({ useSession: () => ({ member: null }) }))

it('keeps guest notification actions idle before any request', async () => {
  const refresh = vi.fn(), navigate = vi.fn()
  const { result } = renderHook(() => useNotificationActions(refresh, navigate))
  expect(result.current.busy).toBe(false)
  expect(result.current.error).toBeUndefined()
  await result.current.read()
  expect(refresh).not.toHaveBeenCalled()
  expect(navigate).not.toHaveBeenCalled()
})
