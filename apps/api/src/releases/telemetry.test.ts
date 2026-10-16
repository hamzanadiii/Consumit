import { expect, it, vi } from 'vitest'
const calls = vi.hoisted(() => ({ getMeter: vi.fn(), add: vi.fn(), record: vi.fn() }))
vi.mock('@opentelemetry/api', () => ({ metrics: { getMeter: calls.getMeter } }))
import { recordCatalogRefresh, recordReleaseCheck, recordReleaseQueue } from './telemetry.ts'
it('creates instruments after SDK startup and records anonymous aggregate outcomes', () => {
  expect(calls.getMeter).not.toHaveBeenCalled()
  calls.getMeter.mockReturnValue({ createCounter: () => ({ add: calls.add }), createHistogram: () => ({ record: calls.record }) })
  recordCatalogRefresh('success'); recordReleaseCheck(true, 2); recordReleaseQueue(30)
  expect(calls.getMeter).toHaveBeenCalledTimes(1)
  expect(calls.add.mock.calls).toEqual([[1, { outcome: 'success' }], [1, { outcome: 'passed' }], [2]])
  expect(calls.record).toHaveBeenCalledWith(30)
})
