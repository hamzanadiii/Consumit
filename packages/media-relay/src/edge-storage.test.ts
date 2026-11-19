import { describe, expect, it } from 'vitest'
import { createR2SubtitleFiles, type EdgeBucket } from './edge-storage.ts'

describe('R2 subtitle retention', () => {
  it('stores immutable prepared files for seven days and refuses expired or malformed keys', async () => {
    let now = 0
    const objects = new Map<string, { value: string; customMetadata: Record<string, string> }>()
    const bucket: EdgeBucket = {
      async get(key) { const row = objects.get(key); return row ? { text: async () => row.value, customMetadata: row.customMetadata } : null },
      async put(key, value, options) { objects.set(key, { value, customMetadata: options.customMetadata }) },
      async delete(key) { objects.delete(key) },
    }
    const files = createR2SubtitleFiles(bucket, () => now), key = '1234567890abcdef'
    await files.putVtt(key, 'WEBVTT', { content: 'fixture', ttlSeconds: 604800 })
    expect(await files.getVtt(key)).toBe('WEBVTT')
    now = 7 * 86400_000
    expect(await files.getVtt(key)).toBeNull()
    expect(objects.size).toBe(0)
    expect(await files.getVtt('../private')).toBeNull()
  })
})
