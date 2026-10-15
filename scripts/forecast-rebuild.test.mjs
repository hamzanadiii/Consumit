import { test } from 'node:test'
import assert from 'node:assert/strict'
import { forecast } from './forecast-rebuild.mjs'
test('separates ordinary API, periodic progress and route-specific media demand', () => {
  const result = forecast()
  assert.equal(result.periodicProgressDaily, 2880000)
  assert.equal(result.periodicProgressPeakRps, 200)
  assert.equal(result.combinedPeakProductRps, 700)
  assert.equal(result.relayDailyGB, 2700)
  assert.equal(result.relayPeakMbps, 1500)
  assert.equal(forecast({ relayFraction: 0 }).relayDailyGB, 0)
})
test('rejects invalid forecasting inputs', () => {
  assert.throws(() => forecast({ progressSeconds: 0 }))
  assert.throws(() => forecast({ relayFraction: 2 }))
})
