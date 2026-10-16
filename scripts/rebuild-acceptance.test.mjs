import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertRebuildAcceptance } from './rebuild-acceptance.mjs'

const release = 'rebuild-20261014-v4'
const evidence = { release, deploymentRequested: true, nodeMemberFlow: true, restoreDrill: true, measuredHeadroom: true, ordinaryApiBudgets: true, usesExistingHost: true, newPaidServices: false, deferredChecks: ['physical phones', 'field playback', 'total recurring cost'] }
test('limited authorized canaries record deferred evidence without claiming full acceptance', () => {
  assert.doesNotThrow(() => assertRebuildAcceptance(evidence, release, 1, 'canary'))
  for (const percentage of [0, 6, 100]) assert.throws(() => assertRebuildAcceptance(evidence, release, percentage, 'canary'))
  for (const change of [{ deploymentRequested: false }, { newPaidServices: true }, { deferredChecks: [] }, { nodeMemberFlow: false }]) assert.throws(() => assertRebuildAcceptance({ ...evidence, ...change }, release, 1, 'canary'))
})
test('full promotion still requires phones, performance and the complete measured budget', () => {
  assert.throws(() => assertRebuildAcceptance(evidence, release, 100, 'up'))
  const complete = { ...evidence, physicalAndroid: true, physicalSafari: true, latencyBudgets: true, playbackBudgets: true, recurringMAD: 200 }
  assert.doesNotThrow(() => assertRebuildAcceptance(complete, release, 100, 'up'))
  assert.throws(() => assertRebuildAcceptance({ ...complete, recurringMAD: 251 }, release, 100, 'up'))
})
