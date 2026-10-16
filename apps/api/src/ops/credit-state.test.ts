import { expect, it } from 'vitest'
import { creditAction } from './credit-state.ts'
const now = new Date('2026-10-08T00:00:00Z')
const input = { plan: 'FREE', status: 'ACTIVE', balance: 100, expiry: new Date('2027-02-01T00:00:00Z') }
it('alerts before expiry or low credit, and distinguishes unavailable credit from zero', () => {
  expect(creditAction(input, now)).toBe('healthy')
  expect(creditAction({ ...input, balance: 19.99 }, now)).toBe('upgrade_required')
  expect(creditAction({ ...input, expiry: new Date('2026-11-07T00:00:00Z') }, now)).toBe('upgrade_required')
  expect(creditAction({ ...input, balance: undefined }, now)).toBe('unknown')
  expect(creditAction({ ...input, plan: 'PAID' }, now)).toBe('paid')
  expect(creditAction({ ...input, status: 'EXPIRED' }, now)).toBe('account_unavailable')
})
