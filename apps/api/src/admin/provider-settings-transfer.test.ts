import { describe, expect, it } from 'vitest'
import { parseProviderSettingsTransfer } from './provider-settings-transfer.ts'

const row = (id: string) => ({ adapter: 'static', id, enabled: true, mediaKinds: ['movie', 'series'], regions: ['US'], mediaHosts: ['media.example'], entries: [] })
const snapshot = () => ({ version: 1, base: [row('first'), row('second'), row('audio'), row('removed')], overrides: {
  first: { enabled: false, order: { movie: 1, series: 0 } }, second: { deliveryMode: 'relay', role: 'both', order: { movie: 0, series: 1 }, requestsPerMinute: 12, concurrency: 1 }, audio: { role: 'audio' }, removed: { removed: true, enabled: false },
} })

describe('private provider settings transfer', () => {
  it('retains disabled positions, independent kind order, delivery, roles and limits', () => {
    const result = parseProviderSettingsTransfer(snapshot())
    expect(result.orders).toEqual({ movie: ['second', 'first'], series: ['first', 'second'], anime: [] })
    expect(result.overrides).toEqual(snapshot().overrides)
  })
  it('rejects member data and arbitrary override fields rather than importing them', () => {
    expect(() => parseProviderSettingsTransfer({ ...snapshot(), members: [] })).toThrow()
    expect(() => parseProviderSettingsTransfer({ ...snapshot(), overrides: { first: { token: 'private' } } })).toThrow()
  })
  it('rejects unknown providers, region expansion, and adapter delivery-boundary changes', () => {
    expect(() => parseProviderSettingsTransfer({ ...snapshot(), overrides: { other: { enabled: true } } })).toThrow('outside')
    expect(() => parseProviderSettingsTransfer({ ...snapshot(), overrides: { first: { regions: ['FR'] } } })).toThrow('regions')
    expect(() => parseProviderSettingsTransfer({ ...snapshot(), overrides: { first: { deliveryMode: 'embed' } } })).toThrow('boundary')
  })
  it('applies the configured-input destination validation to the transferred base', () => {
    expect(() => parseProviderSettingsTransfer({ version: 1, base: [{ ...row('first'), mediaHosts: ['*.workers.dev'] }], overrides: {} })).toThrow()
    expect(() => parseProviderSettingsTransfer({ ...snapshot(), base: [row('first'), row('first')] })).toThrow('Duplicate')
  })
})
