import { describe, expect, it } from 'vitest'
import { playbackDeliverySchema, playbackEventsSchema, playbackFailureRequestSchema, playbackSwitchRequestSchema, resolvePlaybackRequestSchema, providerRoleSchema } from './index'

describe('playback preference boundaries', () => {
  it('accepts only named delivery paths and bounded viewing measurements', () => {
    expect(playbackDeliverySchema.options).toEqual(['direct', 'relay', 'embed'])
    expect(playbackDeliverySchema.safeParse('proxy').success).toBe(false)
    expect(playbackEventsSchema.safeParse({ events: [{ type: 'viewing', position: 30, elapsedMs: 5000, delivery: 'relay' }] }).success).toBe(true)
    expect(playbackEventsSchema.safeParse({ events: [{ type: 'viewing', position: 30, elapsedMs: -1, delivery: 'relay' }] }).success).toBe(false)
  })
  it('accepts existing clients and carries a bounded semantic preference on recovery', () => {
    expect(resolvePlaybackRequestSchema.parse({ ref: { kind: 'movie', id: 1 }, capabilities: { hls: true, dash: false, native: true } }).preferences).toBeUndefined()
    expect(playbackFailureRequestSchema.parse({ sourceId: 'main', reason: 'network', preferences: { qualityHeight: null, audioLanguage: 'fr-CA' } }).preferences).toEqual({ qualityHeight: null, audioLanguage: 'fr-CA' })
    expect(playbackSwitchRequestSchema.safeParse({ providerId: 'backup', preferences: { qualityHeight: 720 } }).success).toBe(true)
    for (const qualityHeight of [143, 4321, 720.5, '1080']) expect(playbackFailureRequestSchema.safeParse({ sourceId: 'main', reason: 'network', preferences: { qualityHeight } }).success).toBe(false)
    expect(playbackFailureRequestSchema.safeParse({ sourceId: 'main', reason: 'network', preferences: { audioLanguage: 'English / Japanese' } }).success).toBe(false)
  })
  it('keeps role assignment separate from verification', () => {
    expect(providerRoleSchema.options).toEqual(['video', 'audio', 'both'])
    expect(providerRoleSchema.safeParse('verified').success).toBe(false)
  })
})
