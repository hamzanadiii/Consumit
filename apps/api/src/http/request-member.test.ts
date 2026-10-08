import { describe, expect, it, vi } from 'vitest'
import { requestMember } from './request-member.ts'

describe('request authentication reuse', () => {
  it('shares only one lookup per request and rechecks the next request', async () => {
    const identity = { getSession: vi.fn().mockResolvedValue(null) }
    const request = { cookies: { consumit_session: 'a'.repeat(43) } }
    await Promise.all([requestMember(request, identity, 'consumit_session'), requestMember(request, identity, 'consumit_session')])
    expect(identity.getSession).toHaveBeenCalledOnce()
    await requestMember({ ...request }, identity, 'consumit_session')
    expect(identity.getSession).toHaveBeenCalledTimes(2)
  })
  it('rejects malformed tokens before accessing identity storage', async () => {
    const identity = { getSession: vi.fn() }
    expect(await requestMember({ cookies: { consumit_session: 'malformed' } }, identity, 'consumit_session')).toBeNull()
    expect(identity.getSession).not.toHaveBeenCalled()
  })
})
