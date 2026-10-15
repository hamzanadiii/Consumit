import { afterEach, expect, it, vi } from 'vitest'
import { startPlaybackTelemetry } from './telemetry'

const { shutdown } = vi.hoisted(() => ({ shutdown: vi.fn(async () => { throw new Error('private-exporter-details') }) }))
vi.mock('@opentelemetry/sdk-node', () => ({ NodeSDK: class { start() {} shutdown = shutdown } }))
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

it('drains telemetry without failing process shutdown when the collector is unavailable', async () => {
  vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://127.0.0.1:1')
  const output = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
  const telemetry = startPlaybackTelemetry()
  await expect(telemetry.shutdown()).resolves.toBeUndefined()
  expect(shutdown).toHaveBeenCalledOnce()
  expect(output).toHaveBeenCalledExactlyOnceWith('{"event":"telemetry_shutdown_incomplete"}\n')
})
