import { test } from 'node:test'
import assert from 'node:assert/strict'
import { recoveryTarget } from './recovery-target.mjs'
test('preserves the UTC recovery instant in the pgBackRest timestamp syntax', () => {
  assert.equal(recoveryTarget('2026-10-13T20:38:45.197Z'), '2026-10-13 20:38:45.197+00')
  assert.equal(recoveryTarget('2026-10-13T20:38:45Z'), '2026-10-13 20:38:45.000+00')
})
test('requires explicit valid UTC instants', () => {
  for (const value of ['now', '2026-10-13 20:38:45', '2026-10-13T20:38:45+01:00', '2026-99-13T20:38:45Z']) assert.throws(() => recoveryTarget(value))
})
